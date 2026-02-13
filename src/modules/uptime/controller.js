import { sql } from '../../config/db.js';

export const getUptimeHistory = async (req, res) => {
    try {
        const client_id = req.params.client_id || req.params.id; // Support both params
        const { date } = req.query; // YYYY-MM-DD

        let targetDateStart;
        let targetDateEnd;

        if (date) {
            targetDateStart = new Date(`${date}T00:00:00`);
            targetDateEnd = new Date(`${date}T23:59:59.999`);
        } else {
            const now = new Date();
            targetDateStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            targetDateEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        }

        // Fetch uptime intervals that overlap with the target day
        const uptimeStates = await sql`
            SELECT id, state, start_time, end_time, duration_minutes
            FROM uptime 
            WHERE client_id = ${client_id} 
              AND start_time <= ${targetDateEnd} 
              AND (end_time IS NULL OR end_time >= ${targetDateStart})
            ORDER BY start_time ASC
        `;

        // Fetch verification events
        const events = await sql`
            SELECT id, event_type, timestamp, file_path, old_hash, new_hash, reviewed
            FROM events 
            WHERE client_id = ${client_id} 
              AND timestamp >= ${targetDateStart} 
              AND timestamp <= ${targetDateEnd}
              AND event_type NOT IN ('heartbeat', 'heartbeat_missed')
            ORDER BY timestamp ASC
        `;

        res.json({
            client_id,
            date: date || targetDateStart.toISOString().split('T')[0],
            uptime: uptimeStates,
            events: events
        });
    } catch (error) {
        console.error('Error fetching uptime:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
