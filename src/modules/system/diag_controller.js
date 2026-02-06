import { sql } from '../../config/db.js';

export const checkSchema = async (req, res) => {
    try {
        const tableInfo = await sql`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      ORDER BY table_name, ordinal_position
    `;

        const tables = {};
        tableInfo.forEach(row => {
            if (!tables[row.table_name]) tables[row.table_name] = [];
            tables[row.table_name].push({
                col: row.column_name,
                type: row.data_type,
                null: row.is_nullable
            });
        });

        res.json({ status: 'success', tables });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};
