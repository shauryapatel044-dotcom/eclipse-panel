import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', loginRateLimiter, AuthController.login);
router.get('/me', requireAuth, AuthController.getMe);
router.put('/profile', requireAuth, AuthController.updateProfile);
router.put('/password', requireAuth, AuthController.updatePassword);

export default router;
