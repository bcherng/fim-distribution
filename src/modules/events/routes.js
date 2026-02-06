import express from 'express';
import * as eventsController from './controller.js';
import { requireAdminAuth, requireDaemonAuth } from '../../middleware/auth.js';

const router = express.Router();

router.post('/report', requireDaemonAuth, eventsController.reportEvent);
router.post('/acknowledge', requireDaemonAuth, eventsController.acknowledgeEvent);
router.get('/:client_id', requireAdminAuth, eventsController.getClientEvents);
router.post('/:id/review', requireAdminAuth, eventsController.reviewEvent);

export default router;
