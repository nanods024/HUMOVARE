import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AdminLoginThrottle } from '../models/AdminLoginThrottle.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Brute-force protection for every admin password check (sign-in, password
 * re-confirmation, password change). Two counters, both on the server:
 *
 *  • per email — after `maxLoginAttempts` consecutive wrong passwords for an
 *    address, sign-in for that address is refused for `lockMinutes`. Stops a
 *    guesser who spreads attempts across many IPs.
 *  • the lockout — after `ipMaxAttempts` consecutive wrong passwords (for any
 *    email), every admin request is refused for `ipBlockMinutes`, signed in
 *    or not. Its reach is `lockoutScope`:
 *      - 'panel' (default): ONE shared counter, so the whole admin panel
 *        locks for everyone, on every network;
 *      - 'network': one counter per client IP, so only that IP is shut out.
 *    Refreshing, clearing cookies, another browser or (for 'panel') another
 *    network changes nothing, because nothing about it lives in the browser.
 *
 * Attempts are *reserved* before the password is checked, with a single atomic
 * update whose filter only matches while budget remains — so a burst of
 * simultaneous requests cannot all slip past the check before the first
 * failure is written. A success resets both counters. Locks always expire;
 * none is permanent.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const sha256 = (value) => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');

/** "::ffff:203.0.113.9" and "203.0.113.9" are the same client. */
export const normaliseIp = (ip) => String(ip ?? '').trim().replace(/^::ffff:/, '').slice(0, 64) || 'unknown';

/** The email is never stored in the throttle — only this hash. */
export const emailKey = (email) => sha256(String(email ?? '').trim().toLowerCase());
export const ipKey = (ip) => `ip:${sha256(normaliseIp(ip))}`;
/** The single row that locks the whole admin panel. */
export const PANEL_KEY = 'panel:all';

const isPanelScope = () => env.adminSecurity.lockoutScope === 'panel';
/** Which counter a request's failures go against, under the current scope. */
export const lockoutKey = (ip) => (isPanelScope() ? PANEL_KEY : ipKey(ip));

const emailPolicy = () => ({ max: env.adminSecurity.maxLoginAttempts, lockMs: env.adminSecurity.lockMinutes * 60 * 1000 });
const ipPolicy = () => ({ max: env.adminSecurity.ipMaxAttempts, lockMs: env.adminSecurity.ipBlockMinutes * 60 * 1000 });

const timeLeft = (until) => {
  const seconds = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 1000));
  return { seconds, minutes: Math.ceil(seconds / 60) };
};

export function lockedError(until) {
  const { seconds, minutes } = timeLeft(until);
  return new ApiError(
    423,
    `Too many failed sign-in attempts. Sign-in is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`,
    { code: 'ACCOUNT_LOCKED', details: { retryAfterSeconds: seconds, lockedUntil: new Date(until).toISOString() } },
  );
}

export function ipBlockedError(until) {
  const { seconds, minutes } = timeLeft(until);
  return new ApiError(
    423,
    `Too many failed sign-in attempts from this network. The admin panel is blocked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`,
    { code: 'IP_BLOCKED', details: { retryAfterSeconds: seconds, blockedUntil: new Date(until).toISOString(), scope: 'network' } },
  );
}

export function panelLockedError(until) {
  const { seconds, minutes } = timeLeft(until);
  return new ApiError(
    423,
    `Too many failed sign-in attempts. The admin panel is locked for everyone for ${minutes} more minute${minutes === 1 ? '' : 's'}.`,
    { code: 'PANEL_LOCKED', details: { retryAfterSeconds: seconds, blockedUntil: new Date(until).toISOString(), scope: 'panel' } },
  );
}

/** The error for a lockout under the current scope. */
export const lockoutError = (until) => (isPanelScope() ? panelLockedError(until) : ipBlockedError(until));

// The unique index on `key` is what makes the reservation atomic across
// concurrent requests, so it is built before the first attempt is counted.
let indexesReady = null;
export const ensureThrottleIndexes = () => (indexesReady ??= AdminLoginThrottle.createIndexes());

/** Claims one attempt on a counter, or throws `makeError(until)` if it is spent. */
async function reserve({ key, kind, ip, max, lockMs, makeError }) {
  await ensureThrottleIndexes();
  const now = new Date();

  try {
    const doc = await AdminLoginThrottle.findOneAndUpdate(
      {
        key,
        failures: { $lt: max },
        $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
      },
      {
        $inc: { failures: 1 },
        $set: {
          kind,
          lockedUntil: null,
          lastFailureAt: now,
          lastFailureIp: normaliseIp(ip),
          ...(kind === 'ip' ? { ip: normaliseIp(ip) } : {}),
          expiresAt: new Date(now.getTime() + DAY_MS),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return { key, attempt: doc.failures, max, lockMs };
  } catch (error) {
    // The filter did not match an existing row (locked, or the budget is
    // already taken by requests still in flight), so the upsert tried to
    // insert a duplicate key. Either way: refused, before any password check.
    if (error?.code === 11000) {
      const current = await AdminLoginThrottle.findOne({ key }).lean();
      const until = current?.lockedUntil && current.lockedUntil > now
        ? current.lockedUntil
        : new Date(now.getTime() + lockMs);
      throw makeError(until);
    }
    throw error;
  }
}

/** Records that a reserved attempt failed; locks when the budget is spent. */
async function registerFailure({ key, attempt, max, lockMs }) {
  if (attempt < max) return { locked: false, attemptsRemaining: max - attempt };

  const lockedUntil = new Date(Date.now() + lockMs);
  await AdminLoginThrottle.updateOne({ key }, { $set: { lockedUntil, failures: 0 } });
  return { locked: true, lockedUntil, attemptsRemaining: 0 };
}

export const reserveAttempt = (email, ip = '') =>
  reserve({ key: emailKey(email), kind: 'email', ip, ...emailPolicy(), makeError: lockedError });

/** Claims one attempt on the lockout counter (panel-wide or this IP's). */
export const reserveIpAttempt = (ip) =>
  reserve({ key: lockoutKey(ip), kind: isPanelScope() ? 'panel' : 'ip', ip, ...ipPolicy(), makeError: lockoutError });

// ── Blocked-IP lookups (every admin request) ─────────────────────────────────

/** Short positive cache so a blocked client hammering the API costs no queries. */
const blockedCache = new Map();
const CACHE_MS = 15 * 1000;

/** When the lockout covering this request ends (panel-wide or this IP), or null. */
export async function ipBlockedUntil(ip) {
  const key = lockoutKey(ip);
  const cached = blockedCache.get(key);
  if (cached && cached.checkedAt > Date.now() - CACHE_MS) {
    return cached.until > Date.now() ? new Date(cached.until) : null;
  }

  await ensureThrottleIndexes();
  const row = await AdminLoginThrottle.findOne({ key, lockedUntil: { $gt: new Date() } }).select('lockedUntil').lean();
  if (!row) {
    blockedCache.delete(key);
    return null;
  }
  const until = row.lockedUntil.getTime();
  blockedCache.set(key, { until, checkedAt: Date.now() });
  if (blockedCache.size > 5000) blockedCache.clear();
  return new Date(until);
}

/** A correct password clears the count. Accepts an email, an email key or an IP key. */
export async function clearFailures(emailOrKey) {
  const key = /^([a-f0-9]{64}|ip:[a-f0-9]{64}|panel:all)$/.test(emailOrKey) ? emailOrKey : emailKey(emailOrKey);
  blockedCache.delete(key);
  await AdminLoginThrottle.deleteOne({ key });
}

/** Current lock for each email, if any — used by the admin list. */
export async function lockStatus(emails = []) {
  const keys = new Map(emails.map((email) => [emailKey(email), email]));
  const rows = await AdminLoginThrottle.find({
    key: { $in: [...keys.keys()] },
    lockedUntil: { $gt: new Date() },
  }).lean();
  return new Map(rows.map((row) => [keys.get(row.key), row.lockedUntil]));
}

/** Lockouts in force: blocked IPs, and the panel-wide lock if set. */
export async function listBlockedIps() {
  return AdminLoginThrottle.find({ kind: { $in: ['ip', 'panel'] }, lockedUntil: { $gt: new Date() } })
    .sort({ lockedUntil: -1 })
    .select('kind ip lockedUntil lastFailureAt lastFailureIp')
    .lean();
}

export async function unblockIpById(id) {
  const row = await AdminLoginThrottle.findOneAndDelete({ _id: id, kind: { $in: ['ip', 'panel'] } }).lean();
  if (!row) throw ApiError.notFound('That block has already been lifted');
  blockedCache.delete(row.key);
  return row;
}

// ── One helper for every password check ──────────────────────────────────────

/**
 * Runs `verify()` behind both counters. Order matters: the IP block and the
 * email lock are checked (and attempts reserved) *before* the password is
 * looked at, so the right password is refused while either is in force.
 *
 * Resolves `{ ok: true }` on success (both counters cleared). On a wrong
 * password resolves with what happened, so the caller can decide what to say
 * and whether to sign sessions out. Throws only when already blocked.
 */
export async function withPasswordGuard({ email, ip }, verify) {
  const ipReservation = await reserveIpAttempt(ip);

  let emailReservation;
  try {
    emailReservation = await reserveAttempt(email, ip);
  } catch (error) {
    // Hammering an already-locked account still counts against the network.
    if (error.code === 'ACCOUNT_LOCKED') {
      const ipOutcome = await registerFailure(ipReservation);
      if (ipOutcome.locked) {
        const blocked = lockoutError(ipOutcome.lockedUntil);
        blocked.justBlockedIp = true;
        throw blocked;
      }
    }
    throw error;
  }

  let ok;
  try {
    ok = await verify();
  } catch (error) {
    // Count it, so the lock is set if this was the last allowed attempt.
    await registerFailure(emailReservation);
    await registerFailure(ipReservation);
    throw error;
  }
  if (ok) {
    await Promise.all([clearFailures(emailReservation.key), clearFailures(ipReservation.key)]);
    return { ok: true };
  }

  const emailOutcome = await registerFailure(emailReservation);
  const ipOutcome = await registerFailure(ipReservation);
  await failureDelay(Math.max(emailReservation.attempt, ipReservation.attempt));

  return {
    ok: false,
    emailLocked: emailOutcome.locked,
    emailLockedUntil: emailOutcome.lockedUntil ?? null,
    ipBlocked: ipOutcome.locked,
    ipBlockedUntil: ipOutcome.lockedUntil ?? null,
    attemptsRemaining: Math.min(emailOutcome.attemptsRemaining, ipOutcome.attemptsRemaining),
  };
}

/**
 * Turns a failed guard outcome into the error to throw (or null if nothing
 * locked), tagged so the controller can audit it and send alerts. `admin` is
 * the account the password belonged to, if it exists.
 */
export function lockoutErrorFor(outcome, admin) {
  let error = null;
  if (outcome.ipBlocked) {
    error = lockoutError(outcome.ipBlockedUntil);
    error.justBlockedIp = true;
  } else if (outcome.emailLocked) {
    error = lockedError(outcome.emailLockedUntil);
  }
  if (error && outcome.emailLocked) {
    error.justLocked = true;
    error.lockedAdmin = admin ?? null;
    error.emailLockedUntil = outcome.emailLockedUntil;
  }
  return error;
}

/** Slows each consecutive failure down a little more (capped). */
export const failureDelay = (attempt) =>
  new Promise((resolve) => { setTimeout(resolve, Math.min(300 * attempt, 1500)); });

/**
 * Comparing against a real bcrypt hash when the email is unknown keeps the
 * response time the same as for a real account, so timing cannot reveal
 * which emails exist either.
 */
let dummyHash = null;
export async function compareWithoutAccount(password) {
  dummyHash ??= await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
  await bcrypt.compare(String(password ?? ''), dummyHash);
  return false;
}

export default {
  emailKey,
  ipKey,
  normaliseIp,
  reserveAttempt,
  reserveIpAttempt,
  ipBlockedUntil,
  clearFailures,
  lockStatus,
  listBlockedIps,
  unblockIpById,
  withPasswordGuard,
  lockoutErrorFor,
  failureDelay,
  compareWithoutAccount,
  lockedError,
  ipBlockedError,
  panelLockedError,
  lockoutError,
  lockoutKey,
  ensureThrottleIndexes,
};
