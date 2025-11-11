import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
let sql;
async function initDatabase() {
  try {
    const { neon } = await import('@neondatabase/serverless');
    sql = neon(process.env.DATABASE_URL);
    console.log('Neon database connection initialized');
  } catch (error) {
    console.error('Failed to initialize Neon database:', error);
    // Fallback to a mock implementation for development
    sql = {
      async query(query, params) {
        console.log('Mock query:', query, params);
        return [];
      }
    };
  }
}

// Initialize database on startup
initDatabase();

// Authentication middleware
async function requireAuth(req, res, next) {
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

// Session management functions
async function createSession(userId, username) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
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

// Clean up expired sessions every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Routes
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

// API Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Get admin from database
    const result = await sql`
      SELECT * FROM admins WHERE username = ${username}
    `;
    
    const admin = result[0];
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Create session
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

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const sessionId = req.headers.authorization.replace('Bearer ', '');
    await deleteSession(sessionId);
    res.json({ status: 'success', message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/check', requireAuth, (req, res) => {
  res.json({ authenticated: true, user: req.user });
});

// Admin management routes (protected)
app.post('/api/admin/create', requireAuth, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Check if admin already exists
    const existing = await sql`SELECT id FROM admins WHERE username = ${username}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Admin already exists' });
    }
    
    // Hash password and create admin
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

app.get('/api/admin/list', requireAuth, async (req, res) => {
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

// Client API routes (protected)
app.get('/api/clients', requireAuth, async (req, res) => {
  try {
    const result = await sql`
      SELECT 
        c.*,
        COUNT(e.id) as event_count,
        MAX(e.timestamp) as last_event
      FROM clients c
      LEFT JOIN events e ON c.client_id = e.client_id
      GROUP BY c.client_id
      ORDER BY c.last_seen DESC
    `;
    
    res.json({ clients: result });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/clients/:client_id', requireAuth, async (req, res) => {
  try {
    const { client_id } = req.params;
    
    const result = await sql`
      SELECT * FROM clients WHERE client_id = ${client_id}
    `;
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    res.json({ client: result[0] });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/clients/:client_id/events', requireAuth, async (req, res) => {
  try {
    const { client_id } = req.params;
    const { limit = 50 } = req.query;
    
    const result = await sql`
      SELECT * FROM events 
      WHERE client_id = ${client_id} 
      ORDER BY timestamp DESC 
      LIMIT ${parseInt(limit)}
    `;
    
    res.json({ events: result });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download routes (public)
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