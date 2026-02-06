import { sql } from '../config/db.js';

export async function openUptimeState(clientId, state, startTime) {
    await sql`
    INSERT INTO uptime (client_id, state, start_time)
    VALUES (${clientId}, ${state}, ${startTime})
  `;
}

export async function closeUptimeState(clientId, currentState, endTime) {
    const openStates = await sql`
    SELECT id, start_time FROM uptime 
    WHERE client_id = ${clientId} AND end_time IS NULL 
    ORDER BY start_time DESC LIMIT 1
  `;

    if (openStates.length > 0) {
        const lastState = openStates[0];
        const duration = Math.round((new Date(endTime) - new Date(lastState.start_time)) / (1000 * 60));
        await sql`
      UPDATE uptime 
      SET end_time = ${endTime}, duration_minutes = ${duration}
      WHERE id = ${lastState.id}
    `;
    }
}

export async function updateUptimeState(clientId, newState, time) {
    const openStates = await sql`
    SELECT id, state FROM uptime 
    WHERE client_id = ${clientId} AND end_time IS NULL 
    ORDER BY start_time DESC LIMIT 1
  `;

    if (openStates.length === 0 || openStates[0].state !== newState) {
        if (openStates.length > 0) await closeUptimeState(clientId, openStates[0].state, time);
        await openUptimeState(clientId, newState, time);
    }
}
