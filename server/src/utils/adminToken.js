import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'humovare-admin';

/**
 * Admin tokens live in their own namespace.
 *
 * Two independent guards stop a customer token being used here: it is signed
 * with a different secret, and it lacks `typ: 'admin'`. Both are checked on
 * every verify, so escalation by editing client-side state is impossible.
 */
const ADMIN_TYPE = 'admin';

export const ADMIN_ACCESS_COOKIE = 'hv_admin_at';
export const ADMIN_REFRESH_COOKIE = 'hv_admin_rt';
export const ADMIN_CSRF_COOKIE = 'hv_admin_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * `sid` ties the access token to one stored session, so signing out, going
 * idle or being disabled ends access at once — not when the token expires.
 */
export function signAdminAccessToken({ adminId, role, tokenVersion, sessionId }) {
  return jwt.sign({ sub: adminId, role, ver: tokenVersion, sid: sessionId, typ: ADMIN_TYPE }, env.adminJwt.accessSecret, {
    expiresIn: env.adminJwt.accessExpiresIn,
    issuer: ISSUER,
  });
}

export function signAdminRefreshToken({ adminId, tokenVersion, family }) {
  return jwt.sign({ sub: adminId, ver: tokenVersion, fam: family, typ: ADMIN_TYPE }, env.adminJwt.refreshSecret, {
    expiresIn: env.adminJwt.refreshExpiresIn,
    issuer: ISSUER,
  });
}

function verify(token, secret) {
  const payload = jwt.verify(token, secret, { issuer: ISSUER });
  if (payload.typ !== ADMIN_TYPE) {
    // A correctly signed token of the wrong kind is still a rejection.
    throw new jwt.JsonWebTokenError('Token is not an admin token');
  }
  return payload;
}

export const verifyAdminAccessToken = (token) => verify(token, env.adminJwt.accessSecret);
export const verifyAdminRefreshToken = (token) => verify(token, env.adminJwt.refreshSecret);

/** Only the hash of a refresh token is stored, so a DB leak is not replayable. */
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const newFamilyId = () => crypto.randomBytes(16).toString('hex');
export const newCsrfToken = () => crypto.randomBytes(24).toString('hex');

/**
 * Both admin tokens are HTTP-only and scoped to `/api/admin`, so they are
 * unreadable from JavaScript and never ride along with storefront requests.
 *
 * `SameSite=Strict` is the first line of CSRF defence — the browser will not
 * attach these cookies to any cross-site request at all, so the double-submit
 * check below only ever has to catch same-site mistakes. This requires the
 * admin app to be served from the same site as the API, which is how it is
 * deployed: `/admin` on the storefront domain, or an `admin.` subdomain
 * (SameSite is judged on the registrable domain, so a subdomain still counts
 * as same-site). Hosting the admin app on a different registrable domain
 * would need `none`, and would give up this layer.
 */
function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'strict',
    domain: env.cookie.domain,
    path: '/api/admin',
  };
}

export const adminAccessCookieOptions = () => ({
  ...baseCookieOptions(),
  maxAge: 15 * 60 * 1000,
});

export const adminRefreshCookieOptions = () => ({
  ...baseCookieOptions(),
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

/**
 * The CSRF cookie is deliberately readable by JavaScript: the admin client
 * copies it into the `X-CSRF-Token` header, and the server checks the two
 * match. A cross-site form post can send the cookie but cannot read it to set
 * the header, so the double submit fails.
 */
export const adminCsrfCookieOptions = () => ({
  httpOnly: false,
  secure: env.isProd,
  sameSite: 'strict',
  domain: env.cookie.domain,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

export default {
  signAdminAccessToken,
  signAdminRefreshToken,
  verifyAdminAccessToken,
  verifyAdminRefreshToken,
  hashToken,
  newFamilyId,
  newCsrfToken,
};
