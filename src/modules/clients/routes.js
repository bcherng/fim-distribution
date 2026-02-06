import express from 'express';
import * as clientsController from './controller.js';
import { requireAdminAuth, requireDaemonAuth } from '../../middleware/auth.js';

const router = express.Router();

// Daemon facing routes
router.post('/register', clientsController.register);
router.post('/verify', requireDaemonAuth, clientsController.verify);
router.post('/heartbeat', requireDaemonAuth, clientsController.heartbeat);

// Admin facing routes
router.get('/clients', requireAdminAuth, clientsController.getClients);
router.get('/clients/:client_id', requireAdminAuth, clientsController.getClientDetails);
router.delete('/clients/:id', requireAdminAuth, clientsController.deleteClient);
router.post('/clients/reregister', clientsController.reregister);
router.post('/clients/uninstall', clientsController.uninstall);

export default router;
