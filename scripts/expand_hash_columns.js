/**
 * Migration: Expand hash/signature columns from VARCHAR(64) to TEXT
 * in the events and endpoints tables to accommodate:
 *   - RSA-PSS signatures (256 bytes = 344 chars in base64)
 *   - SHA-256 hashes (64 hex chars — borderline on VARCHAR(64) with overhead)
 *   - last_valid_hash values that may have prefixes added during attacks
 */
import { sql } from '../src/config/db.js';

async function migrate() {
    console.log('Expanding VARCHAR(64) columns to TEXT in events and endpoints...');
    
    const alterations = [
        // events table
        `ALTER TABLE events ALTER COLUMN event_hash TYPE TEXT`,
        `ALTER TABLE events ALTER COLUMN prev_event_hash TYPE TEXT`,
        `ALTER TABLE events ALTER COLUMN signature TYPE TEXT`,
        `ALTER TABLE events ALTER COLUMN last_valid_hash TYPE TEXT`,
        `ALTER TABLE events ALTER COLUMN root_hash TYPE TEXT`,
        `ALTER TABLE events ALTER COLUMN old_hash TYPE TEXT`,
        `ALTER TABLE events ALTER COLUMN new_hash TYPE TEXT`,
        // endpoints table
        `ALTER TABLE endpoints ALTER COLUMN current_root_hash TYPE TEXT`,
        `ALTER TABLE endpoints ALTER COLUMN last_accepted_event_hash TYPE TEXT`,
    ];

    for (const stmt of alterations) {
        try {
            await sql.unsafe(stmt);
            console.log(`  ✓ ${stmt}`);
        } catch (err) {
            // Column may already be TEXT or not exist — safe to skip
            console.log(`  ~ skipped: ${err.message.split('\n')[0]}`);
        }
    }

    console.log('\nMigration complete.');
    process.exit(0);
}

migrate();
