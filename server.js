import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { neon } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database connection
const sql = neon(process.env.DATABASE_URL);

// Initialize database tables
async function initDB() {
  try {
    // Create clients table
    await sql`
      CREATE TABLE IF NOT EXISTS clients (
        client_id VARCHAR(255) PRIMARY KEY,
        hardware_info JSONB,
        baseline_id INTEGER DEFAULT 1,
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'online',
        file_count INTEGER DEFAULT 0,
        current_root_hash VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create events table
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(255) REFERENCES clients(client_id),
        event_type VARCHAR(50) NOT NULL,
        file_path TEXT,
        old_hash VARCHAR(64),
        new_hash VARCHAR(64),
        root_hash VARCHAR(64),
        merkle_proof JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create baselines table
    await sql`
      CREATE TABLE IF NOT EXISTS baselines (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(255) REFERENCES clients(client_id),
        root_hash VARCHAR(64) NOT NULL,
        file_count INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    console.log('Neon database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing Neon database:', error);
  }
}

// Initialize database on startup
initDB();

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await sql`SELECT 1`;
    res.json({ 
      status: 'healthy', 
      database: 'neon connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'neon disconnected',
      error: error.message 
    });
  }
});

// API: Register client
app.post('/api/clients/register', async (req, res) => {
  try {
    const { client_id, hardware_info, baseline_id, platform } = req.body;
    
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    
    // Upsert client data
    await sql`
      INSERT INTO clients (client_id, hardware_info, baseline_id, status, file_count)
      VALUES (${client_id}, ${JSON.stringify(hardware_info)}, ${baseline_id || 1}, 'online', 0)
      ON CONFLICT (client_id) 
      DO UPDATE SET 
        hardware_info = EXCLUDED.hardware_info,
        baseline_id = EXCLUDED.baseline_id,
        last_seen = CURRENT_TIMESTAMP,
        status = 'online'
    `;
    
    console.log(`Client registered with Neon: ${client_id}`);
    res.json({ 
      status: 'success', 
      message: 'Client registered successfully',
      client_id 
    });
  } catch (error) {
    console.error('Error registering client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API: Heartbeat
app.post('/api/clients/heartbeat', async (req, res) => {
  try {
    const { client_id, file_count, current_root_hash } = req.body;
    
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }
    
    await sql`
      UPDATE clients 
      SET last_seen = CURRENT_TIMESTAMP, 
          status = 'online',
          file_count = ${file_count || 0},
          current_root_hash = ${current_root_hash}
      WHERE client_id = ${client_id}
    `;
    
    res.json({ status: 'success', message: 'Heartbeat received' });
  } catch (error) {
    console.error('Error processing heartbeat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API: Report event
app.post('/api/events/report', async (req, res) => {
  try {
    const { 
      client_id, 
      event_type, 
      file_path, 
      old_hash, 
      new_hash, 
      root_hash, 
      merkle_proof 
    } = req.body;
    
    if (!client_id || !event_type) {
      return res.status(400).json({ error: 'client_id and event_type are required' });
    }
    
    // Insert event
    const result = await sql`
      INSERT INTO events (client_id, event_type, file_path, old_hash, new_hash, root_hash, merkle_proof)
      VALUES (${client_id}, ${event_type}, ${file_path}, ${old_hash}, ${new_hash}, ${root_hash}, ${JSON.stringify(merkle_proof)})
      RETURNING id
    `;
    
    // Update client's current root hash if provided
    if (root_hash) {
      await sql`
        UPDATE clients 
        SET current_root_hash = ${root_hash},
            last_seen = CURRENT_TIMESTAMP
        WHERE client_id = ${client_id}
      `;
    }
    
    console.log(`Event recorded in Neon for ${client_id}: ${event_type} - ${file_path}`);
    res.json({ 
      status: 'success', 
      message: 'Event recorded',
      event_id: result[0].id
    });
  } catch (error) {
    console.error('Error reporting event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API: Get client status
app.get('/api/clients/:client_id', async (req, res) => {
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

// API: Get client events
app.get('/api/clients/:client_id/events', async (req, res) => {
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

// API: Get all clients for dashboard
app.get('/api/clients', async (req, res) => {
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

// API: Save baseline
app.post('/api/baselines/save', async (req, res) => {
  try {
    const { client_id, root_hash, file_count } = req.body;
    
    if (!client_id || !root_hash) {
      return res.status(400).json({ error: 'client_id and root_hash are required' });
    }
    
    const result = await sql`
      INSERT INTO baselines (client_id, root_hash, file_count)
      VALUES (${client_id}, ${root_hash}, ${file_count || 0})
      RETURNING id
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

// API: Get baselines for client
app.get('/api/clients/:client_id/baselines', async (req, res) => {
  try {
    const { client_id } = req.params;
    
    const result = await sql`
      SELECT * FROM baselines 
      WHERE client_id = ${client_id} 
      ORDER BY created_at DESC
    `;
    
    res.json({ baselines: result });
  } catch (error) {
    console.error('Error fetching baselines:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Rest of your existing routes (downloads, etc.)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/machine/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'machine.html'));
});

// Function to fetch the latest release assets from GitHub
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
app.listen(PORT, () => console.log(`Server running on port ${PORT} with Neon Postgres`));
