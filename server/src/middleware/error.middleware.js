import mongoose from 'mongoose';
import { ZodError } from 'zod';
import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';
import { sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Translates every known failure mode into the shared error envelope.
 * Unknown errors are logged with their stack but reported to the client as a
 * generic 500 in production so internals never leak.
 */
export function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let details;

  if (err instanceof ZodError) {
    statusCode = 422;
    message = 'Validation failed';
    details = err.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    message = 'Validation failed';
    details = Object.values(err.errors).map((error) => ({
      field: error.path,
      message: error.message,
    }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for "${err.path}"`;
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'value';
    message = field === 'email' ? 'An account with that email already exists' : `That ${field} is already in use`;
  } else if (err instanceof jwt.TokenExpiredError) {
    statusCode = 401;
    message = 'Session expired, please sign in again';
  } else if (err instanceof jwt.JsonWebTokenError) {
    statusCode = 401;
    message = 'Invalid authentication token';
  } else if (err.http_code || err.name === 'CloudinaryError') {
    // Cloudinary surfaces its own shape; never echo credentials back.
    statusCode = 502;
    message = 'Image service is unavailable, please try again';
  }

  const isOperational = err instanceof ApiError || statusCode < 500;

  if (!isOperational) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, {
      message: err.message,
      stack: err.stack,
    });
  } else {
    logger.warn(`${statusCode} ${req.method} ${req.originalUrl} - ${message}`);
  }

  // A deliberate ApiError may carry a machine-readable code and safe details
  // (e.g. ACCOUNT_LOCKED with the time left). Nothing else is forwarded.
  const code = err instanceof ApiError ? err.code : undefined;
  const safeDetails = err instanceof ApiError ? err.details : undefined;
  if (safeDetails?.retryAfterSeconds) res.set('Retry-After', String(safeDetails.retryAfterSeconds));

  // Unexpected failures are masked in production. A deliberate ApiError
  // (a payment gateway outage, uploads not configured) keeps its written,
  // customer-safe message.
  if (statusCode >= 500 && env.isProd && !(err instanceof ApiError)) {
    message = 'Something went wrong';
    details = undefined;
  }

  const response = sendError(res, {
    statusCode,
    message,
    error: details ?? (env.isProd ? undefined : err.name),
    ...(code && statusCode < 500 ? { code } : {}),
    ...(safeDetails && statusCode < 500 ? { details: safeDetails } : {}),
  });
  return response;
}

export default errorHandler;
