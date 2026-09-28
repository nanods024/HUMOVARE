import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'humovare';

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
    issuer: ISSUER,
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
    issuer: ISSUER,
  });
}

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.jwt.accessSecret, { issuer: ISSUER });

export const verifyRefreshToken = (token) =>
  jwt.verify(token, env.jwt.refreshSecret, { issuer: ISSUER });

/** Opaque, single-use reset token. Only its SHA-256 hash is persisted. */
export function createResetToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashResetToken(raw) };
}

export const hashResetToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

export const REFRESH_COOKIE = 'hv_refresh';

/**
 * The refresh token lives in an HTTP-only cookie scoped to /api/auth so it is
 * never readable by JavaScript and never sent with ordinary product requests.
 */
export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    domain: env.cookie.domain,
    path: '/api/auth',
    maxAge: env.cookie.maxAge,
  };
}

export default {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  createResetToken,
  hashResetToken,
  refreshCookieOptions,
  REFRESH_COOKIE,
};
