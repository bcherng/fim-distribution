import express from 'express';
import * as eventsController from './controller.js';
import { requireAdminAuth, requireDaemonAuth } from '../../middleware/auth.js';

const router = express.Router();

router.post('/report-event', requireDaemonAuth, eventsController.reportEvent);
router.post('/events/acknowledge', requireDaemonAuth, eventsController.acknowledgeEvent);
router.get('/events/:client_id', requireAdminAuth, eventsController.getClientEvents);
router.post('/events/review/:id', requireAdminAuth, eventsController.reviewEvent);

export default router;
