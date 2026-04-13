import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { globalLimiter, authLimiter } from './middleware/rate_limit.js';
import uiRoutes from './modules/ui/routes.js';
import authRoutes from './modules/auth/routes.js';
import endpointRoutes from './modules/endpoints/routes.js';
import eventRoutes from './modules/events/routes.js';
import downloadRoutes from './modules/downloads/routes.js';
import systemRoutes from './modules/system/routes.js';

/**
 * FIM Distribution Server - Core Application
 */
const app = express();
const ROOT_DIR = process.cwd();

app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://js.pusher.com", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            connectSrc: ["'self'", "wss://*.pusher.com", "https://*.pusher.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"]
        }
    }
}));
app.use(globalLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT_DIR, 'public')));

app.use('/', uiRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/clients/register', authLimiter);
app.use('/api/endpoints', endpointRoutes);
app.use('/api/clients', endpointRoutes);
app.use('/api/events', eventRoutes);
app.use('/downloads', downloadRoutes);
app.use('/api', systemRoutes);

app.get('/api/health', (req, res) => res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
}));

export default app;
