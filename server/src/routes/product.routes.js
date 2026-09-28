import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { searchLimiter } from '../middleware/rateLimit.middleware.js';
import { listProductsSchema, searchSchema } from '../validators/product.validator.js';
import { slugParam } from '../validators/common.validator.js';

const router = Router();

// ── Public ───────────────────────────────────────────────────────────────────
// Static segments are registered before `/:slug` so they are never swallowed
// by the slug route.
router.get('/home-feed', productController.getHomeFeed);
router.get('/search', searchLimiter, validate(searchSchema), productController.searchProducts);
router.get('/facets', productController.getFacets);
router.get('/by-ids', productController.getProductsByIds);
router.get('/', validate(listProductsSchema), productController.listProducts);
router.get('/:slug', validate({ params: slugParam }), productController.getProduct);

// Catalogue and order management is only reachable through /api/admin, which
// has its own accounts, lockout, permissions and audit log. The old
// customer-token "admin" routes that lived here bypassed all of that and
// have been removed.

export default router;
