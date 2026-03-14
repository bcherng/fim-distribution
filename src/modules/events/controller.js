import { sql } from '../../config/db.js';
import { broadcastUpdate } from '../../services/broadcast.js';
import { findMonitoredPath } from '../../utils/monitored_paths.js';
import { EventService } from '../../services/events.js';
import { signPayload } from '../../utils/crypto.js';
import crypto from 'crypto';

/**
 * Securely report a file integrity event.
 */
export const reportEvent = async (req, res) => {
    try {
        const {
            id, event_type, file_path, old_hash, new_hash,
            root_hash, merkle_proof, last_valid_hash, timestamp,
            tracked_file_count, event_hash, prev_event_hash, signature
        } = req.body;

        const client_id = req.daemon.client_id;
        if (!event_type) return res.status(400).json({ error: 'event_type is required' });

        const client = await EventService.getClientIntegrity(client_id);
        let is_attested = true;

        const isLifecycleEvent = ['directory_selected', 'directory_unselected'].includes(event_type);

        // Rolling hash chain check: compare incoming last_valid_hash against the
        // last event_hash the server accepted for this client.
        if (!isLifecycleEvent && client?.last_accepted_event_hash && last_valid_hash) {
            if (client.last_accepted_event_hash !== last_valid_hash) {
                is_attested = false;

                await EventService.failPathAttestation(client_id, file_path || 'GLOBAL', client.last_accepted_event_hash, last_valid_hash);

                const response = {
                    error: 'Hash chain desynchronization detected',
                    expected_hash: client.last_accepted_event_hash,
                    received_hash: last_valid_hash
                };
                response.signature = signPayload(response);
                return res.status(400).json(response);
            }
        }

        if (event_hash) {
            const expectedHash = crypto.createHash('sha256')
                .update(`${id}${prev_event_hash || ''}${last_valid_hash || ''}${new_hash || ''}`)
                .digest('hex');

            if (expectedHash !== event_hash) {
                const response = {
                    error: 'Event hash chaining verification failed',
                    expected: expectedHash,
                    received: event_hash
                };
                response.signature = signPayload(response);
                return res.status(400).json(response);
            }
        }

        const existingEventId = await EventService.getDuplicateEventId(id);
        if (existingEventId) {
            const response = {
                status: 'success',
                message: 'Duplicate event acknowledged',
                event_id: existingEventId,
                validation: { timestamp: new Date().toISOString(), is_attested: true }
            };
            response.signature = signPayload(response);
            return res.json(response);
        }

        const event_id = await EventService.insertEvent({
            id, client_id, event_type, file_path, old_hash, new_hash,
            root_hash, merkle_proof, last_valid_hash, timestamp,
            event_hash, prev_event_hash, signature
        });

        if (event_type === 'directory_selected') {
            await EventService.insertOrUpdateMonitoredPath(client_id, file_path, root_hash, tracked_file_count);
        } else {
            const monitored = await findMonitoredPath(client_id, file_path);

            if (!monitored) {
                console.warn(`Untracked path reported by ${client_id}: ${file_path}`);
            } else if (last_valid_hash !== monitored.root_hash) {
                is_attested = false;
                console.error(`Local Integrity Desync for ${client_id} on ${file_path}: Expected ${monitored.root_hash}, got ${last_valid_hash}`);

                await EventService.failPathAttestation(client_id, file_path, monitored.root_hash, last_valid_hash);

                const response = {
                    error: 'Local integrity verification failure',
                    expected: monitored.root_hash,
                    received: last_valid_hash
                };
                response.signature = signPayload(response);
                return res.status(400).json(response);
            }
        }

        await EventService.updateClientStatusOnEvent(client_id, is_attested, event_type);

        // Advance the rolling chain anchor to this event's root_hash.
        // The client (queue_manager.py) stores root_hash as last_valid_hash after each sync,
        // so the next event's last_valid_hash will equal this value.
        if (root_hash && is_attested && !isLifecycleEvent) {
            await EventService.updateLastAcceptedHash(client_id, root_hash);
        }

        const response = {
            status: 'success',
            message: 'Event verified and recorded',
            event_id: event_id,
            validation: { timestamp: new Date().toISOString(), is_attested, accepted: true, server_recorded: true }
        };
        response.signature = signPayload(response);
        res.json(response);

        broadcastUpdate(client_id, 'event_reported');
    } catch (error) {
        console.error('Event reporting error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Acknowledge receipt of a validated event from the daemon.
 */
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
            const response = {
                status: 'success',
                message: 'Already acknowledged'
            };
            response.signature = signPayload(response);
            return res.json(response);
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
      UPDATE endpoints 
      SET current_root_hash = ${event.root_hash},
          last_seen = CURRENT_TIMESTAMP,
          integrity_change_count = integrity_change_count + 1
      WHERE client_id = ${client_id}
    `;

        const response = {
            status: 'success',
            message: 'Acknowledgement received',
            hash_updated: true
        };
        response.signature = signPayload(response);
        res.json(response);

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
            await sql`UPDATE endpoints SET last_reviewed_at = CURRENT_TIMESTAMP WHERE client_id = ${client_id}`;

            const pending = await sql`SELECT count(*) as count FROM events WHERE client_id = ${client_id} AND reviewed = false`;
            if (parseInt(pending[0].count) === 0) {
                await sql`UPDATE endpoints SET integrity_state = 'CLEAN' WHERE client_id = ${client_id}`;
            }
        }

        res.json({ status: 'success', message: 'Event reviewed' });
    } catch (error) {
        console.error('Error reviewing event:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
