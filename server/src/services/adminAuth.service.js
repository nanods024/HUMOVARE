import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AdminUser } from '../models/AdminUser.js';
import { AdminSession } from '../models/AdminSession.js';
import { Role } from '../models/Role.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import {
  signAdminAccessToken,
  signAdminRefreshToken,
  verifyAdminRefreshToken,
  hashToken,
  newFamilyId,
} from '../utils/adminToken.js';
import { ADMIN_ROLES, ALL_PERMISSIONS } from '../constants/permissions.js';
import {
  withPasswordGuard,
  lockoutErrorFor,
  clearFailures,
  compareWithoutAccount,
} from './adminLoginGuard.service.js';
import {
  sendAdminPasswordReset,
  notifyAdminPasswordChanged,
} from './email/adminNotifications.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/**
 * Reads a session clock. Sessions created before these fields existed get a
 * schema default of "now" each time they are loaded, which would make them
 * look freshly signed in; for those, the real creation time is used instead.
 */
export function sessionTime(session, path) {
  const stored = session.$isDefault?.(path) ? null : session[path];
  return stored ?? session.createdAt;
}

/** What the admin app needs to show the right countdowns. Enforced here, not there. */
export function sessionPolicy() {
  const {
    idleMinutes, reauthMinutes, maxSessionHours, maxLoginAttempts, lockMinutes, ipMaxAttempts, ipBlockMinutes,
  } = env.adminSecurity;
  return {
    idleMinutes,
    reauthMinutes,
    maxSessionHours,
    maxLoginAttempts,
    lockMinutes,
    ipMaxAttempts,
    ipBlockMinutes,
    lockoutScope: env.adminSecurity.lockoutScope,
  };
}

/** Resolves an admin's effective permissions from their role plus overrides. */
export async function resolvePermissions(admin) {
  if (admin.role === ADMIN_ROLES.SUPER_ADMIN) return [...ALL_PERMISSIONS];

  const role = await Role.findOne({ name: admin.role }).lean();
  return admin.effectivePermissions(role?.permissions ?? []);
}

/**
 * Creates one stored session and the token pair bound to it. The session id
 * is new on every sign-in and every rotation, so an identifier planted before
 * sign-in can never become an authenticated one (no session fixation).
 */
async function issueSession(admin, { ip, userAgent, family, familyStartedAt, authenticatedAt }) {
  const familyId = family ?? newFamilyId();
  const sessionId = new mongoose.Types.ObjectId();
  const now = new Date();

  const accessToken = signAdminAccessToken({
    adminId: admin._id.toString(),
    role: admin.role,
    tokenVersion: admin.tokenVersion ?? 0,
    sessionId: sessionId.toString(),
  });

  const refreshToken = signAdminRefreshToken({
    adminId: admin._id.toString(),
    tokenVersion: admin.tokenVersion ?? 0,
    family: familyId,
  });

  await AdminSession.create({
    _id: sessionId,
    adminUser: admin._id,
    tokenHash: hashToken(refreshToken),
    family: familyId,
    ip: ip ?? '',
    userAgent: String(userAgent ?? '').slice(0, 300),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    lastUsedAt: now,
    familyStartedAt: familyStartedAt ?? now,
    authenticatedAt: authenticatedAt ?? now,
  });

  return { accessToken, refreshToken, sessionId };
}

/** A brand-new sign-in: new family, fresh clocks. */
export async function startSession(admin, { ip, userAgent }) {
  const tokens = await issueSession(admin, { ip, userAgent });
  const permissions = await resolvePermissions(admin);
  return { admin, user: admin.toPublicJSON(permissions), permissions, ...tokens };
}

// ── Password rules beyond the shape check ────────────────────────────────────

const COMMON_FRAGMENTS = ['password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'admin', '123456', 'iloveyou', 'humovare'];

/**
 * The validator already demands length and variety; this catches passwords
 * that pass those rules but are still easy to guess.
 */
export function assertPasswordAllowed(password, { email = '', name = '' } = {}) {
  const lower = String(password).toLowerCase();

  const personal = [String(email).split('@')[0], ...String(name).split(/\s+/)]
    .map((part) => part.toLowerCase())
    .filter((part) => part.length >= 3);
  if (personal.some((part) => lower.includes(part))) {
    throw ApiError.badRequest('Your password must not contain your name or email address.', { code: 'WEAK_PASSWORD' });
  }

  if (COMMON_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
    throw ApiError.badRequest('That password is too easy to guess. Avoid common words and the store name.', { code: 'WEAK_PASSWORD' });
  }
}

// ── Sign in ──────────────────────────────────────────────────────────────────

const incorrect = (attemptsRemaining) => {
  const lockMinutes = Math.max(env.adminSecurity.lockMinutes, env.adminSecurity.ipBlockMinutes);
  return ApiError.unauthorized(
    `Email or password is incorrect. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} left before sign-in is locked for ${lockMinutes} minutes.`,
    { code: 'INVALID_CREDENTIALS', details: { attemptsRemaining } },
  );
};

/**
 * Authenticates an admin.
 *
 * Order matters: the IP block and the email lock are checked (and attempts
 * reserved) before the password is looked at, so the right password is
 * refused while either is in force. Unknown emails go through the same
 * counting, the same bcrypt cost and the same messages as real ones, so
 * nothing here reveals which admin accounts exist.
 */
export async function login({ email, password, ip, userAgent }) {
  let admin = null;
  const outcome = await withPasswordGuard({ email, ip }, async () => {
    admin = await AdminUser.findOne({ email }).select('+passwordHash +tokenVersion');
    return admin ? admin.comparePassword(password) : compareWithoutAccount(password);
  });

  if (!outcome.ok) {
    throw lockoutErrorFor(outcome, admin) ?? incorrect(outcome.attemptsRemaining);
  }

  // Said only after the right password — the operator has proved who they are.
  if (!admin.isActive) throw ApiError.forbidden('This admin account has been disabled');

  await admin.registerSuccessfulLogin(ip);
  return startSession(admin, { ip, userAgent });
}

/**
 * Rotates a refresh token.
 *
 * Each refresh retires the presented token and issues a new one in the same
 * family. If a token that was already rotated is presented again, it has been
 * stolen and replayed — so the entire family is revoked rather than served.
 * The idle and absolute limits are enforced here too, so a session that has
 * gone quiet cannot be revived just by holding on to the cookie.
 */
export async function refresh({ refreshToken, ip, userAgent }) {
  if (!refreshToken) throw ApiError.unauthorized('Session expired, please sign in again');

  const payload = verifyAdminRefreshToken(refreshToken);
  const session = await AdminSession.findOne({ tokenHash: hashToken(refreshToken) });

  if (!session) {
    // Valid signature but no stored session: the token was already rotated.
    await revokeFamily(payload.fam, 'token-reuse-detected');
    logger.warn('Admin refresh token reuse detected; family revoked', { family: payload.fam });
    throw ApiError.unauthorized('Session is no longer valid', { code: 'SESSION_REVOKED' });
  }

  // A token that was already swapped for a new one is back. Within a few
  // seconds that is two tabs refreshing at once; after that it has been
  // stolen and replayed, so the whole family is signed out.
  if (session.revokedAt && session.revokedReason === 'rotated') {
    if (Date.now() - session.revokedAt.getTime() > REUSE_GRACE_MS) {
      await revokeFamily(session.family, 'token-reuse-detected');
      logger.warn('Admin refresh token reuse detected; family revoked', { family: session.family });
    }
    throw ApiError.unauthorized('Session is no longer valid', { code: 'SESSION_REVOKED' });
  }

  if (!session.isUsable()) throw ApiError.unauthorized('Session is no longer valid', { code: 'SESSION_REVOKED' });

  assertSessionFresh(session);

  const admin = await AdminUser.findById(payload.sub).select('+tokenVersion');
  if (!admin || !admin.isActive) throw ApiError.unauthorized('Session is no longer valid', { code: 'SESSION_REVOKED' });
  if ((payload.ver ?? 0) !== (admin.tokenVersion ?? 0)) {
    throw ApiError.unauthorized('Session is no longer valid', { code: 'SESSION_REVOKED' });
  }

  // Claim the rotation atomically: of two concurrent refreshes with the same
  // token, exactly one gets a new session.
  const claimed = await AdminSession.findOneAndUpdate(
    { _id: session._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'rotated' } },
  );
  if (!claimed) throw ApiError.unauthorized('Session is no longer valid', { code: 'SESSION_REVOKED' });

  const tokens = await issueSession(admin, {
    ip,
    userAgent,
    family: session.family,
    familyStartedAt: sessionTime(session, 'familyStartedAt'),
    authenticatedAt: sessionTime(session, 'authenticatedAt'),
  });
  const permissions = await resolvePermissions(admin);

  return { admin, user: admin.toPublicJSON(permissions), permissions, ...tokens };
}

/** How long a just-rotated refresh token is treated as a race, not a theft. */
const REUSE_GRACE_MS = 30 * 1000;

async function revokeFamily(family, reason) {
  if (!family) return;
  await AdminSession.updateMany(
    { family, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

/**
 * Throws (and revokes) when a session has been idle too long or has outlived
 * the absolute limit. Shared by every authenticated request and by refresh.
 */
export function assertSessionFresh(session) {
  const { idleMinutes, maxSessionHours } = env.adminSecurity;
  const now = Date.now();
  const lastUsed = new Date(sessionTime(session, 'lastUsedAt')).getTime();
  const started = new Date(sessionTime(session, 'familyStartedAt')).getTime();

  if (now - lastUsed > idleMinutes * MINUTE_MS) {
    revokeFamily(session.family, 'idle-timeout').catch(() => {});
    throw ApiError.unauthorized(`You were signed out after ${idleMinutes} minutes of inactivity.`, { code: 'SESSION_IDLE' });
  }
  if (now - started > maxSessionHours * 60 * MINUTE_MS) {
    revokeFamily(session.family, 'max-age').catch(() => {});
    throw ApiError.unauthorized('Your session has expired. Please sign in again.', { code: 'SESSION_EXPIRED' });
  }
}

/** Ends the session behind both the refresh cookie and the access token. */
export async function logout(refreshToken, sessionId) {
  const now = new Date();
  const updates = [];
  if (refreshToken) {
    updates.push(AdminSession.findOneAndUpdate(
      { tokenHash: hashToken(refreshToken), revokedAt: null },
      { $set: { revokedAt: now, revokedReason: 'logout' } },
    ));
  }
  if (sessionId) {
    updates.push(AdminSession.updateOne(
      { _id: sessionId, revokedAt: null },
      { $set: { revokedAt: now, revokedReason: 'logout' } },
    ));
  }
  await Promise.all(updates);
}

/** Signs an admin out everywhere — used on disable and password change. */
export async function revokeAllSessions(adminId, reason = 'revoked') {
  await Promise.all([
    AdminSession.updateMany(
      { adminUser: adminId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    ),
    AdminUser.findByIdAndUpdate(adminId, { $inc: { tokenVersion: 1 } }),
  ]);
}

export async function listSessions(adminId) {
  return AdminSession.find({ adminUser: adminId })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('ip userAgent createdAt lastUsedAt revokedAt revokedReason expiresAt')
    .lean();
}

// ── Re-confirming the password for sensitive actions ─────────────────────────

/**
 * Step-up authentication. Counts against the same lockout as sign-in, so it
 * cannot be used to guess a password from an unattended session; if the
 * lock trips, that session is signed out too.
 */
export async function reauthenticate({ admin, session, password, ip }) {
  const full = await AdminUser.findById(admin._id).select('+passwordHash');
  const outcome = await withPasswordGuard({ email: admin.email, ip }, async () => (full ? full.comparePassword(password) : false));

  if (!outcome.ok) {
    const lockout = lockoutErrorFor(outcome, full);
    if (lockout) {
      await revokeAllSessions(admin._id, 'locked-after-failed-reauth');
      throw lockout;
    }
    throw ApiError.forbidden(
      `That password is not correct. ${outcome.attemptsRemaining} attempt${outcome.attemptsRemaining === 1 ? '' : 's'} left before your account is locked.`,
      { code: 'REAUTH_FAILED', details: { attemptsRemaining: outcome.attemptsRemaining } },
    );
  }

  session.authenticatedAt = new Date();
  await session.save();
  return { authenticatedAt: session.authenticatedAt };
}

// ── Passwords ────────────────────────────────────────────────────────────────

export async function changeOwnPassword(adminId, { currentPassword, newPassword }, { ip } = {}) {
  const admin = await AdminUser.findById(adminId).select('+passwordHash +tokenVersion');
  if (!admin) throw ApiError.notFound('Admin account not found');

  const outcome = await withPasswordGuard({ email: admin.email, ip }, () => admin.comparePassword(currentPassword));
  if (!outcome.ok) {
    const lockout = lockoutErrorFor(outcome, admin);
    if (lockout) {
      await revokeAllSessions(admin._id, 'locked-after-failed-password-change');
      throw lockout;
    }
    throw ApiError.badRequest('Your current password is incorrect', { details: { attemptsRemaining: outcome.attemptsRemaining } });
  }

  if (currentPassword === newPassword) {
    throw ApiError.badRequest('Choose a new password — it must be different from your current one.', { code: 'WEAK_PASSWORD' });
  }
  assertPasswordAllowed(newPassword, admin);

  await admin.setPassword(newPassword);
  admin.mustChangePassword = false;
  await admin.save();

  // Every other session is invalidated; the caller gets a fresh one.
  await revokeAllSessions(adminId, 'password-changed');
  notifyAdminPasswordChanged(admin).catch(() => {});

  return AdminUser.findById(adminId).select('+tokenVersion');
}

/**
 * Starts a self-service reset. Always resolves the same way whether or not
 * the email belongs to an admin, and sends nothing for unknown or disabled
 * accounts. The email is sent without waiting, so response time does not
 * reveal which case happened either.
 */
export async function requestPasswordReset({ email }) {
  const admin = await AdminUser.findOne({ email }).select('+resetRequestedAt');
  if (!admin || !admin.isActive) return null;

  // One link every two minutes per account is plenty; extra requests are
  // silently ignored rather than refused.
  const now = Date.now();
  if (admin.resetRequestedAt && now - admin.resetRequestedAt.getTime() < 2 * MINUTE_MS) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresInMinutes = env.adminSecurity.resetTokenMinutes;

  admin.resetTokenHash = tokenHash;
  admin.resetTokenExpiresAt = new Date(now + expiresInMinutes * MINUTE_MS);
  admin.resetRequestedAt = new Date(now);
  await admin.save();

  const resetUrl = `${env.adminPublicUrl}/reset-password?token=${token}`;
  sendAdminPasswordReset({ admin, resetUrl, tokenHash, expiresInMinutes }).catch((error) => {
    logger.error('Admin password reset email failed', { message: error?.message });
  });

  return admin;
}

/** Completes a reset. The link works once, then never again. */
export async function resetPasswordWithToken({ token, password }) {
  const invalid = ApiError.badRequest('This reset link is invalid or has expired. Request a new one.', { code: 'RESET_TOKEN_INVALID' });
  const tokenHash = hashToken(String(token ?? ''));

  const admin = await AdminUser.findOne({
    resetTokenHash: tokenHash,
    resetTokenExpiresAt: { $gt: new Date() },
  }).select('+passwordHash +tokenVersion +resetTokenHash +resetTokenExpiresAt');
  if (!admin || !admin.isActive) throw invalid;

  assertPasswordAllowed(password, admin);

  // Claim the token atomically, so two submissions of the same link cannot
  // both succeed.
  const claimed = await AdminUser.updateOne(
    { _id: admin._id, resetTokenHash: tokenHash },
    { $set: { resetTokenHash: null, resetTokenExpiresAt: null } },
  );
  if (!claimed.modifiedCount) throw invalid;

  await admin.setPassword(password);
  admin.mustChangePassword = false;
  await admin.save();

  await revokeAllSessions(admin._id, 'password-reset-by-email');
  // Proving control of the inbox is enough to lift a sign-in lock.
  await clearFailures(admin.email);
  notifyAdminPasswordChanged(admin).catch(() => {});

  return admin;
}

export default {
  login,
  refresh,
  logout,
  revokeAllSessions,
  listSessions,
  resolvePermissions,
  changeOwnPassword,
  startSession,
  reauthenticate,
  requestPasswordReset,
  resetPasswordWithToken,
  assertPasswordAllowed,
  assertSessionFresh,
  sessionPolicy,
};
