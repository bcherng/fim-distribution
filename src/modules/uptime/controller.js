import { sql } from '../../config/db.js';
import { updateUptimeState, closeUptimeState, openUptimeState } from '../../utils/uptime.js';

export const getUptimeHistory = async (req, res) => {
    try {
        const client_id = req.params.id;
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

        const uptimeStates = await sql`
      SELECT id, state, start_time, end_time, duration_minutes
      FROM uptime 
      WHERE client_id = ${client_id} 
        AND (
          (start_time <= ${targetDateEnd} AND (end_time IS NULL OR end_time >= ${targetDateStart}))
        )
      ORDER BY start_time ASC
    `;

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

export const compileUptime = async (req, res) => {
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('[Cron] Starting uptime compilation...');
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const clients = await sql`SELECT client_id FROM clients WHERE status != 'deregistered'`;

        for (const client of clients) {
            const clientId = client.client_id;
            const heartbeats = await sql`
        SELECT timestamp FROM heartbeats 
        WHERE client_id = ${clientId} AND timestamp >= ${yesterday}
        ORDER BY timestamp ASC
      `;

            if (heartbeats.length === 0) {
                await updateUptimeState(clientId, 'DOWN', yesterday);
                continue;
            }

            let currentState = 'UP';
            for (let i = 1; i < heartbeats.length; i++) {
                const prevTime = new Date(heartbeats[i - 1].timestamp);
                const currTime = new Date(heartbeats[i].timestamp);
                const gapMinutes = (currTime - prevTime) / (1000 * 60);

                if (gapMinutes > 15) {
                    await closeUptimeState(clientId, currentState, prevTime);
                    await openUptimeState(clientId, 'DOWN', prevTime);
                    await closeUptimeState(clientId, 'DOWN', currTime);
                    await openUptimeState(clientId, 'UP', currTime);
                }
            }
        }

        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const deleted = await sql`DELETE FROM heartbeats WHERE timestamp < ${sevenDaysAgo}`;
        console.log(`[Cron] Cleaned up ${deleted.count || deleted.length || 0} old heartbeats.`);

        res.json({ status: 'success', message: 'Uptime compilation complete' });
    } catch (error) {
        console.error('[Cron] Uptime compilation failed:', error);
        res.status(500).json({ error: error.message });
    }
};
