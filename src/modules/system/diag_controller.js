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

export const checkTriggers = async (req, res) => {
    try {
        const triggers = await sql`
            SELECT event_object_table, trigger_name, action_statement 
            FROM information_schema.triggers
        `;
        const fk = await sql`
            SELECT
                tc.table_name, kcu.column_name, tc.constraint_name,
                ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name 
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
        `;
        const rules = await sql`SELECT rulename, definition FROM pg_rules WHERE tablename = 'endpoints' OR tablename = 'events'`;

        res.json({ status: 'success', triggers, fk, rules });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

export const execRaw = async (req, res) => {
    try {
        if (req.query.secret !== 'tempadmin') return res.status(403).json({ error: "unauthorized" });

        const q = req.body.query;
        if (!q) return res.status(400).json({ error: "No query" });

        const result = await sql.unsafe(q);
        res.json({ status: 'success', result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};
