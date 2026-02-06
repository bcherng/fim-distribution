import express from 'express';
import * as uptimeController from './controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = express.Router();

router.get('/:id', requireAdminAuth, uptimeController.getUptimeHistory);
router.get('/compile/now', uptimeController.compileUptime); // This will be used in system routes later or kept here

export default router;
