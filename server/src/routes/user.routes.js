import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  updateProfileSchema,
  createAddressSchema,
  updateAddressSchema,
} from '../validators/user.validator.js';
import { idParam } from '../validators/common.validator.js';

const router = Router();

router.use(requireAuth);

router.get('/me', userController.getMe);
router.put('/me', validate(updateProfileSchema), userController.updateMe);

router.get('/me/addresses', userController.listAddresses);
router.post('/me/addresses', validate(createAddressSchema), userController.createAddress);
router.put('/me/addresses/:id', validate(updateAddressSchema), userController.updateAddress);
router.delete('/me/addresses/:id', validate({ params: idParam }), userController.deleteAddress);

export default router;
