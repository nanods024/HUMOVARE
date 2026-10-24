import { Router } from 'express';
import * as categoryController from '../controllers/category.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { publicCatalogue } from '../middleware/cacheControl.middleware.js';
import { listCategoriesSchema } from '../validators/category.validator.js';
import { slugParam } from '../validators/common.validator.js';

const router = Router();

router.get('/navigation', publicCatalogue, categoryController.getNavigation);
router.get('/', publicCatalogue, validate(listCategoriesSchema), categoryController.listCategories);
router.get('/:slug', publicCatalogue, validate({ params: slugParam }), categoryController.getCategory);


// Catalogue and order management is only reachable through /api/admin, which
// has its own accounts, lockout, permissions and audit log. The old
// customer-token "admin" routes that lived here bypassed all of that and
// have been removed.

export default router;
