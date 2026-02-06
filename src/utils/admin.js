import bcrypt from 'bcryptjs';
import { sql } from '../config/db.js';

/**
 * Verifies admin credentials.
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<object|null>} Admin record if valid, else null
 */
export async function verifyAdmin(username, password) {
    if (!username || !password) return null;

    try {
        console.log(`[AdminVerify] Checking user: ${username}`);
        const result = await sql`SELECT * FROM admins WHERE username = ${username}`;
        const admin = result[0];

        if (!admin) {
            console.warn(`[AdminVerify] User not found: ${username}`);
            return null;
        }

        const match = await bcrypt.compare(password, admin.password_hash);
        console.log(`[AdminVerify] Password match for ${username}: ${match}`);

        if (match) return admin;
    } catch (error) {
        console.error('[AdminVerify] Error:', error);
    }

    return null;
}
