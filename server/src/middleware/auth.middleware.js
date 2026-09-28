import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/token.js';
import { User } from '../models/User.js';

function readBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * Hard gate. Loads the user so a deactivated account cannot keep using an
 * access token that has not expired yet.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = readBearer(req);
  if (!token) throw ApiError.unauthorized('Please sign in to continue');

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);

  if (!user || !user.isActive) throw ApiError.unauthorized('Account is no longer active');

  req.user = user;
  req.userId = user._id;
  next();
});

/**
 * Soft gate for endpoints that behave differently when signed in (wishlist
 * state on a product page, for example) but must still serve guests.
 */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = readBearer(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user?.isActive) {
      req.user = user;
      req.userId = user._id;
    }
  } catch {
    // An invalid token on an optional route is simply treated as a guest.
  }

  return next();
});

export default { requireAuth, optionalAuth };
