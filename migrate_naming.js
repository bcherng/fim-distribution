import dotenv from 'dotenv';
import { sql } from './src/config/db.js';
dotenv.config();

async function migrate() {
    try {
        console.log("Checking tables...");
        await sql`ALTER TABLE clients RENAME TO endpoints`;
        await sql`ALTER TABLE endpoints RENAME COLUMN attestation_valid TO integrity_verified`;
        await sql`ALTER TABLE endpoints RENAME COLUMN file_count TO tracked_file_count`;
        await sql`ALTER TABLE monitored_paths RENAME COLUMN file_count TO tracked_file_count`;
        console.log("Migration successful");
        process.exit(0);
    } catch (e) {
        console.error("Migration failed:", e);
        process.exit(1);
    }
}
migrate();
