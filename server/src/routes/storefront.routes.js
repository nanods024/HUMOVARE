import { Router } from 'express';
import * as storefront from '../controllers/storefront.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { slugParam } from '../validators/common.validator.js';

const router = Router();

router.get('/homepage', storefront.getHomepage);
router.get('/shop-config', storefront.getShopConfig);
router.get('/settings', storefront.getPublicSettings);
router.get('/collections', storefront.listCollections);
router.get('/collections/:slug', validate({ params: slugParam }), storefront.getCollection);

export default router;
