-- Minimal Forensic Schema for FIM (File Integrity Monitoring)

-- Endpoints/Monitored Machines
CREATE TABLE endpoints (
    client_id TEXT PRIMARY KEY,
    public_key TEXT,                       -- Client's RSA-PSS public key
    status TEXT DEFAULT 'online',          -- online, offline, uninstalled
    integrity_state TEXT DEFAULT 'CLEAN',  -- CLEAN, TAINTED
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
