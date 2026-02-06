import express from 'express';
import * as uiController from './controller.js';

const router = express.Router();

router.get('/', uiController.serveIndex);
router.get('/login', uiController.serveLogin);
router.get('/dashboard', uiController.serveDashboard);
router.get('/machine/:id', uiController.serveMachine);

export default router;
