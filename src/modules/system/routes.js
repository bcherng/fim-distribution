import express from 'express';
import * as systemController from './controller.js';
import * as diagController from './diag_controller.js';
import * as uptimeController from '../uptime/controller.js';

const router = express.Router();

router.get('/config', systemController.getConfig);
router.get('/cron/compile-uptime', uptimeController.compileUptime);
router.get('/diag/schema', diagController.checkSchema);

export default router;
