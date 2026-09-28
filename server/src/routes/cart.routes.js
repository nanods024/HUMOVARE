import { Router } from 'express';
import * as cartController from '../controllers/cart.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  addToCartSchema,
  updateCartItemSchema,
  cartItemParamSchema,
  mergeCartSchema,
} from '../validators/cart.validator.js';

const router = Router();

// The whole cart API is authenticated; guests keep their bag in localStorage
// and POST it to /merge once they sign in.
router.use(requireAuth);

router.get('/', cartController.getCart);
router.post('/items', validate(addToCartSchema), cartController.addItem);
router.put('/items/:itemId', validate(updateCartItemSchema), cartController.updateItem);
router.delete('/items/:itemId', validate(cartItemParamSchema), cartController.removeItem);
router.delete('/', cartController.clearCart);
router.post('/merge', validate(mergeCartSchema), cartController.mergeCart);

export default router;
