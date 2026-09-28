import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { verifyGoogleCredential } from './googleAuth.js';
import { CUSTOMER_EMAIL_DOMAINS, ROLES } from '../constants/index.js';
import { EmailEvent, EMAIL_TYPES } from '../models/EmailEvent.js';
import { notifyWelcome, sendPasswordReset } from './email/notifications.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  createResetToken,
  hashResetToken,
} from '../utils/token.js';

const RESET_TTL_MINUTES = 30;
const RESET_TTL_MS = RESET_TTL_MINUTES * 60 * 1000;

/**
 * Per-account limits on reset emails, on top of the per-IP route limiter. The
 * IP limiter stops one machine hammering the endpoint; these stop anyone —
 * from however many machines — filling a single customer's inbox.
 */
const RESET_COOLDOWN_MS = 60 * 1000;
const RESET_MAX_PER_HOUR = 5;

function issueTokens(user) {
  const payload = { sub: user._id.toString(), role: user.role };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken({ ...payload, ver: user.tokenVersion ?? 0 }),
  };
}

export async function register({ name, email, password, phone }) {
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const user = new User({ name, email, phone: phone || '' });
  await user.setPassword(password);
  await user.save();

  // Only after the account exists — a failed registration sends nothing. Not
  // awaited: the new customer should not wait on a mail provider to sign in,
  // and `notifyWelcome` never rejects.
  void notifyWelcome(user);

  return { user: user.toPublicJSON(), ...issueTokens(user) };
}

/** Compared against when no account exists, so both paths take as long. */
let dummyHash;

export async function login({ email, password }) {
  // Select the hash and token version explicitly — both are `select: false`.
  const user = await User.findOne({ email }).select('+passwordHash +tokenVersion');

  // Same message for "no such user" and "wrong password" so the endpoint
  // cannot be used to enumerate registered addresses.
  const invalid = ApiError.unauthorized('Email or password is incorrect');
  if (!user) {
    // Spend the same time as a real check, so response time does not reveal
    // which addresses have accounts.
    dummyHash ??= await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
    await bcrypt.compare(password, dummyHash);
    throw invalid;
  }

  const matches = await user.comparePassword(password);
  if (!matches) throw invalid;
  // Only someone who knows the password learns the account is deactivated.
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  user.lastLoginAt = new Date();
  await user.save();

  return { user: user.toPublicJSON(), ...issueTokens(user) };
}

/**
 * Sign in (or sign up) with a Google ID token from the storefront's Google
 * button.
 *
 * The token is verified here against Google's signing keys and this shop's
 * client ID — nothing the browser says about the person is trusted. Then:
 *
 *   - an account already linked to this Google account signs in;
 *   - otherwise an account with the same email is linked, but only when
 *     Google is the authority for that address (Gmail, or a Workspace domain
 *     it reports as hosted), so a Google account cannot claim someone else's
 *     mailbox;
 *   - otherwise a new customer account is created, subject to the same
 *     Gmail-only rule as the registration form.
 */
export async function googleSignIn(credential) {
  const identity = await verifyGoogleCredential(credential);
  const refused = ApiError.unauthorized('Google sign-in failed. Please try again.');
  if (!identity) throw refused;

  const { sub, email, name, emailVerified, hostedDomain } = identity;
  if (!sub || !email || !emailVerified) throw refused;

  const domain = email.split('@')[1];
  const googleOwnsAddress = domain === 'gmail.com' || (hostedDomain && hostedDomain === domain);

  let user = await User.findOne({ googleId: sub }).select('+tokenVersion');
  let created = false;

  if (!user) {
    const byEmail = await User.findOne({ email }).select('+tokenVersion');

    if (byEmail) {
      if (!googleOwnsAddress || (byEmail.googleId && byEmail.googleId !== sub)) {
        throw ApiError.conflict('An account with this email already exists. Please sign in with your password.');
      }
      // Storefront admin-role accounts keep password sign-in only.
      if (byEmail.role !== ROLES.CUSTOMER) {
        throw ApiError.forbidden('Please sign in with your password.');
      }
      // Google has just proved who owns this address. Registration never
      // did, so a password or sessions already on the account may belong to
      // someone who signed up with this email first — both stop working.
      byEmail.googleId = sub;
      byEmail.passwordHash = undefined;
      byEmail.tokenVersion = (byEmail.tokenVersion ?? 0) + 1;
      user = byEmail;
    } else {
      if (!CUSTOMER_EMAIL_DOMAINS.includes(domain)) {
        throw ApiError.badRequest('Please use a Gmail account (ending in @gmail.com).');
      }
      user = new User({ name: (name || email.split('@')[0]).slice(0, 80), email, googleId: sub });
      created = true;
    }
  }

  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
  if (user.role !== ROLES.CUSTOMER) throw ApiError.forbidden('Please sign in with your password.');

  user.lastLoginAt = new Date();
  await user.save();

  if (created) void notifyWelcome(user);

  return { user: user.toPublicJSON(), created, ...issueTokens(user) };
}

/** Which sign-in providers the storefront should offer. */
export function providers() {
  return { google: env.google.clientId ? { clientId: env.google.clientId } : null };
}

/**
 * Exchanges a refresh cookie for a fresh access token. `tokenVersion` lets a
 * password change or a "sign out everywhere" invalidate old refresh tokens.
 */
export async function refresh(refreshToken) {
  if (!refreshToken) throw ApiError.unauthorized('Session expired, please sign in again');

  const payload = verifyRefreshToken(refreshToken);
  const user = await User.findById(payload.sub).select('+tokenVersion');

  if (!user || !user.isActive) throw ApiError.unauthorized('Session is no longer valid');
  if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
    throw ApiError.unauthorized('Session is no longer valid');
  }

  return { user: user.toPublicJSON(), ...issueTokens(user) };
}

export async function logoutEverywhere(userId) {
  await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
  return { success: true };
}

/**
 * Starts a password reset.
 *
 * It resolves identically whether or not the address is registered — same
 * value, and no email send on the request path — so neither the response nor
 * its timing tells a caller which addresses have accounts.
 *
 * The raw token exists only in this function and in the email. The database
 * holds its SHA-256 hash, and nothing — log, response, audit entry — ever sees
 * the raw value.
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email });
  if (!user) return { sent: true };

  // Throttle per account. The existing link stays valid, so a customer who
  // clicks "send again" too quickly still has a working email.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await EmailEvent.find({
    user: user._id,
    type: EMAIL_TYPES.PASSWORD_RESET,
    createdAt: { $gte: hourAgo },
  })
    .select('createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const tooSoon = recent[0] && Date.now() - new Date(recent[0].createdAt).getTime() < RESET_COOLDOWN_MS;
  if (tooSoon || recent.length >= RESET_MAX_PER_HOUR) {
    logger.info('Password reset throttled', { userId: user._id.toString(), recent: recent.length });
    return { sent: true };
  }

  const { raw, hash } = createResetToken();
  user.resetPasswordTokenHash = hash;
  user.resetPasswordExpiresAt = new Date(Date.now() + RESET_TTL_MS);
  await user.save();

  const resetUrl = `${env.frontendUrl}/reset-password?token=${raw}`;

  // Deliberately not awaited, so a registered address does not take a
  // provider round trip longer to answer than an unregistered one.
  void sendPasswordReset({ user, resetUrl, tokenHash: hash, expiresInMinutes: RESET_TTL_MINUTES });

  logger.info('Password reset requested', { userId: user._id.toString() });
  return { sent: true };
}

export async function resetPassword({ token, password }) {
  // Claim the token and burn it in one atomic step. Two requests racing with
  // the same link cannot both get through a read-then-write gap: whichever
  // arrives second finds the hash already cleared.
  const claimed = await User.findOneAndUpdate(
    {
      resetPasswordTokenHash: hashResetToken(token),
      resetPasswordExpiresAt: { $gt: new Date() },
    },
    { $set: { resetPasswordTokenHash: null, resetPasswordExpiresAt: null } },
    { new: false, projection: { _id: 1 } },
  );

  if (!claimed) throw ApiError.badRequest('This reset link is invalid or has expired');

  const user = await User.findById(claimed._id).select('+passwordHash +tokenVersion');
  await user.setPassword(password);
  // Invalidate every existing session — the account may have been compromised.
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  return { success: true };
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash +tokenVersion');
  if (!user) throw ApiError.notFound('Account not found');

  if (!user.passwordHash) {
    throw ApiError.badRequest(
      'Your account uses Google sign-in and has no password yet. Use "Forgot password" on the sign-in page to set one.',
    );
  }

  const matches = await user.comparePassword(currentPassword);
  if (!matches) throw ApiError.badRequest('Your current password is incorrect');

  await user.setPassword(newPassword);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  return { user: user.toPublicJSON(), ...issueTokens(user) };
}

export default {
  register,
  login,
  googleSignIn,
  providers,
  refresh,
  logoutEverywhere,
  requestPasswordReset,
  resetPassword,
  changePassword,
};
