import { Router } from 'express';
import { webhookLimiter } from '../middleware/rateLimit.middleware.js';
import * as paymentController from '../controllers/payment.controller.js';

const router = Router();

/**
 * PhonePe calls this directly, so there is no customer session. It is
 * authenticated instead by PhonePe's webhook Authorization header, checked
 * before anything is read — see services/payments/phonepe.webhook.js.
 */
router.post('/phonepe/webhook', webhookLimiter, paymentController.phonepeWebhook);

export default router;
