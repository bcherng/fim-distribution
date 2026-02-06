import express from 'express';
import * as clientsController from './controller.js';
import { requireAdminAuth, requireDaemonAuth } from '../../middleware/auth.js';

const router = express.Router();

// Daemon facing routes
router.post('/register', clientsController.register);
router.post('/verify', requireDaemonAuth, clientsController.verify);
router.post('/heartbeat', requireDaemonAuth, clientsController.heartbeat);

// Admin facing routes
router.get('/', requireAdminAuth, clientsController.getClients);
router.get('/:client_id', requireAdminAuth, clientsController.getClientDetails);
router.delete('/:id', requireAdminAuth, clientsController.deleteClient);
router.post('/reregister', clientsController.reregister);
router.post('/uninstall', clientsController.uninstall);

export default router;
