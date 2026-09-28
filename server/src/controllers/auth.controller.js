import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { REFRESH_COOKIE, refreshCookieOptions, verifyRefreshToken } from '../utils/token.js';

/**
 * The refresh token is set as an HTTP-only cookie and never returned in the
 * body; only the short-lived access token reaches JavaScript.
 */
function attachSession(res, { refreshToken }) {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
}

export const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(req.body);
  attachSession(res, { refreshToken });

  return sendCreated(res, {
    message: `Welcome to HUMOVARE, ${user.name.split(' ')[0]}`,
    data: { user, accessToken },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  attachSession(res, { refreshToken });

  return sendSuccess(res, {
    message: 'Signed in successfully',
    data: { user, accessToken },
  });
});

export const google = asyncHandler(async (req, res) => {
  const { user, created, accessToken, refreshToken } = await authService.googleSignIn(req.body.credential);
  attachSession(res, { refreshToken });

  const firstName = user.name.split(' ')[0];
  const send = created ? sendCreated : sendSuccess;
  return send(res, {
    message: created ? `Welcome to HUMOVARE, ${firstName}` : 'Signed in successfully',
    data: { user, accessToken, created },
  });
});

export const providers = (_req, res) => sendSuccess(res, { data: authService.providers() });

export const refresh = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.refresh(req.cookies?.[REFRESH_COOKIE]);
  attachSession(res, { refreshToken });

  return sendSuccess(res, {
    message: 'Session refreshed',
    data: { user, accessToken },
  });
});

export const logout = asyncHandler(async (req, res) => {
  // The 15-minute access token has often expired by the time someone signs
  // out; the refresh cookie still says who they are, and it must stop working.
  let userId = req.user?._id;
  if (!userId && req.cookies?.[REFRESH_COOKIE]) {
    try {
      userId = verifyRefreshToken(req.cookies[REFRESH_COOKIE]).sub;
    } catch {
      // Already invalid — nothing left to revoke.
    }
  }
  if (userId) await authService.logoutEverywhere(userId);

  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  return sendSuccess(res, { message: 'Signed out', data: null });
});

export const me = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Account fetched', data: { user: req.user.toPublicJSON() } }),
);

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email);

  // Always the same message and the same body, whether or not the address is
  // registered — nothing from the service result reaches the response.
  return sendSuccess(res, {
    message: 'If that email is registered, a reset link is on its way',
    data: { sent: true },
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body);
  return sendSuccess(res, { message: 'Password updated. Please sign in.', data: null });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.changePassword(
    req.user._id,
    req.body,
  );
  attachSession(res, { refreshToken });

  return sendSuccess(res, { message: 'Password updated', data: { user, accessToken } });
});
