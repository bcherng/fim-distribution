import express from 'express';
import path from 'path';
import uiRoutes from './modules/ui/routes.js';
import authRoutes from './modules/auth/routes.js';
import clientRoutes from './modules/clients/routes.js';
import eventRoutes from './modules/events/routes.js';
import downloadRoutes from './modules/downloads/routes.js';
import systemRoutes from './modules/system/routes.js';

const app = express();
const ROOT_DIR = process.cwd();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT_DIR, 'public')));

// Routes
app.use('/', uiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/clients/:id/uptime', uptimeRoutes);
app.use('/api/events', eventRoutes);
app.use('/downloads', downloadRoutes);
app.use('/api', systemRoutes);

// Add health check for daemon connectivity tests
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

export default app;
