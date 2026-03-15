import { sql } from '../config/db.js';

export const EventService = {
    async getClientIntegrity(client_id) {
        const clientResult = await sql`SELECT current_root_hash, integrity_state, last_accepted_event_hash FROM endpoints WHERE client_id = ${client_id}`;
        return clientResult[0];
    },

    async invalidateAttestation(client_id) {
        await sql`
            UPDATE endpoints SET is_attested = false, last_seen = CURRENT_TIMESTAMP
            WHERE client_id = ${client_id}
        `;
    },

    async getDuplicateEventId(client_event_id, client_id) {
        const result = await sql`
            SELECT id, signature FROM events 
            WHERE client_event_id = ${client_event_id} AND client_id = ${client_id}
        `;
        return result[0] || null;
    },

    async insertEvent(data) {
        // Strip out fields that are top-level columns to avoid duplication in payload
        const { id, client_id, event_type, timestamp, signature, ...payloadData } = data;
        
        const result = await sql`
            INSERT INTO events (
                client_event_id, client_id, event_type, payload, 
                reviewed, timestamp, acknowledged, signature
            )
            VALUES (
                ${data.id}, ${data.client_id}, ${data.event_type}, ${JSON.stringify(payloadData)}, 
                false, ${data.timestamp || new Date().toISOString()}, false, ${data.signature || null}
            )
            RETURNING id
        `;
        return result[0].id;
    },

    async insertOrUpdateMonitoredPath(client_id, file_path, root_hash, tracked_file_count) {
        await sql`
            INSERT INTO monitored_paths (client_id, directory_path, root_hash, tracked_file_count)
            VALUES (${client_id}, ${file_path}, ${root_hash}, ${tracked_file_count || 0})
            ON CONFLICT (client_id, directory_path) 
            DO UPDATE SET 
                root_hash = EXCLUDED.root_hash, 
                tracked_file_count = EXCLUDED.tracked_file_count,
                updated_at = CURRENT_TIMESTAMP
        `;
    },

    async failPathAttestation(client_id, file_path, monitored_hash, received_hash, client_event_id) {
        const payload = {
            file_path: file_path,
            expected_hash: monitored_hash,
            received_hash: received_hash,
            reason: 'SIGNATURE_MISMATCH'
        };
        const result = await sql`
            INSERT INTO events (client_id, event_type, payload, timestamp, reviewed, client_event_id)
            VALUES (${client_id}, 'mismatch', ${JSON.stringify(payload)}, CURRENT_TIMESTAMP, false, ${client_event_id || null})
            RETURNING id
        `;
        await sql`UPDATE endpoints SET integrity_state = 'TAINTED', last_seen = CURRENT_TIMESTAMP WHERE client_id = ${client_id}`;
        return result[0].id;
    },

    async updateLastAcceptedHash(client_id, event_hash) {
        if (!event_hash) return;
        await sql`
            UPDATE endpoints
            SET last_accepted_event_hash = ${event_hash}
            WHERE client_id = ${client_id}
        `;
    },

    async updateClientStatusOnEvent(client_id, is_attested, event_type) {
        let statusUpdate = sql`
            UPDATE endpoints SET last_seen = CURRENT_TIMESTAMP, is_attested = ${is_attested}
            WHERE client_id = ${client_id}
        `;

        if (!['directory_selected', 'directory_unselected'].includes(event_type)) {
            statusUpdate = sql`
                UPDATE endpoints 
                SET last_seen = CURRENT_TIMESTAMP, is_attested = ${is_attested}, integrity_state = 'MODIFIED'
                WHERE client_id = ${client_id}
            `;
        }

        await statusUpdate;
    }
};
