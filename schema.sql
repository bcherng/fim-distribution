-- Minimal Forensic Schema for FIM (File Integrity Monitoring)

-- Endpoints/Monitored Machines
CREATE TABLE endpoints (
    client_id TEXT PRIMARY KEY,
    public_key TEXT,                       -- Client's RSA-PSS public key
    status TEXT DEFAULT 'online',          -- online, offline, uninstalled
    integrity_state TEXT DEFAULT 'CLEAN',  -- CLEAN, TAINTED
    is_attested BOOLEAN DEFAULT TRUE,      -- Cached attestation status
    hardware_info JSONB,                   -- Hardware details
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat TIMESTAMP,
    current_root_hash TEXT,                -- Latest globally accepted root hash
    last_accepted_event_hash TEXT,         -- Anchor for the rolling hash chain
    tracked_file_count INTEGER DEFAULT 0,
    last_boot_id TEXT,
    last_reviewed_at TIMESTAMP
);

-- Integrated Events Log
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    client_id TEXT REFERENCES endpoints(client_id),
    client_event_id TEXT,                  -- UID from the daemon
    event_type TEXT NOT NULL,               -- modified, created, deleted, mismatch, heartbeat_missed
    file_path TEXT,
    old_hash TEXT,
    new_hash TEXT,
    root_hash TEXT,                        -- Resulting Merkle root
    merkle_proof JSONB,
    last_valid_hash TEXT,                  -- The previous hash the daemon claimed to build upon
    event_hash TEXT,                       -- The cumulative hash of this event
    prev_event_hash TEXT,                  -- The hash of the actual previous event in the chain
    signature TEXT,                        -- Witness signature from the device
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed BOOLEAN DEFAULT FALSE,        -- Admin review status
    reviewed_at TIMESTAMP,
    reviewed_by TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,    -- Daemon sync status
    acknowledged_at TIMESTAMP
);

-- Administrative Tables
CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES admins(id),
    username TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed with default admin (password: admin123)
-- Hash generated via bcrypt: $2a$10$o8.X2K7Z0E9s.wDqS8fV.eQ.r.8.X2K7Z0E9s.wDqS8fV.eQ.r
INSERT INTO admins (username, password_hash) 
VALUES ('bcherng', '$2a$12$qrwx0wgCZo5JXvtHBOqAGeC0Jp.cAXbFshP1V1nj1VOnAy3kJTwne'); 
-- Note: Replace with actual bcrypt hash for 'admin123' if known, or just dummy for development.

-- Monitored Directories
CREATE TABLE monitored_paths (
    client_id TEXT REFERENCES endpoints(client_id),
    directory_path TEXT NOT NULL,
    root_hash TEXT,
    tracked_file_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (client_id, directory_path)
);

-- Raw Heartbeat Stream
CREATE TABLE heartbeats (
    id SERIAL PRIMARY KEY,
    client_id TEXT REFERENCES endpoints(client_id),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Uptime/Downtime Tracking
CREATE TABLE uptime (
    id SERIAL PRIMARY KEY,
    client_id TEXT REFERENCES endpoints(client_id),
    state TEXT NOT NULL,                  -- UP, DOWN
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
