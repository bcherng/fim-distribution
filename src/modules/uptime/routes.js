import express from 'express';
import * as uptimeController from './controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = express.Router();

router.get('/:id', requireAdminAuth, uptimeController.getUptimeHistory);

export default router;
