import express from 'express';
import * as endpointsController from './controller.js';
import * as eventsController from '../events/controller.js';
import * as uptimeController from '../uptime/controller.js';
import { requireAdminAuth, requireDaemonAuth } from '../../middleware/auth.js';

const router = express.Router();

// Daemon facing routes
router.post('/register', endpointsController.register);
router.post('/verify', requireDaemonAuth, endpointsController.verify);
router.post('/heartbeat', requireDaemonAuth, endpointsController.heartbeat);
router.post('/baseline', requireDaemonAuth, endpointsController.saveBaseline);

// Admin facing routes
router.get('/', requireAdminAuth, endpointsController.getClients);
router.get('/:client_id', requireAdminAuth, endpointsController.getClientDetails);
router.get('/:client_id/events', requireAdminAuth, eventsController.getClientEvents);
router.get('/:client_id/uptime', requireAdminAuth, uptimeController.getUptimeHistory);
router.post('/:client_id/review', requireAdminAuth, endpointsController.reviewClient);
router.delete('/:id', requireAdminAuth, endpointsController.deleteClient);
router.post('/reregister', endpointsController.reregister);
router.post('/uninstall', endpointsController.uninstall);

export default router;
