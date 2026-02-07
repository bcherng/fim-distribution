import express from 'express';
import * as systemController from './controller.js';
import * as diagController from './diag_controller.js';

const router = express.Router();

router.get('/config', systemController.getConfig);
router.get('/diag/schema', diagController.checkSchema);

export default router;
