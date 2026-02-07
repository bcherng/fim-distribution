
import { sql } from '../src/config/db.js';

async function migrate() {
    console.log('Starting uptime migration...');

    try {
        // Clear existing uptime data to rebuild from scratch (optional, but cleaner)
        // await sql`TRUNCATE TABLE uptime`; 

        const clients = await sql`SELECT client_id FROM clients`;

        for (const client of clients) {
            const clientId = client.client_id;
            console.log(`Processing client: ${clientId}`);

            // Fetch all heartbeats for this client, ordered by time
            const heartbeats = await sql`
                SELECT timestamp FROM heartbeats 
                WHERE client_id = ${clientId} 
                ORDER BY timestamp ASC
            `;

            if (heartbeats.length === 0) continue;

            let currentStart = new Date(heartbeats[0].timestamp);
            let currentEnd = currentStart;

            console.log(`  Found ${heartbeats.length} heartbeats.`);

            // Insert initial state
            // We'll buffer the writes or write sequentially
            let sessionCount = 0;

            for (let i = 1; i < heartbeats.length; i++) {
                const prev = new Date(heartbeats[i - 1].timestamp);
                const curr = new Date(heartbeats[i].timestamp);
                const gapMinutes = (curr - prev) / (1000 * 60);

                if (gapMinutes > 15) {
                    // GAP DETECTED: Close previous UP session
                    await recordSession(clientId, 'UP', currentStart, prev);

                    // Record DOWN session for the gap
                    await recordSession(clientId, 'DOWN', prev, curr);

                    // Start new UP session
                    currentStart = curr;
                    sessionCount += 2;
                }

                currentEnd = curr;
            }

            // Close final session (it's arguably still open if recent, but for migration we close at last element)
            // The live system will pick up from here.
            await recordSession(clientId, 'UP', currentStart, currentEnd);
            sessionCount++;

            console.log(`  Migrated ${sessionCount} sessions.`);
        }

        console.log('Migration complete.');
        process.exit(0);

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

async function recordSession(clientId, state, start, end) {
    const duration = Math.round((end - start) / (1000 * 60));
    // If duration is 0 (single heartbeat), it's still a momentary check-in.

    await sql`
        INSERT INTO uptime (client_id, state, start_time, end_time, duration_minutes)
        VALUES (${clientId}, ${state}, ${start}, ${end}, ${duration})
    `;
}

migrate();
