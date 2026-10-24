import { Router } from 'express';
import * as storefront from '../controllers/storefront.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { publicCatalogue } from '../middleware/cacheControl.middleware.js';
import { slugParam } from '../validators/common.validator.js';

const router = Router();

router.get('/homepage', publicCatalogue, storefront.getHomepage);
router.get('/shop-config', publicCatalogue, storefront.getShopConfig);
router.get('/settings', publicCatalogue, storefront.getPublicSettings);
router.get('/collections', publicCatalogue, storefront.listCollections);
router.get('/collections/:slug', publicCatalogue, validate({ params: slugParam }), storefront.getCollection);

export default router;
