import crypto from 'crypto';
import { sql } from '../config/db.js';

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

// Daemon authentication middleware (Signature Based)
export async function requireDaemonAuth(req, res, next) {
    const clientId = req.headers['x-client-id'] || req.query.client_id || req.body.client_id;
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    if (!clientId) {
        return res.status(401).json({ error: 'X-Client-ID header or client_id required' });
    }

    try {
        const clientResult = await sql`
      SELECT * FROM endpoints WHERE client_id = ${clientId}
    `;

        if (clientResult.length === 0) {
            return res.status(401).json({ error: 'Client not registered' });
        }

        const client = clientResult[0];

        if (client.status === 'deregistered') {
            return res.status(403).json({
                error: 'This machine has been deregistered by an administrator',
                status: 'deregistered',
                action_required: 'reregister_or_uninstall',
                deregistered_at: client.last_seen
            });
        }

        // If the public_key is set (for clients using the V2 system), verify the signature
        if (client.public_key && signature && timestamp) {
            const payloadStr = timestamp + '.' + clientId;

            try {
                const verify = crypto.createVerify('SHA256');
                verify.update(payloadStr);
                verify.end();

                const isValid = verify.verify({
                    key: client.public_key,
                    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
                }, Buffer.from(signature, 'hex'));

                if (!isValid) {
                    return res.status(401).json({ error: 'Invalid device signature' });
                }
            } catch (cryptoErr) {
                console.error('Signature verification threw error:', cryptoErr);
                return res.status(401).json({ error: 'Device signature format error' });
            }
        } else if (client.public_key && (!signature || !timestamp)) {
            return res.status(401).json({ error: 'Missing device signature for upgraded client' });
        }

        req.daemon = {
            client_id: clientId,
            hardware_id: client.hardware_id,
        };
        next();
    } catch (error) {
        console.error('Daemon auth error:', error);
        return res.status(500).json({ error: 'Internal server error validating client' });
    }
}
