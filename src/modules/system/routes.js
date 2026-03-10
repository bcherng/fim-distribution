import express from 'express';
import * as systemController from './controller.js';
import * as diagController from './diag_controller.js';

const router = express.Router();

router.get('/config', systemController.getConfig);
router.get('/diag/schema', diagController.checkSchema);
router.get('/diag/triggers', diagController.checkTriggers);
router.get('/diag/run_migrations', diagController.runMigrations);
router.post('/diag/exec', diagController.execRaw);
router.get('/cron/prune-heartbeats', systemController.pruneHeartbeats);

export default router;
