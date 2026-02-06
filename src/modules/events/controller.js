import { sql } from '../../config/db.js';
import { broadcastUpdate } from '../../services/broadcast.js';
import { findMonitoredPath } from '../../utils/monitored_paths.js';

export const reportEvent = async (req, res) => {
    try {
        const {
            id, event_type, file_path, old_hash, new_hash,
            root_hash, merkle_proof, last_valid_hash, timestamp
        } = req.body;

        const client_id = req.daemon.client_id;
        if (!event_type) return res.status(400).json({ error: 'event_type is required' });

        const clientResult = await sql`
      SELECT current_root_hash, integrity_status FROM clients WHERE client_id = ${client_id}
    `;

        const client = clientResult[0];
        let attestation_valid = true;

        if (client?.current_root_hash && last_valid_hash && client.current_root_hash !== last_valid_hash) {
            attestation_valid = false;
            console.warn(`Attestation FAILED for ${client_id}: expected ${client.current_root_hash}, got ${last_valid_hash}`);

            await sql`
        UPDATE clients SET attestation_valid = false, last_seen = CURRENT_TIMESTAMP
        WHERE client_id = ${client_id}
      `;

            return res.status(400).json({
                error: 'Hash chain mismatch - possible tampering detected',
                expected_hash: client.current_root_hash,
                received_hash: last_valid_hash
            });
        }

        const existingEvent = await sql`SELECT id FROM events WHERE client_event_id = ${id}`;
        if (existingEvent?.length > 0) {
            return res.json({
                status: 'success',
                message: 'Duplicate event acknowledged',
                event_id: existingEvent[0].id,
                validation: { timestamp: new Date().toISOString(), attestation_valid: true }
            });
        }

        const result = await sql`
      INSERT INTO events (
        client_event_id, client_id, event_type, file_path, old_hash, new_hash, 
        root_hash, merkle_proof, last_valid_hash, reviewed, 
        timestamp, acknowledged
      )
      VALUES (
        ${id}, ${client_id}, ${event_type}, ${file_path}, ${old_hash}, ${new_hash}, 
        ${root_hash}, ${JSON.stringify(merkle_proof)}, ${last_valid_hash}, 
        false, ${timestamp || new Date().toISOString()}, false
      )
      RETURNING id
    `;

        const event_id = result[0].id;

        if (event_type === 'directory_selected') {
            await sql`
        INSERT INTO monitored_paths (client_id, directory_path, root_hash)
        VALUES (${client_id}, ${file_path}, ${root_hash})
        ON CONFLICT (client_id, directory_path) 
        DO UPDATE SET root_hash = EXCLUDED.root_hash, updated_at = CURRENT_TIMESTAMP
      `;
        } else {
            const monitored = await findMonitoredPath(client_id, file_path);

            if (!monitored) {
                console.warn(`Untracked path reported by ${client_id}: ${file_path}`);
            } else if (last_valid_hash !== monitored.root_hash) {
                attestation_valid = false;
                console.error(`Attestation FAILED for ${client_id} on ${file_path}: Expected ${monitored.root_hash}, got ${last_valid_hash}`);

                await sql`
          INSERT INTO events (client_id, event_type, file_path, old_hash, new_hash, timestamp, reviewed)
          VALUES (${client_id}, 'attestation_failed', ${file_path}, ${monitored.root_hash}, ${last_valid_hash}, CURRENT_TIMESTAMP, false)
        `;

                await sql`UPDATE clients SET attestation_valid = false WHERE client_id = ${client_id}`;

                return res.status(400).json({
                    error: 'Hash chain attestation failed',
                    expected: monitored.root_hash,
                    received: last_valid_hash
                });
            }
        }

        let statusUpdate = sql`
      UPDATE clients SET last_seen = CURRENT_TIMESTAMP, attestation_valid = ${attestation_valid}
      WHERE client_id = ${client_id}
    `;

        if (!['directory_selected', 'directory_unselected'].includes(event_type)) {
            statusUpdate = sql`
        UPDATE clients 
        SET last_seen = CURRENT_TIMESTAMP, attestation_valid = ${attestation_valid}, integrity_status = 'modified'
        WHERE client_id = ${client_id}
      `;
        }

        await statusUpdate;

        res.json({
            status: 'success',
            message: 'Event verified',
            event_id: event_id,
            validation: { timestamp: new Date().toISOString(), attestation_valid, accepted: true, server_recorded: true }
        });

        broadcastUpdate(client_id, 'event_reported');
    } catch (error) {
        console.error('Event reporting error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const acknowledgeEvent = async (req, res) => {
    try {
        const { event_id, validation_received } = req.body;
        const client_id = req.daemon.client_id;

        if (!event_id) {
            return res.status(400).json({ error: 'event_id is required' });
        }

        const eventResult = await sql`
      SELECT event_type, file_path, root_hash, acknowledged 
      FROM events 
      WHERE id = ${event_id} AND client_id = ${client_id}
    `;

        if (eventResult.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const event = eventResult[0];

        if (event.acknowledged) {
            return res.json({
                status: 'success',
                message: 'Already acknowledged'
            });
        }

        await sql`
      UPDATE events 
      SET acknowledged = true, 
          acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = ${event_id}
    `;

        const monitored = await findMonitoredPath(client_id, event.file_path);
        if (monitored) {
            await sql`
        UPDATE monitored_paths 
        SET root_hash = ${event.root_hash}, updated_at = CURRENT_TIMESTAMP
        WHERE client_id = ${client_id} AND directory_path = ${monitored.directory_path}
      `;
        }

        await sql`
      UPDATE clients 
      SET current_root_hash = ${event.root_hash},
          last_seen = CURRENT_TIMESTAMP,
          integrity_change_count = integrity_change_count + 1
      WHERE client_id = ${client_id}
    `;

        console.log(`Event ${event_id} acknowledged by ${client_id} - hash updated to ${event.root_hash}`);

        res.json({
            status: 'success',
            message: 'Acknowledgement received',
            hash_updated: true
        });

        broadcastUpdate(client_id, 'event_acknowledged');
    } catch (error) {
        console.error('Error processing acknowledgement:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getClientEvents = async (req, res) => {
    try {
        const { client_id } = req.params;
        const { unreviewed_only = false, limit = 100, sort = 'desc' } = req.query;
        const isAsc = sort.toLowerCase() === 'asc';
        const limitNum = parseInt(limit);

        let result;
        if (unreviewed_only === 'true') {
            if (isAsc) {
                result = await sql`
          SELECT * FROM events 
          WHERE client_id = ${client_id} AND reviewed = false
          ORDER BY timestamp ASC 
          LIMIT ${limitNum}
        `;
            } else {
                result = await sql`
          SELECT * FROM events 
          WHERE client_id = ${client_id} AND reviewed = false
          ORDER BY timestamp DESC 
          LIMIT ${limitNum}
        `;
            }
        } else {
            if (isAsc) {
                result = await sql`
          SELECT * FROM events 
          WHERE client_id = ${client_id}
          ORDER BY timestamp ASC 
          LIMIT ${limitNum}
        `;
            } else {
                result = await sql`
          SELECT * FROM events 
          WHERE client_id = ${client_id}
          ORDER BY timestamp DESC 
          LIMIT ${limitNum}
        `;
            }
        }
        res.json({ events: result });
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const reviewEvent = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await sql`
      UPDATE events 
      SET reviewed = true, 
          reviewed_at = CURRENT_TIMESTAMP, 
          reviewed_by = ${req.user.username}
      WHERE id = ${id}
      RETURNING client_id
    `;

        if (result.length > 0) {
            const client_id = result[0].client_id;
            await sql`UPDATE clients SET last_reviewed_at = CURRENT_TIMESTAMP WHERE client_id = ${client_id}`;

            const pending = await sql`SELECT count(*) as count FROM events WHERE client_id = ${client_id} AND reviewed = false`;
            if (parseInt(pending[0].count) === 0) {
                await sql`UPDATE clients SET integrity_status = 'clean' WHERE client_id = ${client_id}`;
            }
        }

        res.json({ status: 'success', message: 'Event reviewed' });
    } catch (error) {
        console.error('Error reviewing event:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
