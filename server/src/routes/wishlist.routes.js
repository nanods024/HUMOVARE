import { Router } from 'express';
import { z } from 'zod';
import * as wishlistController from '../controllers/wishlist.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { objectId } from '../validators/common.validator.js';

const router = Router();

const productParam = { params: z.object({ productId: objectId }) };

router.use(requireAuth);

router.get('/', wishlistController.getWishlist);
router.get('/ids', wishlistController.getWishlistIds);
router.post('/:productId', validate(productParam), wishlistController.addToWishlist);
router.delete('/:productId', validate(productParam), wishlistController.removeFromWishlist);

export default router;
