import { z } from 'zod';
import { email, customerEmail, password } from './common.validator.js';

export const registerSchema = {
  body: z.object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    email: customerEmail,
    password,
    phone: z.string().regex(/^[0-9]{10}$/).optional().or(z.literal('')),
  }),
};

export const loginSchema = {
  body: z.object({
    email,
    // Deliberately loose: never reveal password policy on the login form.
    password: z.string().min(1, 'Password is required'),
  }),
};

export const googleSignInSchema = {
  body: z.object({
    // A Google ID token is a JWT — three base64url segments.
    credential: z
      .string()
      .max(4096)
      .regex(/^[\w-]+\.[\w-]+\.[\w-]+$/, 'Google sign-in failed. Please try again.'),
  }),
};

export const forgotPasswordSchema = {
  body: z.object({ email }),
};

export const resetPasswordSchema = {
  body: z.object({
    token: z.string().min(20, 'Reset link is invalid'),
    password,
  }),
};

export const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
  }),
};
