import { verifyAdmin } from '../../utils/admin.js';
import { createSession, deleteSession } from '../../utils/session.js';

export const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await verifyAdmin(username, password);

        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const sessionId = await createSession(admin.id, admin.username);
        res.json({
            status: 'success',
            message: 'Login successful',
            token: sessionId,
            user: { id: admin.id, username: admin.username }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const logout = async (req, res) => {
    try {
        const sessionId = req.headers.authorization.replace('Bearer ', '');
        await deleteSession(sessionId);
        res.json({ status: 'success', message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const checkAuth = (req, res) => {
    res.json({ authenticated: true, user: req.user });
};

export const verifyAdminCredentials = async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await verifyAdmin(username, password);

        if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

        res.json({
            status: 'success',
            valid: true,
            admin: { id: admin.id, username: admin.username }
        });
    } catch (error) {
        console.error('Admin verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
