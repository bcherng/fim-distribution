import crypto from 'crypto';
import { sql } from '../config/db.js';

/**
 * Creates a new session in the database.
 * @param {number} userId 
 * @param {string} username 
 * @returns {Promise<string>} The session ID
 */
export async function createSession(userId, username) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await sql`
    INSERT INTO sessions (session_id, user_id, username, expires_at)
    VALUES (${sessionId}, ${userId}, ${username}, ${expiresAt.toISOString()})
  `;

    return sessionId;
}

/**
 * Retrieves a session from the database.
 * @param {string} sessionId 
 * @returns {Promise<object|null>} The session object if found, else null
 */
export async function getSession(sessionId) {
    try {
        const result = await sql`
      SELECT * FROM sessions WHERE session_id = ${sessionId}
    `;
        return result[0] || null;
    } catch (error) {
        console.error('Error getting session:', error);
        return null;
    }
}

/**
 * Deletes a session from the database.
 * @param {string} sessionId 
 */
export async function deleteSession(sessionId) {
    try {
        await sql`DELETE FROM sessions WHERE session_id = ${sessionId}`;
    } catch (error) {
        console.error('Error deleting session:', error);
    }
}
