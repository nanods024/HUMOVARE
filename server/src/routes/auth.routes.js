import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { authLimiter, passwordResetLimiter, registerLimiter } from '../middleware/rateLimit.middleware.js';
import {
  registerSchema,
  loginSchema,
  googleSignInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../validators/auth.validator.js';

const router = Router();

router.post('/register', registerLimiter, authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/google', authLimiter, validate(googleSignInSchema), authController.google);
router.get('/providers', authController.providers);
router.post('/refresh', authController.refresh);
router.post('/logout', optionalAuth, authController.logout);
router.get('/me', requireAuth, authController.me);

router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  passwordResetLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);
router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate(changePasswordSchema),
  authController.changePassword,
);

export default router;
