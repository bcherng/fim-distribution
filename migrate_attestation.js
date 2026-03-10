import { sql } from './src/config/db.js';

async function migrate() {
    try {
        console.log("Renaming columns...");
        // Rename 'integrity_verified' to 'is_attested'
        await sql`ALTER TABLE endpoints RENAME COLUMN integrity_verified TO is_attested`;

        // Rename 'integrity_status' to 'integrity_state'
        await sql`ALTER TABLE endpoints RENAME COLUMN integrity_status TO integrity_state`;

        // Update event types
        console.log("Updating event types...");
        await sql`UPDATE events SET event_type = 'chain_conflict' WHERE event_type = 'attestation_failed'`;

        console.log("Migration successful");
        process.exit(0);
    } catch (e) {
        console.error("Migration failed:", e);
        process.exit(1);
    }
}
migrate();
