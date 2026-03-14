import express from 'express';
import * as authController from './controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';
import { bruteForce } from '../../middleware/brute_force.js';

const router = express.Router();

router.post('/login', bruteForce.prevent, authController.login);
router.post('/logout', requireAdminAuth, authController.logout);
router.get('/check', requireAdminAuth, authController.checkAuth);
router.post('/verify-admin', authController.verifyAdminCredentials);

export default router;
