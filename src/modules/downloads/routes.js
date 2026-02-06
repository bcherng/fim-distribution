import express from 'express';
import * as downloadsController from './controller.js';

const router = express.Router();

router.get('/windows', downloadsController.downloadWindows);
router.get('/linux', downloadsController.downloadLinux);

export default router;
