import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';

const handler = (_req, res) =>
  sendError(res, {
    statusCode: 429,
    message: 'Too many requests. Please slow down and try again shortly.',
  });

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  // Rate limiting is a nuisance during local development.
  skip: () => env.isDev && process.env.DISABLE_RATE_LIMIT === 'true',
};

/** Broad protection for the whole API surface. */
export const apiLimiter = rateLimit({
  ...base,
  // PhonePe's webhook has its own limiter; a busy sale must not 429 it.
  skip: (req) => base.skip() || req.path === '/payments/phonepe/webhook',
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
});

/** Credential endpoints are the ones worth brute-forcing, so keep them tight. */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
});

/**
 * New accounts per network per hour. Counts successful sign-ups too (the
 * login limiter skips those), so one address cannot mint accounts in bulk.
 * Generous enough for shoppers sharing a mobile carrier's IP.
 */
export const registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 20,
});

export const passwordResetLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 5,
});

/** Search runs a query per keystroke burst; cap it separately. */
export const searchLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  max: 90,
});

export const writeLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  max: 40,
});

/**
 * Starting or retrying a payment calls PhonePe; keep it well above what a
 * real shopper needs and well below what would hammer the gateway.
 */
export const paymentLimiter = rateLimit({
  ...base,
  windowMs: 10 * 60 * 1000,
  max: 30,
});

/** PhonePe's webhook sender. Generous, but bounded. */
export const webhookLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  max: 300,
});

export default { apiLimiter, authLimiter, passwordResetLimiter, searchLimiter, writeLimiter, paymentLimiter, webhookLimiter };
