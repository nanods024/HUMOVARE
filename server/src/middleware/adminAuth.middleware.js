import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AdminUser } from '../models/AdminUser.js';
import { AdminSession } from '../models/AdminSession.js';
import { resolvePermissions, assertSessionFresh, sessionTime } from '../services/adminAuth.service.js';
import { ipBlockedUntil, lockoutError } from '../services/adminLoginGuard.service.js';
import { recordAudit } from '../services/audit.service.js';
import { env } from '../config/env.js';
import {
  verifyAdminAccessToken,
  ADMIN_ACCESS_COOKIE,
  ADMIN_CSRF_COOKIE,
  CSRF_HEADER,
} from '../utils/adminToken.js';
import { ADMIN_ROLES, AUDIT_ACTIONS } from '../constants/permissions.js';

/** Activity is written at most this often per session, not on every request. */
const TOUCH_EVERY_MS = 60 * 1000;

/**
 * Logs a refused request to the audit trail. Unauthenticated noise (a forged
 * token, a customer token, a replayed session) is limited to one entry per IP
 * per minute, so a bot hammering the API cannot flood the log.
 */
const recentDenials = new Map();
function auditDenial(req, reason, extra = {}) {
  const who = req.adminUser?._id?.toString() ?? `ip:${req.ip}`;
  const key = `${who}:${reason}`;
  const now = Date.now();
  if (!req.adminUser && now - (recentDenials.get(key) ?? 0) < 60 * 1000) return;
  recentDenials.set(key, now);
  if (recentDenials.size > 5000) recentDenials.clear();

  recordAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_ACCESS_DENIED,
    resource: 'api',
    description: `${req.method} ${req.originalUrl.split('?')[0]} refused: ${reason}`,
    status: 'failure',
    metadata: { reason, method: req.method, path: req.originalUrl.split('?')[0], ...extra },
  }).catch(() => {});
}

/**
 * Admin authentication.
 *
 * Runs on every admin route with no exceptions — the admin frontend's route
 * guards are a convenience for the operator, never a security boundary. A
 * hand-rolled request to the API gets exactly the same treatment as one from
 * the UI. On every request it checks, in order: a valid admin-signed token,
 * an existing active account, the account's token version, and a live stored
 * session that has not been signed out, gone idle or outlived its limit.
 */
export const requireAdminAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const token = req.cookies?.[ADMIN_ACCESS_COOKIE] || bearer;

  if (!token) throw ApiError.unauthorized('Admin sign-in required');

  let payload;
  try {
    payload = verifyAdminAccessToken(token);
  } catch (error) {
    // An expired token is routine (the client refreshes); anything else is
    // a forged, tampered or customer token and worth recording.
    if (!(error instanceof jwt.TokenExpiredError)) auditDenial(req, 'invalid-token');
    throw error;
  }

  const admin = await AdminUser.findById(payload.sub).select('+tokenVersion');
  if (!admin) throw ApiError.unauthorized('Admin account not found');
  if (!admin.isActive) {
    auditDenial(req, 'account-disabled', { adminId: String(admin._id) });
    throw ApiError.forbidden('This admin account has been disabled');
  }

  // A bumped tokenVersion retires every token issued before it.
  if ((payload.ver ?? 0) !== (admin.tokenVersion ?? 0)) {
    throw ApiError.unauthorized('Session is no longer valid', { code: 'SESSION_REVOKED' });
  }

  // Tokens from before sessions were bound carry no `sid`; the client simply
  // refreshes and gets one that does.
  const session = payload.sid ? await AdminSession.findById(payload.sid) : null;
  if (!session || !session.adminUser.equals(admin._id) || !session.isUsable()) {
    if (session && session.revokedAt) auditDenial(req, 'revoked-session', { adminId: String(admin._id) });
    throw ApiError.unauthorized('Session is no longer valid', { code: 'SESSION_REVOKED' });
  }

  assertSessionFresh(session);

  if (Date.now() - (session.lastUsedAt?.getTime() ?? 0) > TOUCH_EVERY_MS) {
    session.lastUsedAt = new Date();
    await AdminSession.updateOne({ _id: session._id }, { $set: { lastUsedAt: session.lastUsedAt } });
  }

  req.adminUser = admin;
  req.adminSession = session;
  req.adminPermissions = await resolvePermissions(admin);
  next();
});

/** What an admin may still do while their password must be replaced. */
const OPEN_WHILE_PASSWORD_EXPIRED = new Set(['/auth/me', '/auth/change-password', '/auth/reauth', '/auth/logout']);

/**
 * A seeded or admin-reset password is a shared secret until its owner
 * replaces it. Until then every other admin endpoint refuses — enforced here,
 * so a hand-rolled request gets the same answer as the UI.
 */
export function requireOwnPassword(req, _res, next) {
  if (req.adminUser?.mustChangePassword && !OPEN_WHILE_PASSWORD_EXPIRED.has(req.path)) {
    return next(
      ApiError.forbidden('Choose a new password before continuing.', { code: 'PASSWORD_CHANGE_REQUIRED' }),
    );
  }
  return next();
}

/**
 * Double-submit CSRF check for cookie-authenticated mutations.
 *
 * The cookie is readable by same-origin JavaScript and copied into a header;
 * a cross-site request can send the cookie automatically but cannot read it to
 * set the header, so the two never match.
 *
 * Skipped when the caller authenticated with a bearer token, which a browser
 * never attaches automatically and which therefore cannot be forged this way.
 */
export function requireCsrf(req, _res, next) {
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!isMutation) return next();

  // A bearer-only call cannot be forged cross-site. If the access cookie is
  // present, the cookie is what authenticated the request, so check CSRF.
  const usedBearer = String(req.headers.authorization || '').startsWith('Bearer ');
  if (usedBearer && !req.cookies?.[ADMIN_ACCESS_COOKIE]) return next();

  const cookieToken = req.cookies?.[ADMIN_CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    auditDenial(req, 'csrf');
    return next(ApiError.forbidden('Invalid or missing CSRF token'));
  }

  return next();
}

/**
 * Permission gate. Routes name the permission they need; SUPER_ADMIN is
 * resolved to the full set upstream, so it is not special-cased here.
 */
export const requirePermission = (...required) =>
  function permissionGuard(req, _res, next) {
    if (!req.adminUser) return next(ApiError.unauthorized('Admin sign-in required'));

    const granted = req.adminPermissions ?? [];
    const missing = required.filter((permission) => !granted.includes(permission));

    if (missing.length) {
      auditDenial(req, 'missing-permission', { missing });
      return next(
        ApiError.forbidden(`You do not have permission to do this (${missing.join(', ')})`),
      );
    }

    return next();
  };

/** Reserved for the few operations only the owner account may perform. */
export function requireSuperAdmin(req, _res, next) {
  if (!req.adminUser) return next(ApiError.unauthorized('Admin sign-in required'));
  if (req.adminUser.role !== ADMIN_ROLES.SUPER_ADMIN) {
    auditDenial(req, 'super-admin-only');
    return next(ApiError.forbidden('This action is restricted to super admins'));
  }
  return next();
}

/**
 * Step-up gate for sensitive actions (admin accounts, roles, store settings,
 * permanent deletes): the password must have been entered within the last
 * few minutes — at sign-in or by re-confirming it. A stolen or unattended
 * session alone is not enough to take these actions.
 */
export function requireRecentAuth(req, _res, next) {
  const at = req.adminSession ? sessionTime(req.adminSession, 'authenticatedAt') : null;
  const windowMs = env.adminSecurity.reauthMinutes * 60 * 1000;
  if (at && Date.now() - new Date(at).getTime() <= windowMs) return next();

  return next(ApiError.forbidden('Please confirm your password to continue.', {
    code: 'REAUTH_REQUIRED',
    details: { reauthMinutes: env.adminSecurity.reauthMinutes },
  }));
}

/**
 * First gate on every admin route: while a lockout is in force, everything is
 * refused — sign-in, password reset, and any session already signed in —
 * until it expires. With the default 'panel' scope that is every request from
 * everyone on every network; with 'network' scope, requests from the blocked
 * IP. It lives in the database, so refreshing, new tabs, cleared cookies,
 * another browser or another network make no difference. The storefront is
 * not affected.
 */
export const rejectBlockedIp = asyncHandler(async (req, _res, next) => {
  const until = await ipBlockedUntil(req.ip);
  if (until) throw lockoutError(until);
  next();
});

/** Admin responses carry customer and business data: never cache them. */
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}

export default { requireAdminAuth, requireCsrf, requirePermission, requireSuperAdmin, requireRecentAuth, noStore, rejectBlockedIp };
