import { verifyAdmin } from '../../utils/admin.js';
import { createSession, deleteSession } from '../../utils/session.js';
import jwt from 'jsonwebtoken';

const ACTION_JWT_SECRET = process.env.ACTION_JWT_SECRET || 'your-default-action-secret-key';

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

export const actionToken = async (req, res) => {
    try {
        const { username, password, action, client_id } = req.body;
        if (!action || !client_id) {
            return res.status(400).json({ error: 'Action and client_id are required' });
        }

        const admin = await verifyAdmin(username, password);
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { admin_id: admin.id, action, client_id },
            ACTION_JWT_SECRET,
            { expiresIn: '5m' }
        );

        res.json({ status: 'success', token });
    } catch (error) {
        console.error('Action token error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const verifyActionToken = async (req, res) => {
    try {
        const { token, action, client_id } = req.body;
        if (!token || !action || !client_id) {
            return res.status(400).json({ error: 'Token, action, and client_id are required' });
        }

        const decoded = jwt.verify(token, ACTION_JWT_SECRET);

        if (decoded.action !== action || decoded.client_id !== client_id) {
            return res.status(403).json({ error: 'Token scope mismatch' });
        }

        res.json({ status: 'success', valid: true, admin_id: decoded.admin_id });
    } catch (error) {
        console.error('Verify action token error:', error);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};
