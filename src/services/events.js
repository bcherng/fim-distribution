import { sql } from '../config/db.js';

export const EventService = {
    async getClientIntegrity(client_id) {
        const clientResult = await sql`SELECT current_root_hash, integrity_state FROM endpoints WHERE client_id = ${client_id}`;
        return clientResult[0];
    },

    async invalidateAttestation(client_id) {
        await sql`
            UPDATE endpoints SET is_attested = false, last_seen = CURRENT_TIMESTAMP
            WHERE client_id = ${client_id}
        `;
    },

    async getDuplicateEventId(client_event_id) {
        const existingEvent = await sql`SELECT id FROM events WHERE client_event_id = ${client_event_id}`;
        return existingEvent?.length > 0 ? existingEvent[0].id : null;
    },

    async insertEvent(data) {
        const result = await sql`
            INSERT INTO events (
                client_event_id, client_id, event_type, file_path, old_hash, new_hash, 
                root_hash, merkle_proof, last_valid_hash, reviewed, 
                timestamp, acknowledged, event_hash, prev_event_hash, signature
            )
            VALUES (
                ${data.id}, ${data.client_id}, ${data.event_type}, ${data.file_path}, ${data.old_hash}, ${data.new_hash}, 
                ${data.root_hash}, ${JSON.stringify(data.merkle_proof)}, ${data.last_valid_hash}, 
                false, ${data.timestamp || new Date().toISOString()}, false,
                ${data.event_hash || null}, ${data.prev_event_hash || null}, ${data.signature || null}
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

    async failPathAttestation(client_id, file_path, monitored_hash, received_hash) {
        await sql`
            INSERT INTO events (client_id, event_type, file_path, old_hash, new_hash, timestamp, reviewed)
            VALUES (${client_id}, 'chain_conflict', ${file_path}, ${monitored_hash}, ${received_hash}, CURRENT_TIMESTAMP, false)
        `;
        await sql`UPDATE endpoints SET is_attested = false WHERE client_id = ${client_id}`;
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
