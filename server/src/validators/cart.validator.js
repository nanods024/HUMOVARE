import { z } from 'zod';
import { objectId } from './common.validator.js';

export const addToCartSchema = {
  body: z.object({
    productId: objectId,
    variantId: objectId,
    quantity: z.coerce.number().int().min(1).max(10).default(1),
  }),
};

export const updateCartItemSchema = {
  params: z.object({ itemId: objectId }),
  body: z.object({ quantity: z.coerce.number().int().min(1).max(10) }),
};

export const cartItemParamSchema = {
  params: z.object({ itemId: objectId }),
};

/** Guest carts are merged on sign-in; the client posts its local lines here. */
export const mergeCartSchema = {
  body: z.object({
    items: z
      .array(
        z.object({
          productId: objectId,
          variantId: objectId,
          quantity: z.coerce.number().int().min(1).max(10),
        }),
      )
      .max(50),
  }),
};
