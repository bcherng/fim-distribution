import express from 'express';
import * as authController from './controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = express.Router();

router.post('/login', authController.login);
router.post('/logout', requireAdminAuth, authController.logout);
router.get('/check', requireAdminAuth, authController.checkAuth);
router.post('/verify-admin', authController.verifyAdminCredentials);

export default router;
