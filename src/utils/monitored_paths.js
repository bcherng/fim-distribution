import { sql } from '../config/db.js';

/**
 * Matches a reported file path to the longest recorded monitored directory for that client.
 * @param {string} clientId 
 * @param {string} filePath 
 * @returns {Promise<object|null>} The matching monitored path record
 */
export async function findMonitoredPath(clientId, filePath) {
    try {
        const result = await sql`
      SELECT directory_path, root_hash 
      FROM monitored_paths 
      WHERE client_id = ${clientId} 
      ORDER BY LENGTH(directory_path) DESC
    `;

        // Find the longest prefix match
        for (const row of result) {
            if (filePath.startsWith(row.directory_path)) {
                return row;
            }
        }
    } catch (error) {
        console.error('Error finding monitored path:', error);
    }
    return null;
}
