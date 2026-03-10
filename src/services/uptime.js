import { sql } from '../config/db.js';

export const processHeartbeatUptime = async (client_id, now) => {
    // Real-time Uptime Tracking (Event Driven)
    // Find the absolute latest uptime record (open or closed)
    const lastUptime = await sql`
        SELECT id, state, start_time, end_time 
        FROM uptime 
        WHERE client_id = ${client_id}
        ORDER BY start_time DESC 
        LIMIT 1
    `;

    if (lastUptime.length === 0) {
        // First ever heartbeat
        await sql`INSERT INTO uptime (client_id, state, start_time, end_time, duration_minutes) VALUES (${client_id}, 'UP', ${now}, ${now}, 0)`;
    } else {
        const record = lastUptime[0];
        const lastEnd = new Date(record.end_time || record.start_time);
        const gapMs = now - lastEnd;
        const gapMinutes = gapMs / (1000 * 60);

        if (gapMs <= 0) {
            // Ignore redundant heartbeat or clock skew
            console.log(`[Heartbeat] Redundant at ${now.toISOString()}`);
        } else if (record.state === 'UP') {
            if (gapMinutes <= 16) { // 15m + buffer
                // Extend current session
                const newDuration = Math.round((now - new Date(record.start_time)) / (1000 * 60));
                await sql`
                    UPDATE uptime 
                    SET end_time = ${now}, duration_minutes = ${newDuration}
                    WHERE id = ${record.id}
                `;
            } else {
                // Gap detected (>15m) -> Downtime
                // 1. Close old UP session explicitly
                const finalUpDuration = Math.max(0, Math.round((lastEnd - new Date(record.start_time)) / (1000 * 60)));
                await sql`
                    UPDATE uptime SET end_time = ${lastEnd}, duration_minutes = ${finalUpDuration}
                    WHERE id = ${record.id}
                `;

                // 2. Insert DOWN session for the gap
                const downDuration = Math.round((now - lastEnd) / (1000 * 60));
                await sql`
                    INSERT INTO uptime (client_id, state, start_time, end_time, duration_minutes)
                    VALUES (${client_id}, 'DOWN', ${lastEnd}, ${now}, ${downDuration})
                `;

                // 3. Start new UP session
                await sql`
                    INSERT INTO uptime (client_id, state, start_time, end_time, duration_minutes) 
                    VALUES (${client_id}, 'UP', ${now}, ${now}, 0)
                `;
            }
        } else {
            // Last state was DOWN (or other) -> Start new UP
            // First, ensure any previous record is closed if it was somehow left open
            if (!record.end_time) {
                await sql`UPDATE uptime SET end_time = ${now} WHERE id = ${record.id}`;
            }

            await sql`
                INSERT INTO uptime (client_id, state, start_time, end_time, duration_minutes) 
                VALUES (${client_id}, 'UP', ${now}, ${now}, 0)
            `;
        }
    }
};
