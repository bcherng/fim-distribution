import { sql } from '../../config/db.js';
import { broadcastUpdate } from '../../services/broadcast.js';
import { findMonitoredPath } from '../../utils/monitored_paths.js';
import { EventService } from '../../services/events.js';
import { signPayload, verifyDeviceSignature } from '../../utils/crypto.js';
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

        // 0. Robust Duplicate Check
        const existingEvent = await EventService.getDuplicateEventId(id, client_id);
        if (existingEvent) {
             const response = {
                status: 'success',
                message: 'Duplicate event acknowledged',
                event_id: existingEvent.id,
                validation: { 
                    timestamp: new Date().toISOString(), 
                    accepted: true 
                }
            };
            response.signature = signPayload(response);
            return res.json(response);
        }

        const client = await EventService.getClientIntegrity(client_id);
        const endpoint = (await sql`SELECT public_key, integrity_state FROM endpoints WHERE client_id = ${client_id}`)[0];
        
        let holds_integrity = true;
        let forensic_reason = null;

        // 1. Verify Device Signature (Witness Check)
        if (endpoint?.public_key) {
            const payloadStr = `${id}${prev_event_hash || ''}${last_valid_hash || ''}${new_hash || ''}`;
            const isSigValid = verifyDeviceSignature(payloadStr, signature, endpoint.public_key);
            
            if (!isSigValid) {
                console.error(`[Security] Signature verification failed for event ${id} from ${client_id}`);
                holds_integrity = false;
                forensic_reason = 'SIGNATURE_MISMATCH';
            }
        }

        const isLifecycleEvent = ['directory_selected', 'directory_unselected'].includes(event_type);

        // 2. Rolling hash chain check
        if (!isLifecycleEvent && holds_integrity && client?.last_accepted_event_hash !== null && last_valid_hash) {
            if (client.last_accepted_event_hash !== last_valid_hash) {
                holds_integrity = false;
                forensic_reason = 'CHAIN_BREAK';
                console.error(`[Integrity] Chain break for ${client_id}: Expected ${client.last_accepted_event_hash}, got ${last_valid_hash}`);
            }
        }

        // 3. Insert original witness event
        const event_id = await EventService.insertEvent({
            id, client_id, event_type, file_path, old_hash, new_hash,
            root_hash, merkle_proof, last_valid_hash, timestamp,
            event_hash, prev_event_hash, signature
        });

        // 4. Insert separate forensic event if needed
        if (!holds_integrity) {
             await EventService.failPathAttestation(
                client_id, 
                file_path || 'FORENSICS', 
                forensic_reason === 'CHAIN_BREAK' ? client.last_accepted_event_hash : 'VALID_KEY', 
                forensic_reason === 'CHAIN_BREAK' ? last_valid_hash : 'INVALID_SIGNATURE',
                id // Link to the report ID
            );
        }

        if (event_type === 'directory_selected') {
            await EventService.insertOrUpdateMonitoredPath(client_id, file_path, root_hash, tracked_file_count);
        } else if (!isLifecycleEvent) {
            const monitored = await findMonitoredPath(client_id, file_path);
            if (monitored && monitored.root_hash === null) {
                await EventService.insertOrUpdateMonitoredPath(client_id, file_path, last_valid_hash, tracked_file_count);
            }
        }

        // Advance the chain anchor (Heal happens by accepting the report as witness)
        if (root_hash && !isLifecycleEvent) {
            await EventService.updateLastAcceptedHash(client_id, root_hash);
        }

        // Update endpoint metadata
        await sql`
            UPDATE endpoints 
            SET last_seen = CURRENT_TIMESTAMP, 
                integrity_state = ${holds_integrity ? (endpoint?.integrity_state === 'TAINTED' ? 'TAINTED' : 'MODIFIED') : 'TAINTED'}
            WHERE client_id = ${client_id}
        `;

        const response = {
            status: 'success',
            message: holds_integrity ? 'Event recorded' : 'Event recorded (Forensic Alert generated)',
            event_id: event_id,
            validation: { 
                timestamp: new Date().toISOString(), 
                accepted: true,
                forensic_alert: !holds_integrity
            }
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

            // Machine returns to CLEAN if NO unreviewed mismatches remain
            const pendingMismatches = await sql`SELECT count(*)::int as count FROM events WHERE client_id = ${client_id} AND reviewed = false AND event_type = 'mismatch'`;
            
            if (pendingMismatches[0].count === 0) {
                console.log(`[Integrity] All mismatches reviewed for ${client_id}. Resetting state to CLEAN.`);
                await sql`UPDATE endpoints SET integrity_state = 'CLEAN' WHERE client_id = ${client_id}`;
            }
        }

        res.json({ status: 'success', message: 'Event reviewed' });
    } catch (error) {
        console.error('Error reviewing event:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
