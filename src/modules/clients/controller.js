import jwt from 'jsonwebtoken';
import { sql } from '../../config/db.js';
import { broadcastUpdate } from '../../services/broadcast.js';
import { parseHardwareInfo } from '../../utils/hardware.js';
import { verifyAdmin } from '../../utils/admin.js';

const DAEMON_JWT_SECRET = process.env.DAEMON_JWT_SECRET || 'your-default-daemon-secret-key';

export const register = async (req, res) => {
    try {
        const { client_id, hardware_info, baseline_id } = req.body;
        if (!client_id) return res.status(400).json({ error: 'client_id is required' });

        const hardware = parseHardwareInfo(hardware_info);

        await sql`
      INSERT INTO clients (client_id, hardware_info, baseline_id, status, file_count, attestation_valid)
      VALUES (${client_id}, ${JSON.stringify(hardware)}, ${baseline_id || 1}, 'online', 0, true)
      ON CONFLICT (client_id) 
      DO UPDATE SET 
        hardware_info = EXCLUDED.hardware_info,
        baseline_id = EXCLUDED.baseline_id,
        last_seen = CURRENT_TIMESTAMP,
        status = 'online'
    `;

        broadcastUpdate(client_id, 'client_registered');

        const daemonToken = jwt.sign({
            client_id,
            hardware_id: hardware.machine_id || hardware.hostname,
            type: 'daemon',
            iat: Math.floor(Date.now() / 1000)
        }, DAEMON_JWT_SECRET, { expiresIn: '30d' });

        res.json({
            status: 'success',
            message: 'Client registered successfully',
            client_id,
            token: daemonToken,
            expires_in: 30 * 24 * 60 * 60
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const verify = (req, res) => {
    res.json({ status: 'success', valid: true });
};

export const reregister = async (req, res) => {
    try {
        const { client_id, username, password } = req.body;
        const admin = await verifyAdmin(username, password);
        if (!admin) return res.status(401).json({ error: 'Invalid admin credentials' });

        const clientResult = await sql`SELECT * FROM clients WHERE client_id = ${client_id}`;
        if (clientResult.length === 0) return res.status(404).json({ error: 'Client not found' });

        const client = clientResult[0];
        if (client.status !== 'deregistered') return res.status(400).json({ error: 'Client is not deregistered' });

        await sql`
      UPDATE clients SET status = 'online', last_seen = CURRENT_TIMESTAMP
      WHERE client_id = ${client_id}
    `;

        await sql`
      INSERT INTO events (client_id, event_type, timestamp, reviewed)
      VALUES (${client_id}, 'reregister', CURRENT_TIMESTAMP, true)
    `;

        console.log(`Client reregistered: ${client_id} by admin: ${username}`);
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
        console.error('Reregistration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const uninstall = async (req, res) => {
    try {
        const { client_id, username, password } = req.body;
        const admin = await verifyAdmin(username, password);
        if (!admin) return res.status(401).json({ error: 'Invalid admin credentials' });

        await sql`
      UPDATE clients SET status = 'uninstalled', last_seen = CURRENT_TIMESTAMP
      WHERE client_id = ${client_id}
    `;

        await sql`
      INSERT INTO events (client_id, event_type, timestamp, reviewed)
      VALUES (${client_id}, 'uninstall', CURRENT_TIMESTAMP, true)
    `;

        console.log(`Client uninstalled: ${client_id} by admin: ${username}`);
        broadcastUpdate(client_id, 'client_uninstalled');

        res.json({ status: 'success', message: 'Uninstall recorded. Logs preserved.' });
    } catch (error) {
        console.error('Uninstall recording error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const heartbeat = async (req, res) => {
    try {
        const { file_count, current_root_hash, boot_id } = req.body;
        const client_id = req.daemon.client_id;
        const now = new Date();

        const clientResult = await sql`SELECT client_id FROM clients WHERE client_id = ${client_id}`;

        if (clientResult.length > 0) {
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

            await sql`INSERT INTO heartbeats (client_id, timestamp) VALUES (${client_id}, ${now})`;
            console.log(`[Heartbeat] Logged for ${client_id}`);
        }

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
        c.attestation_valid,
        COUNT(CASE WHEN e.reviewed = false AND e.event_type NOT IN ('heartbeat', 'heartbeat_missed', 'directory_selected', 'directory_unselected', 'registration', 'deregistration', 'reinstall', 'uninstall', 'attestation_failed') THEN 1 END) as integrity_change_count,
        COUNT(CASE WHEN e.reviewed = false AND e.event_type = 'heartbeat_missed' THEN 1 END) as missed_heartbeat_count,
        COUNT(CASE WHEN e.reviewed = false AND e.event_type = 'attestation_failed' THEN 1 END) as attestation_error_count,
        COUNT(CASE WHEN e.reviewed = false THEN 1 END) as unreviewed_events,
        MAX(e.timestamp) as last_event
      FROM clients c
      LEFT JOIN events e ON c.client_id = e.client_id
      WHERE c.status != 'uninstalled' 
      GROUP BY c.client_id, c.status, c.last_seen, c.integrity_status, c.current_root_hash, c.last_reviewed_at, c.attestation_valid
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
