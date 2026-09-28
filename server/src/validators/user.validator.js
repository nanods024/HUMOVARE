import { z } from 'zod';
import { objectId } from './common.validator.js';
import { addressBody } from './order.validator.js';

export const updateProfileSchema = {
  body: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit phone number').optional().or(z.literal('')),
  }),
};

export const createAddressSchema = {
  body: addressBody.extend({
    label: z.enum(['home', 'work', 'other']).optional(),
    isDefault: z.boolean().optional(),
  }),
};

export const updateAddressSchema = {
  params: z.object({ id: objectId }),
  body: addressBody
    .extend({
      label: z.enum(['home', 'work', 'other']).optional(),
      isDefault: z.boolean().optional(),
    })
    .partial(),
};
