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
        const result = await sql`SELECT * FROM admins WHERE username = ${username}`;
        const admin = result[0];

        if (admin && await bcrypt.compare(password, admin.password_hash)) {
            return admin;
        }
    } catch (error) {
        console.error('Error verifying admin:', error);
    }

    return null;
}
