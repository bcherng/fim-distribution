import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config();
const sql = neon(process.env.DATABASE_URL);

async function main() {
    try {
        console.log("Querying triggers...");
        const triggers = await sql`
            SELECT event_object_table, trigger_name, action_statement 
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
        `;
        console.log("Found triggers:", triggers);
    } catch (e) {
        console.error(e);
    }
}

main();
