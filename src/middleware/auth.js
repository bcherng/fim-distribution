import jwt from 'jsonwebtoken';
import { sql } from '../config/db.js';

const DAEMON_JWT_SECRET = process.env.DAEMON_JWT_SECRET || 'your-default-daemon-secret-key';

// Admin authentication middleware
export async function requireAdminAuth(req, res, next) {
    const sessionId = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (!sessionId) return res.status(401).json({ error: 'Authentication required' });

    try {
        // Session management helpers (these can be moved to a separate service if needed)
        const result = await sql`SELECT * FROM sessions WHERE session_id = ${sessionId}`;
        const session = result[0];

        if (!session) return res.status(401).json({ error: 'Invalid session' });

        if (new Date(session.expires_at) < new Date()) {
            await sql`DELETE FROM sessions WHERE session_id = ${sessionId}`;
            return res.status(401).json({ error: 'Session expired' });
        }

        req.user = { id: session.user_id, username: session.username };
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Daemon authentication middleware
export async function requireDaemonAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, DAEMON_JWT_SECRET);

        const clientResult = await sql`
      SELECT * FROM clients WHERE client_id = ${decoded.client_id}
    `;

        if (clientResult.length === 0) {
            return res.status(401).json({ error: 'Client not registered' });
        }

        const client = clientResult[0];
        if (client.status === 'deregistered') {
            return res.status(403).json({
                error: 'This machine has been deregistered by an administrator',
                status: 'deregistered',
                message: 'Your machine has been removed from monitoring. You can either:\n1. Reregister this machine (requires admin credentials)\n2. Uninstall the FIM client completely',
                action_required: 'reregister_or_uninstall',
                deregistered_at: client.last_seen
            });
        }

        req.daemon = {
            client_id: decoded.client_id,
            hardware_id: decoded.hardware_id
        };
        next();
    } catch (error) {
        console.error('Daemon JWT verification error:', error);
        return res.status(401).json({ error: 'Invalid token' });
    }
}
