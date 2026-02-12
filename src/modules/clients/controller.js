import jwt from 'jsonwebtoken';
import { sql } from '../../config/db.js';
import { broadcastUpdate } from '../../services/broadcast.js';
import { parseHardwareInfo } from '../../utils/hardware.js';
import { verifyAdmin } from '../../utils/admin.js';

const DAEMON_JWT_SECRET = process.env.DAEMON_JWT_SECRET || 'your-default-daemon-secret-key';

export const register = async (req, res) => {
    try {
        console.log(`[Register] Body:`, JSON.stringify(req.body));
        const { client_id: cid1, clientId: cid2, hardware_info } = req.body;
        const client_id = cid1 || cid2;

        if (!client_id || client_id === 'undefined') {
            console.error(`[Register] Missing identifier`);
            return res.status(400).json({ error: 'client_id is required' });
        }

        const hardware = parseHardwareInfo(hardware_info);
        const clientIdStr = String(client_id);

        try {
            console.log(`[Register] DB Insert: ${clientIdStr}`);
            await sql`
                INSERT INTO clients (client_id, hardware_info, status, file_count, attestation_valid)
                VALUES (${clientIdStr}, ${JSON.stringify(hardware)}, 'online', 0, true)
                ON CONFLICT (client_id) 
                DO UPDATE SET 
                    hardware_info = EXCLUDED.hardware_info,
                    last_seen = CURRENT_TIMESTAMP,
                    status = 'online'
            `;
            console.log(`[Register] DB Success for ${clientIdStr}`);
        } catch (dbError) {
            console.error(`[Register] DB Error ${clientIdStr}:`, dbError.message);
            return res.status(500).json({ error: `DB Error: ${dbError.message}` });
        }

        broadcastUpdate(clientIdStr, 'client_registered');

        const daemonToken = jwt.sign({
            client_id: clientIdStr,
            hardware_id: hardware.machine_id || hardware.hostname || clientIdStr,
            type: 'daemon',
            iat: Math.floor(Date.now() / 1000)
        }, DAEMON_JWT_SECRET, { expiresIn: '30d' });

        res.json({
            status: 'success',
            message: 'Client registered successfully',
            client_id: clientIdStr,
            token: daemonToken,
            expires_in: 30 * 24 * 60 * 60
        });
    } catch (error) {
        console.error('[Register] Fatal:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const verify = (req, res) => {
    res.json({ status: 'success', valid: true });
};

export const reregister = async (req, res) => {
    try {
        const { client_id: cid1, clientId: cid2, username, password } = req.body;
        const client_id = cid1 || cid2;
        console.log(`[Reregister] Client: ${client_id}, User: ${username}`);

        const admin = await verifyAdmin(username, password);
        if (!admin) {
            console.warn(`[Reregister] Auth failed for admin: ${username}`);
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }

        const clientResult = await sql`SELECT * FROM clients WHERE client_id = ${client_id}`;
        if (clientResult.length === 0) {
            console.warn(`[Reregister] Client not found: ${client_id}`);
            return res.status(404).json({ error: 'Client not found in database. Please register as new machine.' });
        }

        const client = clientResult[0];
        // We allow reregistration to recover tokens even if not strictly 'deregistered'

        await sql`
            UPDATE clients SET status = 'online', last_seen = CURRENT_TIMESTAMP
            WHERE client_id = ${client_id}
        `;

        await sql`
            INSERT INTO events (client_id, event_type, timestamp, reviewed)
            VALUES (${client_id}, 'reregister', CURRENT_TIMESTAMP, true)
        `;

        broadcastUpdate(client_id, 'client_reregistered');

        const hardware = parseHardwareInfo(client.hardware_info);
        const daemonToken = jwt.sign({
            client_id,
            hardware_id: hardware.machine_id || hardware.hostname || client_id,
            type: 'daemon',
            iat: Math.floor(Date.now() / 1000)
        }, DAEMON_JWT_SECRET, { expiresIn: '30d' });

        res.json({
            status: 'success',
            message: 'Client reregistered successfully',
            token: daemonToken,
            expires_in: 30 * 24 * 60 * 60
        });
    } catch (error) {
        console.error('[Reregister] Fatal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const uninstall = async (req, res) => {
    try {
        const { client_id: cid1, clientId: cid2, username, password } = req.body;
        const client_id = cid1 || cid2;
        console.log(`[Uninstall] Client: ${client_id}, User: ${username}`);

        const admin = await verifyAdmin(username, password);
        if (!admin) return res.status(401).json({ error: 'Invalid admin credentials' });

        const updateResult = await sql`
            UPDATE clients SET status = 'uninstalled', last_seen = CURRENT_TIMESTAMP
            WHERE client_id = ${client_id}
            RETURNING client_id
        `;

        if (updateResult.length === 0) {
            console.warn(`[Uninstall] Client not found: ${client_id}`);
            return res.status(404).json({ error: 'Client not found. Cannot record uninstallation.' });
        }

        await sql`
            INSERT INTO events (client_id, event_type, timestamp, reviewed)
            VALUES (${client_id}, 'uninstall', CURRENT_TIMESTAMP, true)
        `;

        broadcastUpdate(client_id, 'client_uninstalled');
        res.json({ status: 'success', message: 'Uninstall recorded.' });
    } catch (error) {
        console.error('[Uninstall] Fatal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const saveBaseline = async (req, res) => {
    try {
        const { client_id, root_hash, file_count, directory_path } = req.body;
        if (!client_id) return res.status(400).json({ error: 'client_id is required' });

        console.log(`[Baseline] Saving for ${client_id} at ${directory_path || 'ROOT'}`);

        await sql`
            INSERT INTO monitored_paths (client_id, directory_path, root_hash, file_count)
            VALUES (${client_id}, ${directory_path || 'DEFAULT'}, ${root_hash}, ${file_count || 0})
            ON CONFLICT (client_id, directory_path) 
            DO UPDATE SET 
                root_hash = EXCLUDED.root_hash, 
                file_count = EXCLUDED.file_count, 
                updated_at = CURRENT_TIMESTAMP
        `;

        res.json({ status: 'success', message: 'Baseline saved successfully' });
    } catch (error) {
        console.error('[Baseline] Fatal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const heartbeat = async (req, res) => {
    try {
        const { file_count, current_root_hash, boot_id } = req.body;
        const client_id = req.daemon.client_id;
        const now = new Date();

        // 1. Update Client Status
        await sql`
            UPDATE clients 
            SET last_seen = ${now}, 
                status = 'online',
                last_heartbeat = ${now},
                file_count = ${file_count || 0},
                last_boot_id = ${boot_id || null},
                current_root_hash = ${current_root_hash || null}
            WHERE client_id = ${client_id}
        `;

        // 2. Real-time Uptime Tracking (Event Driven)
        // Find the absolute latest uptime record (open or closed)
        const lastUptime = await sql`
            SELECT id, state, start_time, end_time 
            FROM uptime 
            WHERE client_id = ${client_id}
            ORDER BY start_time DESC 
            LIMIT 1
        `;

        if (lastUptime.length === 0) {
            // First ever heartbeat
            await sql`INSERT INTO uptime (client_id, state, start_time, end_time, duration_minutes) VALUES (${client_id}, 'UP', ${now}, ${now}, 0)`;
        } else {
            const record = lastUptime[0];
            const lastEnd = new Date(record.end_time || record.start_time);
            const gapMs = now - lastEnd;
            const gapMinutes = gapMs / (1000 * 60);

            if (gapMs <= 0) {
                // Ignore redundant heartbeat or clock skew (already processed at this ms)
                console.log(`[Heartbeat] Redundant at ${now.toISOString()}`);
            } else if (record.state === 'UP') {
                if (gapMinutes <= 16) { // 15m + buffer
                    // Extend current session
                    const newDuration = Math.round((now - new Date(record.start_time)) / (1000 * 60));
                    await sql`
                        UPDATE uptime 
                        SET end_time = ${now}, duration_minutes = ${newDuration}
                        WHERE id = ${record.id}
                    `;
                } else {
                    // Gap detected (>15m) -> Downtime
                    // 1. Close old session (already closed implicitly by having end_time, but rigorous to ensure)

                    // 2. Insert DOWN session for the gap
                    const downDuration = Math.round((now - lastEnd) / (1000 * 60));
                    await sql`
                        INSERT INTO uptime (client_id, state, start_time, end_time, duration_minutes)
                        VALUES (${client_id}, 'DOWN', ${lastEnd}, ${now}, ${downDuration})
                    `;

                    // 3. Start new UP session
                    await sql`
                        INSERT INTO uptime (client_id, state, start_time, end_time, duration_minutes) 
                        VALUES (${client_id}, 'UP', ${now}, ${now}, 0)
                    `;
                }
            } else {
                // Last state was DOWN (or other) -> Start new UP
                await sql`
                    INSERT INTO uptime (client_id, state, start_time, end_time, duration_minutes) 
                    VALUES (${client_id}, 'UP', ${now}, ${now}, 0)
                `;
            }
        }

        // 3. Log raw heartbeat for audit (optional: could delete old ones here to save space)
        await sql`INSERT INTO heartbeats (client_id, timestamp) VALUES (${client_id}, ${now})`;
        // Optional: Delete heartbeats older than 7 days
        // await sql`DELETE FROM heartbeats WHERE timestamp < NOW() - INTERVAL '7 days'`;

        console.log(`[Heartbeat] Processed for ${client_id}`);

        res.json({
            status: 'success',
            message: 'Heartbeat received',
            validation: { timestamp: new Date().toISOString(), accepted: true }
        });

        broadcastUpdate(client_id, 'client_heartbeat');
    } catch (error) {
        console.error('Error processing heartbeat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getClients = async (req, res) => {
    try {
        const result = await sql`
      SELECT 
        c.client_id, c.status, c.last_seen, 
        c.integrity_status, c.current_root_hash, c.last_reviewed_at,
        c.attestation_valid, c.file_count, c.last_heartbeat, c.last_boot_id,
        CASE WHEN COUNT(CASE WHEN e.reviewed = false AND e.event_type = 'attestation_failed' THEN 1 END) > 0 THEN 'FAILED' ELSE 'OK' END as attestation_status,
        COUNT(CASE WHEN e.reviewed = false AND e.event_type NOT IN ('heartbeat', 'heartbeat_missed', 'directory_selected', 'directory_unselected', 'registration', 'deregistration', 'reinstall', 'uninstall', 'attestation_failed') THEN 1 END)::int as integrity_change_count,
        COUNT(CASE WHEN e.reviewed = false AND e.event_type = 'heartbeat_missed' THEN 1 END)::int as missed_heartbeat_count,
        COUNT(CASE WHEN e.reviewed = false AND e.event_type = 'attestation_failed' THEN 1 END)::int as attestation_error_count,
        COUNT(CASE WHEN e.reviewed = false THEN 1 END)::int as unreviewed_events,
        MAX(e.timestamp) as last_event
      FROM clients c
      LEFT JOIN events e ON c.client_id = e.client_id
      WHERE c.status != 'uninstalled' 
      GROUP BY c.client_id, c.status, c.last_seen, c.integrity_status, c.current_root_hash, c.last_reviewed_at, c.attestation_valid, c.file_count, c.last_heartbeat, c.last_boot_id
      ORDER BY c.last_seen DESC
    `;

        res.json({ clients: result });
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getClientDetails = async (req, res) => {
    try {
        const { client_id } = req.params;
        const result = await sql`SELECT * FROM clients WHERE client_id = ${client_id}`;
        if (result.length === 0) return res.status(404).json({ error: 'Client not found' });

        const client = result[0];

        const integrityCount = await sql`
      SELECT count(*) as count FROM events 
      WHERE client_id = ${client_id} AND reviewed = false 
        AND event_type NOT IN ('heartbeat', 'heartbeat_missed', 'directory_selected', 'directory_unselected', 'registration', 'deregistration', 'reinstall', 'uninstall', 'attestation_failed')
    `;

        const downtimeCount = await sql`
      SELECT count(*) as count FROM events 
      WHERE client_id = ${client_id} AND reviewed = false AND event_type = 'heartbeat_missed'
    `;

        const attestationFailed = await sql`
      SELECT count(*) as count FROM events 
      WHERE client_id = ${client_id} AND reviewed = false AND event_type = 'attestation_failed'
    `;

        res.json({
            client: {
                ...client,
                integrity_change_count: parseInt(integrityCount[0].count),
                missed_heartbeat_count: parseInt(downtimeCount[0].count),
                attestation_status: parseInt(attestationFailed[0].count) > 0 ? 'FAILED' : 'OK'
            }
        });
    } catch (error) {
        console.error('Client details error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteClient = async (req, res) => {
    try {
        const client_id = req.params.id;
        const { username, password } = req.body;

        if (username && password) {
            const admin = await verifyAdmin(username, password);
            if (!admin) return res.status(401).json({ error: 'Invalid admin credentials' });
        }

        await sql`
      UPDATE clients SET status = 'deregistered', last_seen = CURRENT_TIMESTAMP
      WHERE client_id = ${client_id}
    `;

        await sql`
      INSERT INTO events (client_id, event_type, timestamp, reviewed)
      VALUES (${client_id}, 'deregistration', CURRENT_TIMESTAMP, true)
    `;

        console.log(`Client marked for deregistration: ${client_id}`);
        broadcastUpdate(client_id, 'client_removed');

        res.json({ status: 'success', message: 'Client deregistered.' });
    } catch (error) {
        console.error('Deregistration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const reviewClient = async (req, res) => {
    try {
        const { client_id } = req.params;
        const now = new Date();

        await sql`
            UPDATE events 
            SET reviewed = true, reviewed_at = ${now}
            WHERE client_id = ${client_id} AND reviewed = false
        `;

        await sql`
            UPDATE clients 
            SET last_reviewed_at = ${now},
                attestation_valid = true
            WHERE client_id = ${client_id}
        `;

        broadcastUpdate(client_id, 'client_reviewed');
        res.json({ status: 'success', message: 'Client state reviewed and reset' });
    } catch (error) {
        console.error('Review client error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
