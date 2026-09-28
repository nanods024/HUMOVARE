import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Verifies a Google ID token (the `credential` the Google button hands the
 * storefront) and returns the identity it asserts, or null.
 *
 * `verifyIdToken` checks the RS256 signature against Google's published keys
 * (fetched and cached by the library), the issuer, the expiry, and that the
 * audience is this shop's client ID — a token minted for any other site is
 * refused.
 */
let client = null;

async function verifyWithGoogle(credential) {
  if (!env.google.clientId) return null;
  client ??= new OAuth2Client(env.google.clientId);

  const ticket = await client.verifyIdToken({ idToken: credential, audience: env.google.clientId });
  const payload = ticket.getPayload();
  if (!payload) return null;

  return {
    sub: payload.sub,
    email: String(payload.email || '').toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: payload.name || '',
    hostedDomain: payload.hd || null,
  };
}

let verifier = verifyWithGoogle;

export async function verifyGoogleCredential(credential) {
  try {
    return await verifier(credential);
  } catch (error) {
    // The message says why (expired, wrong audience…); the token never logs.
    logger.warn('Google credential rejected', { reason: error.message });
    return null;
  }
}

/**
 * Test seam: the smoke tests have no Google keys to sign with, so they swap
 * in a verifier. Refuses in production so it cannot become a bypass.
 */
export function setGoogleVerifier(fn) {
  if (env.isProd) throw new Error('setGoogleVerifier is for tests only');
  verifier = fn ?? verifyWithGoogle;
}
