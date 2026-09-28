import { Router } from 'express';
import { z } from 'zod';
import * as orderController from '../controllers/order.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { writeLimiter, paymentLimiter } from '../middleware/rateLimit.middleware.js';
import { createOrderSchema, listOrdersSchema } from '../validators/order.validator.js';
import { idParam, objectId } from '../validators/common.validator.js';

const router = Router();

// Public: checkout needs to know which methods this environment offers.
router.get('/payment-methods', orderController.getPaymentMethods);

router.use(requireAuth);

router.post('/', writeLimiter, paymentLimiter, validate(createOrderSchema), orderController.createOrder);
router.get('/', validate(listOrdersSchema), orderController.listOrders);
router.get('/:id', validate({ params: idParam }), orderController.getOrder);

// The verified payment state for the return page. Read-only for the
// browser: it can ask, never tell.
router.get('/:id/payment-status', validate({ params: idParam }), orderController.getPaymentStatus);

// A new PhonePe attempt for an unpaid order (or the still-valid current one).
router.post(
  '/:id/payment/retry',
  writeLimiter,
  paymentLimiter,
  validate({ params: z.object({ id: objectId }) }),
  orderController.retryPayment,
);

router.post(
  '/:id/cancel',
  writeLimiter,
  validate({
    params: z.object({ id: objectId }),
    body: z.object({ reason: z.string().trim().max(240).optional() }).optional().default({}),
  }),
  orderController.cancelOrder,
);

// Catalogue and order management is only reachable through /api/admin, which
// has its own accounts, lockout, permissions and audit log. The old
// customer-token "admin" routes that lived here bypassed all of that and
// have been removed.

export default router;
