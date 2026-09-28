import { z } from 'zod';
import { objectId, phone, postalCode, email } from './common.validator.js';
import { PAYMENT_METHODS, ORDER_STATUS_VALUES } from '../constants/index.js';

export const addressBody = z.object({
  name: z.string().trim().min(2).max(80),
  phone,
  // Plain email, not the Gmail-restricted `customerEmail`: this is a delivery
  // contact on an address someone already owns, not a new sign-up, and an
  // existing customer on another domain must never be locked out of their
  // own address book or checkout. See common.validator.js.
  email: email.optional().or(z.literal('')),
  addressLine1: z.string().trim().min(5).max(160),
  addressLine2: z.string().trim().max(160).optional().or(z.literal('')),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode,
  country: z.string().trim().max(60).default('India'),
});

export const createOrderSchema = {
  body: z
    .object({
      /** Either reuse a saved address or send a one-off shipping address. */
      addressId: objectId.optional(),
      shippingAddress: addressBody.optional(),
      paymentMethod: z.enum(Object.values(PAYMENT_METHODS)),
      customerNote: z.string().trim().max(500).optional(),
      saveAddress: z.boolean().optional(),
    })
    .refine((data) => data.addressId || data.shippingAddress, {
      message: 'A shipping address is required',
      path: ['shippingAddress'],
    }),
};

export const listOrdersSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(60).optional(),
    status: z.enum(ORDER_STATUS_VALUES).optional(),
  }),
};
