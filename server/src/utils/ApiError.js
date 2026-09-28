/**
 * Operational error — one the API raised deliberately and can safely describe
 * to the client. Anything that is not an ApiError is treated as a bug and
 * masked behind a generic 500 in production.
 */
export class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = true;
    if (code) this.code = code;
    if (details) this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Invalid request', options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'Authentication required', options) {
    return new ApiError(401, message, options);
  }

  static forbidden(message = 'You do not have access to this resource', options) {
    return new ApiError(403, message, options);
  }

  static notFound(message = 'Resource not found', options) {
    return new ApiError(404, message, options);
  }

  static conflict(message = 'Resource already exists', options) {
    return new ApiError(409, message, options);
  }

  static unprocessable(message = 'Request could not be processed', options) {
    return new ApiError(422, message, options);
  }

  static tooMany(message = 'Too many requests', options) {
    return new ApiError(429, message, options);
  }

  static internal(message = 'Something went wrong', options) {
    return new ApiError(500, message, options);
  }
}

export default ApiError;
