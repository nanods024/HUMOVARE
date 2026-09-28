import { ApiError } from '../utils/ApiError.js';

/**
 * Runs Zod schemas against the request and replaces the raw input with the
 * parsed result, so controllers always receive coerced, trimmed values.
 *
 * `req.query` is read-only on some Express/Node combinations, so parsed query
 * values are exposed on `req.validatedQuery` instead of being reassigned.
 */
export const validate = (schemas = {}) =>
  function validateRequest(req, _res, next) {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.params) req.params = schemas.params.parse(req.params ?? {});
      if (schemas.query) req.validatedQuery = schemas.query.parse(req.query ?? {});
      return next();
    } catch (error) {
      return next(error);
    }
  };

/**
 * Strips MongoDB operator syntax from user input. Mongoose casting already
 * blocks most injection, but this stops `{"email": {"$ne": null}}` style
 * payloads from ever reaching a query builder.
 */
function scrub(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));

  const clean = {};
  for (const [key, val] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.')) continue;
    clean[key] = scrub(val, depth + 1);
  }
  return clean;
}

export function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = scrub(req.body);
  if (req.params && typeof req.params === 'object') {
    for (const value of Object.values(req.params)) {
      if (typeof value === 'string' && value.includes('$')) {
        return next(ApiError.badRequest('Invalid parameter'));
      }
    }
  }
  if (req.query && typeof req.query === 'object') {
    const cleanQuery = scrub(req.query);
    // Express 5 exposes `query` via a getter; mutate in place when needed.
    try {
      req.query = cleanQuery;
    } catch {
      Object.defineProperty(req, 'query', { value: cleanQuery, writable: true, configurable: true });
    }
  }
  return next();
}

export default { validate, sanitizeRequest };
