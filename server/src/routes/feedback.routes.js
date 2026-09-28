import { Router } from 'express';
import * as feedbackController from '../controllers/feedback.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import { writeLimiter } from '../middleware/rateLimit.middleware.js';
import { submitFeedbackSchema } from '../validators/feedback.validator.js';

const router = Router();

/**
 * The contact form. Open to signed-out visitors by necessity, so it is rate
 * limited and the message is only ever stored \u2014 never rendered back.
 */
router.post(
  '/feedback',
  optionalAuth,
  writeLimiter,
  validate(submitFeedbackSchema),
  feedbackController.submitFeedback,
);

export default router;
