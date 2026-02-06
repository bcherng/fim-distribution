import path from 'path';

const ROOT_DIR = process.cwd();

export const serveIndex = (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'public', 'index.html'));
};

export const serveLogin = (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'public', 'login.html'));
};

export const serveDashboard = (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'public', 'dashboard.html'));
};

export const serveMachine = (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'public', 'machine.html'));
};
