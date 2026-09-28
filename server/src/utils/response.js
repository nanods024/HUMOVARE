/**
 * One response envelope for the whole API:
 *   success -> { success: true, message, data }
 *   failure -> { success: false, message, error }
 * The client can therefore branch on `success` alone.
 */
export function sendSuccess(res, { statusCode = 200, message = 'OK', data = null, meta } = {}) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function sendCreated(res, { message = 'Created successfully', data = null } = {}) {
  return sendSuccess(res, { statusCode: 201, message, data });
}

export function sendError(res, { statusCode = 500, message = 'Something went wrong', error, code, details }) {
  const body = { success: false, message };
  if (error !== undefined) body.error = error;
  if (code) body.code = code;
  if (details !== undefined) body.details = details;
  return res.status(statusCode).json(body);
}

export default { sendSuccess, sendCreated, sendError };
