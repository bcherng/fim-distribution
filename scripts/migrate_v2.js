import { sql } from '../src/config/db.js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env if not in production
if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

async function migrate() {
    console.log('Starting V2 Database Migration...');

    try {
        console.log('Adding public_key to clients table...');
        await sql`
            ALTER TABLE clients 
            ADD COLUMN IF NOT EXISTS public_key TEXT;
        `;

        console.log('Adding event_hash, prev_event_hash, and signature to events table...');
        await sql`
            ALTER TABLE events 
            ADD COLUMN IF NOT EXISTS event_hash VARCHAR(64),
            ADD COLUMN IF NOT EXISTS prev_event_hash VARCHAR(64),
            ADD COLUMN IF NOT EXISTS signature TEXT;
        `;

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
