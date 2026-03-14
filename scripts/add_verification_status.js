import { sql } from '../src/config/db.js';

async function migrate() {
    console.log('Adding verification_status to events and updating endpoints...');
    
    try {
        // Add verification_status to events
        await sql.unsafe(`ALTER TABLE events ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'VERIFIED'`);
        console.log('  ✓ Added verification_status to events');

        // Ensure integrity_state can handle our new statuses (it's already TEXT)
        // No change needed for integrity_state if it's already TEXT, but let's be sure.
        await sql.unsafe(`ALTER TABLE endpoints ALTER COLUMN integrity_state TYPE TEXT`);
        console.log('  ✓ Ensured integrity_state is TEXT');

    } catch (err) {
        console.error('Migration failed:', err);
    }

    console.log('\nMigration complete.');
    process.exit(0);
}

migrate();
