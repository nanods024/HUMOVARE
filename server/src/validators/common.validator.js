import { z } from 'zod';
import { CUSTOMER_EMAIL_DOMAINS } from '../constants/index.js';
import mongoose from 'mongoose';

export const objectId = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid identifier');

export const slug = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9-]+$/, 'Invalid slug');

export const idParam = z.object({ id: objectId });
export const slugParam = z.object({ slug });

export const phone = z.string().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit phone number');
export const postalCode = z.string().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit PIN code');

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be under 72 characters')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const email = z.string().trim().toLowerCase().email('Enter a valid email address');

/**
 * An address a customer is entering for the first time — registration, a
 * delivery contact, the contact form. Restricted to CUSTOMER_EMAIL_DOMAINS.
 * Sign-in and password reset deliberately use plain `email`, so an existing
 * account on another domain is never locked out of its own orders.
 */
export const customerEmail = email.refine(
  (value) => CUSTOMER_EMAIL_DOMAINS.includes(value.split('@')[1] ?? ''),
  { message: `Please use a Gmail address (ending in @${CUSTOMER_EMAIL_DOMAINS[0]})` },
);
