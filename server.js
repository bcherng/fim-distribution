import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Pusher from 'pusher';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const DAEMON_JWT_SECRET = process.env.DAEMON_JWT_SECRET || 'daemon-secret-key-change-in-production';
const HEARTBEAT_INTERVAL = 15 * 60 * 1000; // 15 minutes


const mockData = {
  clients: new Map(),
  admins: new Map(),
  events: [],
  sessions: new Map(),
  baselines: []
};

const pusher = (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER)
  ? new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
  }) : null;

if (!pusher) {
  console.warn('Pusher environment variables missing. Real-time updates will be disabled.');
}

async function broadcastUpdate(clientId, type = 'client_updated') {
  if (!pusher) return;
  const message = { type, clientId, timestamp: new Date().toISOString() };
  try {
    console.log(`[Pusher] Triggering update on channel 'fim-updates':`, message);
    await pusher.trigger('fim-updates', 'client_updated', message);
  } catch (error) {
    console.error(`[Pusher] Error triggering update:`, error.message);
  }
}

// Initialize admin mock data
bcrypt.hash('password123', 10).then(hash => {
  mockData.admins.set('admin', { id: 1, username: 'admin', password_hash: hash });
});

let sql;
async function initDatabase() {
  try {
    const { neon } = await import('@neondatabase/serverless');
    sql = neon(process.env.DATABASE_URL);
    console.log('Neon database connection initialized');

    // Removal of setInterval for serverless compatibility
    // setInterval(checkHeartbeats, HEARTBEAT_INTERVAL);
  } catch (error) {
    console.error('Failed to initialize Neon database:', error);

    sql = Object.assign(
      async (strings, ...values) => {
        const query = strings.join('?').replace(/\s+/g, ' ').trim();
        console.log('Mock query (normalized):', query, values);

        if (/FROM admins WHERE username =/i.test(query)) {
          const username = values[0];
          return mockData.admins.has(username) ? [mockData.admins.get(username)] : [];
        }

        if (/INSERT INTO clients/i.test(query)) {
          const client_id = values[0];
          mockData.clients.set(client_id, {
            client_id,
            hardware_info: values[1],
            baseline_id: values[2],
            status: 'online',
            current_root_hash: null,
            last_reviewed_at: new Date().toISOString(),
            missed_heartbeat_count: 0,
            attestation_error_count: 0,
            integrity_change_count: 0,
            attestation_valid: true
          });
          return [];
        }

        if (/FROM clients WHERE client_id =/i.test(query)) {
          const client_id = values[0];
          return mockData.clients.has(client_id) ? [mockData.clients.get(client_id)] : [];
        }

        if (/UPDATE clients/i.test(query)) {
          const client_id = values[values.length - 1];
          if (mockData.clients.has(client_id)) {
            const client = mockData.clients.get(client_id);
            if (/current_root_hash =/i.test(query) && !query.includes('heartbeat')) {
              client.current_root_hash = values[values.length - 2];
            }
            if (/status = 'offline'/i.test(query) && client.status === 'online') {
              client.status = 'offline';
              client.missed_heartbeat_count++;
            }
            if (/attestation_valid =/i.test(query)) {
              const valid = values[0];
              client.attestation_valid = valid;
              if (valid === false) client.attestation_error_count++;
            }
            if (/integrity_change_count = integrity_change_count \+ 1/i.test(query)) {
              client.integrity_change_count++;
            }
            if (/last_reviewed_at = CURRENT_TIMESTAMP/i.test(query)) {
              client.last_reviewed_at = new Date().toISOString();
              client.missed_heartbeat_count = 0;
              client.attestation_error_count = 0;
              client.integrity_change_count = 0;
              // Reset status to online on review if it was warning/offline
              if (client.status === 'warning' || client.status === 'offline') {
                client.status = 'online';
              }
            }
          }
          return [];
        }

        if (/INSERT INTO events/i.test(query)) {
          const event = {
            id: values[0] || mockData.events.length + 1,
            client_id: values[1],
            root_hash: values[6],
            acknowledged: false
          };
          mockData.events.push(event);
          console.log('Mock: Event stored:', event);
          return [event];
        }

        if (/FROM events WHERE id =/i.test(query)) {
          const id = values[0];
          console.log(`Mock: Searching for event id=${id} in ${mockData.events.length} events`);
          const event = mockData.events.find(e => e.id == id);
          if (event) console.log('Mock: Event found:', event);
          else console.log('Mock: Event NOT found');
          return event ? [event] : [];
        }

        if (/UPDATE events/i.test(query)) {
          const id = values[0];
          const event = mockData.events.find(e => e.id == id);
          if (event) {
            event.acknowledged = true;
          }
          return [];
        }

        if (/INSERT INTO sessions/i.test(query)) {
          const session_id = values[0];
          mockData.sessions.set(session_id, {
            session_id,
            user_id: values[1],
            username: values[2],
            expires_at: values[3]
          });
          return [];
        }

        if (/FROM sessions WHERE session_id =/i.test(query)) {
          const session_id = values[0];
          return mockData.sessions.has(session_id) ? [mockData.sessions.get(session_id)] : [];
        }

        if (/DELETE FROM sessions/i.test(query)) {
          const session_id = values[0];
          mockData.sessions.delete(session_id);
          return [];
        }

        if (/SELECT c\.\*, COUNT\(CASE WHEN e\.reviewed = false/i.test(query)) {
          console.log('Mock: Returning all clients for grid');
          return Array.from(mockData.clients.values());
        }

        if (/INSERT INTO baselines/i.test(query)) {
          return [{ id: mockData.baselines.length + 1 }];
        }

        return [];
      },
      {
        query: async (query, params) => {
          console.log('Mock pg-query:', query, params);
          return [];
        }
      }
    );
  }
}

initDatabase();


// Heartbeat checker - Timeouts
async function checkHeartbeats() {
  try {
    const now = new Date();

    // Fetch all active clients from SQL
    const clients = await sql`SELECT client_id, status, last_seen, last_reviewed_at FROM clients WHERE status != 'deregistered'`;

    for (const client of clients) {
      const lastSeen = new Date(client.last_seen || client.last_reviewed_at || 0);
      const diffSeconds = (now - lastSeen) / 1000;
      const intervalSeconds = 900; // 15 mins

      // Logic: If last_seen is more than 1 interval ago, and we haven't already logged a missed heartbeat
      if (diffSeconds > intervalSeconds) {
        // Check last event for this client
        const lastEvents = await sql`
          SELECT event_type, timestamp FROM events 
          WHERE client_id = ${client.client_id} 
          ORDER BY timestamp DESC LIMIT 1
        `;
        const lastEvent = lastEvents[0];
        const lastEventTime = lastEvent ? new Date(lastEvent.timestamp) : new Date(0);

        // Only insert if last event wasn't already a missed heartbeat AFTER the last success
        if (!lastEvent || (lastEvent.event_type !== 'heartbeat_missed' && lastEventTime <= lastSeen)) {
          console.log(`[Watchdog] Client ${client.client_id} -> MISSED HEARTBEAT`);

          await sql`
            INSERT INTO events (client_id, event_type, timestamp, reviewed, acknowledged)
            VALUES (${client.client_id}, 'heartbeat_missed', ${now}, true, true)
          `;

          await sql`UPDATE clients SET status = 'offline' WHERE client_id = ${client.client_id}`;

          // Sync mockData
          const mClient = mockData.clients.get(client.client_id);
          if (mClient) mClient.status = 'offline';

          broadcastUpdate(client.client_id, 'client_updated');
        }
      }
    }
  } catch (error) {
    console.error('Heartbeat check error:', error);
  }
}

// Admin authentication
async function requireAdminAuth(req, res, next) {
  const sessionId = req.headers.authorization?.replace('Bearer ', '') || req.query.token;

  if (!sessionId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    if (new Date(session.expires_at) < new Date()) {
      await deleteSession(sessionId);
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = {
      id: session.user_id,
      username: session.username
    };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Daemon authentication
async function requireDaemonAuth(req, res, next) {
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

// Session management
async function createSession(userId, username) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await sql`
    INSERT INTO sessions (session_id, user_id, username, expires_at)
    VALUES (${sessionId}, ${userId}, ${username}, ${expiresAt.toISOString()})
  `;

  return sessionId;
}

async function getSession(sessionId) {
  try {
    const result = await sql`
      SELECT * FROM sessions WHERE session_id = ${sessionId}
    `;
    return result[0] || null;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

async function deleteSession(sessionId) {
  try {
    await sql`DELETE FROM sessions WHERE session_id = ${sessionId}`;
  } catch (error) {
    console.error('Error deleting session:', error);
  }
}

async function cleanupExpiredSessions() {
  try {
    await sql`DELETE FROM sessions WHERE expires_at < NOW()`;
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
  }
}

// Static pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/machine/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'machine.html'));
});

// Admin API
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const result = await sql`
      SELECT * FROM admins WHERE username = ${username}
    `;

    const admin = result[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionId = await createSession(admin.id, admin.username);

    res.json({
      status: 'success',
      message: 'Login successful',
      token: sessionId,
      user: {
        id: admin.id,
        username: admin.username
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', requireAdminAuth, async (req, res) => {
  try {
    const sessionId = req.headers.authorization.replace('Bearer ', '');
    await deleteSession(sessionId);
    res.json({ status: 'success', message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/check', requireAdminAuth, (req, res) => {
  res.json({ authenticated: true, user: req.user });
});

// App Config API
app.get('/api/config', (req, res) => {
  res.json({
    pusher: {
      key: process.env.PUSHER_KEY,
      cluster: process.env.PUSHER_CLUSTER
    }
  });
});

// Daemon API
app.post('/api/clients/register', async (req, res) => {
  try {
    const { client_id, hardware_info, baseline_id, platform } = req.body;

    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }

    await sql`
      INSERT INTO clients (client_id, hardware_info, baseline_id, status, file_count, attestation_valid)
      VALUES (${client_id}, ${JSON.stringify(hardware_info)}, ${baseline_id || 1}, 'online', 0, true)
      ON CONFLICT (client_id) 
      DO UPDATE SET 
        hardware_info = EXCLUDED.hardware_info,
        baseline_id = EXCLUDED.baseline_id,
        last_seen = CURRENT_TIMESTAMP,
        status = 'online'
        -- We purposely DO NOT reset metrics like integrity_change_count here
        -- to track reinstallation history.
    `;

    broadcastUpdate(client_id, 'client_registered');

    const payload = {
      client_id: client_id,
      hardware_id: hardware_info.machine_id || hardware_info.hostname,
      type: 'daemon',
      iat: Math.floor(Date.now() / 1000)
    };

    const daemonToken = jwt.sign(payload, DAEMON_JWT_SECRET, {
      expiresIn: '30d'
    });

    console.log(`Daemon registered: ${client_id}`);
    res.json({
      status: 'success',
      message: 'Client registered successfully',
      client_id,
      token: daemonToken,
      expires_in: 30 * 24 * 60 * 60
    });
  } catch (error) {
    console.error('Error registering client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Token verification endpoint
app.post('/api/clients/verify', requireDaemonAuth, (req, res) => {
  res.json({ status: 'success', valid: true });
});

// Admin credential verification
app.post('/api/auth/verify-admin', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const result = await sql`
      SELECT * FROM admins WHERE username = ${username}
    `;

    const admin = result[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      status: 'success',
      valid: true,
      admin: {
        id: admin.id,
        username: admin.username
      }
    });
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Client reregistration endpoint
app.post('/api/clients/reregister', async (req, res) => {
  try {
    const { client_id, username, password } = req.body;

    // Verify admin credentials
    const adminResult = await sql`SELECT * FROM admins WHERE username = ${username}`;
    const admin = adminResult[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    // Check if client exists and is deregistered
    const clientResult = await sql`SELECT * FROM clients WHERE client_id = ${client_id}`;
    if (clientResult.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult[0];
    if (client.status !== 'deregistered') {
      return res.status(400).json({ error: 'Client is not in deregistered state' });
    }

    // Reregister: clear deregistered status
    await sql`
      UPDATE clients 
      SET status = 'online',
          last_seen = CURRENT_TIMESTAMP
      WHERE client_id = ${client_id}
    `;

    // Log reinstall event
    await sql`
      INSERT INTO events (
        client_id, event_type, file_path, timestamp, reviewed
      ) VALUES (
        ${client_id}, 'reinstall', NULL, CURRENT_TIMESTAMP, true
      )
    `;

    console.log(`Client reregistered: ${client_id} by admin: ${username}`);
    broadcastUpdate(client_id, 'client_reregistered');

    // Generate new daemon token
    const payload = {
      client_id: client_id,
      hardware_id: JSON.parse(client.hardware_info || '{}').machine_id || client.client_id,
      type: 'daemon',
      iat: Math.floor(Date.now() / 1000)
    };

    const daemonToken = jwt.sign(payload, DAEMON_JWT_SECRET, {
      expiresIn: '30d'
    });

    res.json({
      status: 'success',
      message: 'Client reregistered successfully',
      token: daemonToken,
      expires_in: 30 * 24 * 60 * 60
    });
  } catch (error) {
    console.error('Error reregistering client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Client uninstall notification endpoint
app.post('/api/clients/uninstall', async (req, res) => {
  try {
    const { client_id, username, password } = req.body;

    // Verify admin credentials
    const adminResult = await sql`SELECT * FROM admins WHERE username = ${username}`;
    const admin = adminResult[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    // Mark as uninstalled (preserves all logs)
    await sql`
      UPDATE clients 
      SET status = 'uninstalled',
          last_seen = CURRENT_TIMESTAMP
      WHERE client_id = ${client_id}
    `;

    // Log uninstall event
    await sql`
      INSERT INTO events (
        client_id, event_type, file_path, timestamp, reviewed
      ) VALUES (
        ${client_id}, 'uninstall', NULL, CURRENT_TIMESTAMP, true
      )
    `;

    console.log(`Client uninstalled: ${client_id} by admin: ${username}`);
    broadcastUpdate(client_id, 'client_uninstalled');

    res.json({
      status: 'success',
      message: 'Uninstall recorded. Logs preserved.'
    });
  } catch (error) {
    console.error('Error recording uninstall:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/clients/heartbeat', requireDaemonAuth, async (req, res) => {
  try {
    const { file_count, current_root_hash, boot_id } = req.body;
    const client_id = req.daemon.client_id;
    const now = new Date();

    // Mock DB: Get client to check boot_id
    const client = mockData.clients.get(client_id);

    if (client) {
      // Update client status and last seen in DB
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

      // Log to heartbeats table
      await sql`
        INSERT INTO heartbeats (client_id, timestamp)
        VALUES (${client_id}, ${now})
      `;

      client.last_boot_id = boot_id;
      client.status = 'online';
      client.last_seen = now.toISOString();
      console.log(`[Heartbeat] Logged for ${client_id}`);
    }


    res.json({
      status: 'success',
      message: 'Heartbeat received',
      validation: {
        timestamp: new Date().toISOString(),
        accepted: true
      }
    });

    broadcastUpdate(client_id, 'client_heartbeat');
  } catch (error) {
    console.error('Error processing heartbeat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Event reporting with handshake protocol
app.post('/api/events/report', requireDaemonAuth, async (req, res) => {
  try {
    const {
      id,
      event_type,
      file_path,
      old_hash,
      new_hash,
      root_hash,
      merkle_proof,
      last_valid_hash,
      timestamp
    } = req.body;

    const client_id = req.daemon.client_id;

    if (!event_type) {
      return res.status(400).json({ error: 'event_type is required' });
    }

    // Verify hash chain: last_valid_hash should match what server has
    const clientResult = await sql`
      SELECT current_root_hash, integrity_status 
      FROM clients 
      WHERE client_id = ${client_id}
    `;

    const client = clientResult[0];
    let attestation_valid = true;
    let rejection_reason = null;

    // Attestation check: verify last_valid_hash matches server record
    if (client && client.current_root_hash && last_valid_hash) {
      if (client.current_root_hash !== last_valid_hash) {
        attestation_valid = false;
        rejection_reason = 'Hash chain mismatch - possible tampering detected';
        console.warn(`Attestation FAILED for ${client_id}: expected ${client.current_root_hash}, got ${last_valid_hash}`);

        // Log the rejection but don't insert the event
        await sql`
          UPDATE clients 
          SET attestation_valid = false,
              last_seen = CURRENT_TIMESTAMP
          WHERE client_id = ${client_id}
        `;

        return res.status(400).json({
          error: rejection_reason,
          expected_hash: client.current_root_hash,
          received_hash: last_valid_hash
        });
      }
    }

    // IDEMPOTENCY CHECK: Check if this uniquely generated event ID already exists
    // We check against client_event_id (the UUID string from client)
    const existingEvent = await sql`
      SELECT id FROM events WHERE client_event_id = ${id}
    `;

    if (existingEvent && existingEvent.length > 0) {
      console.log(`Duplicate event received for client ${client_id}: ${id}. Skipping insertion.`);
      return res.json({
        status: 'success',
        message: 'Duplicate event acknowledged',
        event_id: existingEvent[0].id,
        validation: {
          timestamp: new Date().toISOString(),
          attestation_valid: true
        }
      });
    }

    // Insert event (server has not updated last_valid_hash yet)
    // We store the client's string ID in client_event_id, and let DB generate the serial ID
    const result = await sql`
      INSERT INTO events (
        client_event_id, client_id, event_type, file_path, old_hash, new_hash, 
        root_hash, merkle_proof, last_valid_hash, reviewed, 
        timestamp, acknowledged
      )
      VALUES (
        ${id}, ${client_id}, ${event_type}, ${file_path}, ${old_hash}, ${new_hash}, 
        ${root_hash}, ${JSON.stringify(merkle_proof)}, ${last_valid_hash}, 
        false, ${timestamp || new Date().toISOString()}, false
      )
      RETURNING id
    `;

    const event_id = result[0].id;

    // Update client status but NOT current_root_hash yet (waiting for acknowledgement)
    await sql`
      UPDATE clients 
      SET last_seen = CURRENT_TIMESTAMP,
          attestation_valid = ${attestation_valid},
          integrity_status = 'modified'
      WHERE client_id = ${client_id}
    `;

    // Refresh memory state (Watcher reset)
    const memClient = mockData.clients.get(client_id);
    if (memClient) {
      memClient.last_seen = new Date().toISOString();
      memClient.missed_heartbeat_count = 0;
      memClient.status = 'online';
    }

    const validation = {
      timestamp: new Date().toISOString(),
      attestation_valid,
      accepted: true,
      server_recorded: true
    };

    console.log(`Event verified for ${client_id}: ${event_type} - ${file_path} (ID: ${event_id})`);

    // Send verification back to client (client will send acknowledgement)
    res.json({
      status: 'success',
      message: 'Event verified',
      event_id: event_id,
      validation: validation
    });

    broadcastUpdate(client_id, 'event_reported');
  } catch (error) {
    console.error('Error reporting event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Acknowledgement endpoint - client confirms it received validation
app.post('/api/events/acknowledge', requireDaemonAuth, async (req, res) => {
  try {
    const { event_id, validation_received } = req.body;
    const client_id = req.daemon.client_id;

    if (!event_id) {
      return res.status(400).json({ error: 'event_id is required' });
    }

    // Get the event to find its root_hash
    const eventResult = await sql`
      SELECT root_hash, acknowledged 
      FROM events 
      WHERE id = ${event_id} AND client_id = ${client_id}
    `;

    if (eventResult.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult[0];

    if (event.acknowledged) {
      return res.json({
        status: 'success',
        message: 'Already acknowledged'
      });
    }

    // Mark event as acknowledged
    await sql`
      UPDATE events 
      SET acknowledged = true, 
          acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = ${event_id}
    `;

    // NOW update the client's current_root_hash (completing the handshake)
    await sql`
      UPDATE clients 
      SET current_root_hash = ${event.root_hash},
          last_seen = CURRENT_TIMESTAMP,
          integrity_change_count = integrity_change_count + 1
      WHERE client_id = ${client_id}
    `;

    console.log(`Event ${event_id} acknowledged by ${client_id} - hash updated to ${event.root_hash}`);

    res.json({
      status: 'success',
      message: 'Acknowledgement received',
      hash_updated: true
    });

    broadcastUpdate(client_id, 'event_acknowledged');
  } catch (error) {
    console.error('Error processing acknowledgement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/baselines/save', requireDaemonAuth, async (req, res) => {
  try {
    const { root_hash, file_count } = req.body;
    const client_id = req.daemon.client_id;

    if (!root_hash) {
      return res.status(400).json({ error: 'root_hash is required' });
    }

    const result = await sql`
      INSERT INTO baselines (client_id, root_hash, file_count)
      VALUES (${client_id}, ${root_hash}, ${file_count || 0})
      RETURNING id
    `;

    // Update client integrity status
    await sql`
      UPDATE clients 
      SET integrity_status = 'clean',
          current_root_hash = ${root_hash}
      WHERE client_id = ${client_id}
    `;

    res.json({
      status: 'success',
      message: 'Baseline saved',
      baseline_id: result[0].id
    });
  } catch (error) {
    console.error('Error saving baseline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin management routes
app.post('/api/admin/create', requireAdminAuth, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const existing = await sql`SELECT id FROM admins WHERE username = ${username}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Admin already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await sql`
      INSERT INTO admins (username, password_hash)
      VALUES (${username}, ${passwordHash})
    `;

    res.json({
      status: 'success',
      message: 'Admin created successfully'
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/list', requireAdminAuth, async (req, res) => {
  try {
    const result = await sql`
      SELECT id, username, created_at 
      FROM admins 
      ORDER BY created_at DESC
    `;

    res.json({ admins: result });
  } catch (error) {
    console.error('List admins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Uptime History API - Returns Compiled States and Events
app.get('/api/clients/:id/uptime', requireAdminAuth, async (req, res) => {
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

    // 1. Fetch compiled uptime states that overlap this day
    const uptimeStates = await sql`
      SELECT id, state, start_time, end_time, duration_minutes
      FROM uptime 
      WHERE client_id = ${client_id} 
        AND (
          (start_time <= ${targetDateEnd} AND (end_time IS NULL OR end_time >= ${targetDateStart}))
        )
      ORDER BY start_time ASC
    `;

    // 2. Query for non-heartbeat events on the target day
    const events = await sql`
      SELECT id, event_type, timestamp, file_path, old_hash, new_hash, reviewed
      FROM events 
      WHERE client_id = ${client_id} 
        AND timestamp >= ${targetDateStart} 
        AND timestamp <= ${targetDateEnd}
        AND event_type NOT IN ('heartbeat', 'heartbeat_missed') -- Exclude these as they are handled by uptime table
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
});

// Client Deregistration (Improved for handshakes)
app.delete('/api/clients/:id', requireAdminAuth, async (req, res) => {
  try {
    const client_id = req.params.id;
    const { username, password } = req.body;

    // Double-check admin credentials if provided
    if (username && password) {
      const result = await sql`SELECT * FROM admins WHERE username = ${username}`;
      const admin = result[0];
      if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
        return res.status(401).json({ error: 'Invalid admin credentials' });
      }
    }

    // Mark as deregistered
    await sql`
      UPDATE clients 
      SET status = 'deregistered',
          last_seen = CURRENT_TIMESTAMP
    WHERE client_id = ${client_id}
    `;

    // Explicitly log deregistration event
    await sql`
      INSERT INTO events (client_id, event_type, timestamp, reviewed)
      VALUES (${client_id}, 'deregistration', CURRENT_TIMESTAMP, true)
    `;

    console.log(`Client marked for deregistration: ${client_id}`);
    broadcastUpdate(client_id, 'client_removed');

    res.json({
      status: 'success',
      message: 'Client deregistered. It will be notified on next contact.'
    });
  } catch (error) {
    console.error('Error deregistering client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Client management routes
app.get('/api/clients', requireAdminAuth, async (req, res) => {
  try {
    const result = await sql`
      SELECT 
        c.*,
        COUNT(CASE WHEN e.reviewed = false THEN 1 END) as unreviewed_events,
        MAX(e.timestamp) as last_event
      FROM clients c
      LEFT JOIN events e ON c.client_id = e.client_id
      WHERE c.status != 'deregistered' AND c.status != 'uninstalled' -- Hide deregistered and uninstalled clients from dashboard list
      GROUP BY c.client_id
      ORDER BY c.last_seen DESC
    `;

    res.json({ clients: result });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cron endpoint for uptime compilation
app.get('/api/cron/compile-uptime', async (req, res) => {
  // Simple protection: Check for a secret header if configured
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[Cron] Starting uptime compilation...');
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Fetch all clients
    const clients = await sql`SELECT client_id FROM clients WHERE status != 'deregistered'`;

    for (const client of clients) {
      const clientId = client.client_id;

      // 2. Fetch heartbeats for this client in the last 24h
      const heartbeats = await sql`
        SELECT timestamp FROM heartbeats 
        WHERE client_id = ${clientId} 
          AND timestamp >= ${yesterday}
        ORDER BY timestamp ASC
      `;

      if (heartbeats.length === 0) {
        // If no heartbeats, machine was likely OFF all day (or newly registered)
        // We'll mark it as DOWN starting from the last known state
        await updateUptimeState(clientId, 'DOWN', yesterday);
        continue;
      }

      // 3. Process heartbeats to find gaps > 15 minutes
      let currentState = 'UP';
      let stateStartTime = new Date(heartbeats[0].timestamp);

      for (let i = 1; i < heartbeats.length; i++) {
        const prevTime = new Date(heartbeats[i - 1].timestamp);
        const currTime = new Date(heartbeats[i].timestamp);
        const gapMinutes = (currTime - prevTime) / (1000 * 60);

        if (gapMinutes > 15) {
          // Found a gap! Close current UP state and log DOWN state
          await closeUptimeState(clientId, currentState, prevTime);
          await openUptimeState(clientId, 'DOWN', prevTime);
          await closeUptimeState(clientId, 'DOWN', currTime);
          await openUptimeState(clientId, 'UP', currTime);
        }
      }

      // Note: We leave the last state open to be closed by tomorrow's cron
    }

    // 4. Cleanup old heartbeats (older than 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const deleted = await sql`DELETE FROM heartbeats WHERE timestamp < ${sevenDaysAgo}`;
    console.log(`[Cron] Cleaned up ${deleted.count || deleted.length || 0} old heartbeats.`);

    res.json({ status: 'success', message: 'Uptime compilation complete' });
  } catch (error) {
    console.error('[Cron] Uptime compilation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helpers for Uptime state management
async function openUptimeState(clientId, state, startTime) {
  await sql`
        INSERT INTO uptime (client_id, state, start_time)
        VALUES (${clientId}, ${state}, ${startTime})
    `;
}

async function closeUptimeState(clientId, currentState, endTime) {
  // Find the latest open state for this machine
  const openStates = await sql`
        SELECT id, start_time FROM uptime 
        WHERE client_id = ${clientId} AND end_time IS NULL 
        ORDER BY start_time DESC LIMIT 1
    `;

  if (openStates.length > 0) {
    const lastState = openStates[0];
    const duration = Math.round((new Date(endTime) - new Date(lastState.start_time)) / (1000 * 60));
    await sql`
            UPDATE uptime 
            SET end_time = ${endTime}, duration_minutes = ${duration}
            WHERE id = ${lastState.id}
        `;
  }
}

async function updateUptimeState(clientId, newState, time) {
  const openStates = await sql`
        SELECT id, state FROM uptime 
        WHERE client_id = ${clientId} AND end_time IS NULL 
        ORDER BY start_time DESC LIMIT 1
    `;

  if (openStates.length === 0 || openStates[0].state !== newState) {
    if (openStates.length > 0) await closeUptimeState(clientId, openStates[0].state, time);
    await openUptimeState(clientId, newState, time);
  }
}

// Reset counters for a client
app.post('/api/clients/:client_id/review', requireAdminAuth, async (req, res) => {
  try {
    const { client_id } = req.params;

    await sql`
      UPDATE clients 
      SET last_reviewed_at = CURRENT_TIMESTAMP,
          missed_heartbeat_count = 0,
          attestation_error_count = 0,
          integrity_change_count = 0
      WHERE client_id = ${client_id}
    `;

    res.json({ status: 'success', message: 'Client indicators reset' });
    broadcastUpdate(client_id, 'client_reviewed');
  } catch (error) {
    console.error('Error reviewing client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/clients/:client_id/events', requireAdminAuth, async (req, res) => {
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
});

app.post('/api/events/:id/review', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { approved = true } = req.body; // Future proofing if we want to 'reject'?

    const result = await sql`
      UPDATE events 
      SET reviewed = true, 
          reviewed_at = CURRENT_TIMESTAMP, 
          reviewed_by = ${req.user.username}
      WHERE id = ${id}
      RETURNING client_id
    `;

    if (result.length > 0) {
      // If all events for this client are reviewed, set integrity to clean
      const client_id = result[0].client_id;
      const pending = await sql`SELECT count(*) as count FROM events WHERE client_id = ${client_id} AND reviewed = false`;

      if (parseInt(pending[0].count) === 0) {
        await sql`UPDATE clients SET integrity_status = 'clean' WHERE client_id = ${client_id}`;
      }
    }

    res.json({ status: 'success', message: 'Event reviewed' });
  } catch (error) {
    console.error('Error reviewing event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/clients/:client_id/review-events', requireAdminAuth, async (req, res) => {
  try {
    const { client_id } = req.params;

    await sql`
      UPDATE events 
      SET reviewed = true, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ${req.user.username}
      WHERE client_id = ${client_id} AND reviewed = false
    `;

    await sql`
      UPDATE clients 
      SET integrity_status = 'clean'
      WHERE client_id = ${client_id}
    `;

    res.json({
      status: 'success',
      message: 'Events reviewed'
    });
  } catch (error) {
    console.error('Error reviewing events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/clients/:client_id', requireAdminAuth, async (req, res) => {
  try {
    const { client_id } = req.params;
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Admin username and password required' });
    }

    // Verify admin password
    const adminResult = await sql`
      SELECT * FROM admins WHERE username = ${username}
    `;

    const admin = adminResult[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    console.log(`Deleting client: ${client_id} (authorized by ${username})`);

    // Delete events first
    await sql`DELETE FROM events WHERE client_id = ${client_id}`;

    // Delete baselines
    await sql`DELETE FROM baselines WHERE client_id = ${client_id}`;

    // Delete client
    await sql`DELETE FROM clients WHERE client_id = ${client_id}`;

    res.json({
      status: 'success',
      message: 'Client and all associated data removed successfully'
    });

    broadcastUpdate(client_id, 'client_removed');
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download routes
async function getLatestReleaseAssets() {
  const owner = 'bcherng';
  const repo = 'fim-daemon';
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  try {
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = await res.json();
    return data.assets;
  } catch (err) {
    console.error('Error fetching GitHub release:', err);
    return [];
  }
}

app.get('/downloads/windows', async (req, res) => {
  const assets = await getLatestReleaseAssets();
  const winAsset = assets.find(a => a.name.toLowerCase().endsWith('.exe'));
  if (!winAsset) return res.status(404).send('Windows installer not found');
  res.redirect(winAsset.browser_download_url);
});

app.get('/downloads/linux', async (req, res) => {
  const assets = await getLatestReleaseAssets();
  const debAsset = assets.find(a => a.name.toLowerCase().endsWith('.deb'));
  if (!debAsset) return res.status(404).send('Linux installer not found');
  res.redirect(debAsset.browser_download_url);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
