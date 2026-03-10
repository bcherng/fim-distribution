import { sql } from '../../config/db.js';

export const getConfig = (req, res) => {
    res.json({
        pusher: {
            key: process.env.PUSHER_KEY,
            cluster: process.env.PUSHER_CLUSTER
        }
    });
};

export const pruneHeartbeats = async (req, res) => {
    // Vercel sets an authorization header holding the CRON_SECRET value when making cron requests
    if (process.env.CRON_SECRET) {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized to run cron job' });
        }
    }

    try {
        console.log('[Cron] Pruning heartbeats older than 7 days...');
        const result = await sql`DELETE FROM heartbeats WHERE timestamp < NOW() - INTERVAL '7 days' RETURNING id`;
        console.log(`[Cron] Pruned ${result.length} heartbeats.`);
        res.json({ status: 'success', deleted_count: result.length });
    } catch (error) {
        console.error('[Cron] Error pruning heartbeats:', error);
        res.status(500).json({ error: 'Internal server error while pruning heartbeats' });
    }
};
