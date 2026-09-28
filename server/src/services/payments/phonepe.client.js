import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * PhonePe Standard Checkout, API v2 — the HTTP client.
 *
 * Endpoints, from PhonePe's current developer documentation
 * (developer.phonepe.com → Payment Gateway → Website → Standard Checkout):
 *
 *   Token          POST {auth}/v1/oauth/token         (form-encoded, client_credentials)
 *   Create payment POST {pg}/checkout/v2/pay
 *   Order status   GET  {pg}/checkout/v2/order/{merchantOrderId}/status
 *
 * Every authenticated call sends `Authorization: O-Bearer <access_token>`.
 * Amounts are in paise.
 *
 * Nothing in this file logs, returns or throws the client secret or an access
 * token. Errors carry an HTTP status and PhonePe's error code only.
 */

const HOSTS = Object.freeze({
  sandbox: {
    token: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
    pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  },
  production: {
    token: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
    pg: 'https://api.phonepe.com/apis/pg',
  },
});

/** Refresh a token this long before PhonePe says it expires. */
const TOKEN_SKEW_MS = 5 * 60 * 1000;

export class PhonePeError extends Error {
  /**
   * @param {string} message  safe to log; never contains a secret
   * @param {{ kind: 'config'|'timeout'|'network'|'auth'|'client'|'server'|'invalid', status?: number, code?: string }} info
   */
  constructor(message, { kind, status = 0, code = '' }) {
    super(message);
    this.name = 'PhonePeError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    /** Worth trying again: the request may never have reached PhonePe, or PhonePe was briefly unwell. */
    this.retryable = kind === 'timeout' || kind === 'network' || kind === 'server';
    /** We cannot tell whether PhonePe acted on it. */
    this.outcomeUnknown = kind === 'timeout' || kind === 'network';
  }
}

// ── Test seam ────────────────────────────────────────────────────────────────

let fetchImpl = (...args) => globalThis.fetch(...args);

/**
 * The payment test suite replaces the network with an in-process fake
 * PhonePe. Refused in production, so it can never become a way round the
 * real gateway.
 */
export function setPhonePeFetch(fn) {
  if (env.isProd) throw new Error('setPhonePeFetch is for tests only');
  fetchImpl = fn ?? ((...args) => globalThis.fetch(...args));
  resetTokenCache();
}

// ── Plumbing ─────────────────────────────────────────────────────────────────

function hosts() {
  if (!env.phonepe.isConfigured) {
    throw new PhonePeError('PhonePe is not configured', { kind: 'config' });
  }
  return HOSTS[env.phonepe.env];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function send(url, { method, headers, body, label }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.phonepe.requestTimeoutMs);
  const started = Date.now();

  let res;
  try {
    res = await fetchImpl(url, { method, headers, body, signal: controller.signal });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    logger.warn('PhonePe request did not complete', { call: label, reason: timedOut ? 'timeout' : 'network' });
    throw new PhonePeError(timedOut ? 'PhonePe did not respond in time' : 'Could not reach PhonePe', {
      kind: timedOut ? 'timeout' : 'network',
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => '');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const code = String(json?.code || json?.errorCode || '').slice(0, 80);
    const kind = res.status === 401 || res.status === 403
      ? 'auth'
      : res.status === 429 || res.status >= 500 ? 'server' : 'client';
    logger.warn('PhonePe request refused', { call: label, status: res.status, code, ms: Date.now() - started });
    throw new PhonePeError(`PhonePe returned ${res.status}${code ? ` (${code})` : ''}`, { kind, status: res.status, code });
  }

  if (!json || typeof json !== 'object') {
    throw new PhonePeError('PhonePe returned an unreadable response', { kind: 'invalid', status: res.status });
  }

  logger.debug('PhonePe request ok', { call: label, status: res.status, ms: Date.now() - started });
  return json;
}

// ── Access token ─────────────────────────────────────────────────────────────

let cachedToken = null; // { value, expiresAt }
let inflightToken = null;

export function resetTokenCache() {
  cachedToken = null;
  inflightToken = null;
}

async function accessToken({ force = false } = {}) {
  if (!force && cachedToken && cachedToken.expiresAt - TOKEN_SKEW_MS > Date.now()) return cachedToken.value;

  // One token request at a time, however many payments are starting.
  inflightToken ??= (async () => {
    const { token: url } = hosts();
    const form = new URLSearchParams({
      client_id: env.phonepe.clientId,
      client_version: env.phonepe.clientVersion,
      client_secret: env.phonepe.clientSecret,
      grant_type: 'client_credentials',
    });

    const json = await send(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(),
      label: 'oauth.token',
    });

    if (typeof json.access_token !== 'string' || !json.access_token) {
      throw new PhonePeError('PhonePe token response had no access token', { kind: 'invalid' });
    }
    // `expires_at` is epoch seconds. Fall back to a short life if absent.
    const expiresAt = Number(json.expires_at) > 0 ? Number(json.expires_at) * 1000 : Date.now() + 10 * 60 * 1000;
    cachedToken = { value: json.access_token, expiresAt };
    return cachedToken.value;
  })().finally(() => {
    inflightToken = null;
  });

  return inflightToken;
}

/**
 * An authenticated call. A 401 fetches a fresh token once; transient failures
 * are retried only when the call is safe to repeat (reads).
 */
async function call(method, path, body, { label, retries = 0 }) {
  const { pg } = hosts();
  let refreshed = false;

  for (let attempt = 0; ; attempt += 1) {
    const token = await accessToken({ force: refreshed });
    try {
      return await send(`${pg}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `O-Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        label,
      });
    } catch (error) {
      if (error.kind === 'auth' && !refreshed) {
        refreshed = true;
        cachedToken = null;
        continue;
      }
      if (error.retryable && attempt < retries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }
}

// ── Shape of what comes back ─────────────────────────────────────────────────

const STATES = new Set(['PENDING', 'COMPLETED', 'FAILED']);
const state = (value) => (STATES.has(String(value)) ? String(value) : 'UNKNOWN');
const str = (value, max = 120) => (value === undefined || value === null ? '' : String(value).slice(0, max));

/** PhonePe's hosted checkout lives on phonepe.com, over https — nothing else is ever handed to a browser. */
function safeCheckoutUrl(url) {
  try {
    const parsed = new URL(String(url));
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol === 'https:' && (host === 'phonepe.com' || host.endsWith('.phonepe.com'))) return parsed.toString();
  } catch {
    // fall through
  }
  return null;
}

function latestPayment(details) {
  if (!Array.isArray(details) || !details.length) return null;
  const sorted = [...details].sort((a, b) => Number(b?.timestamp ?? 0) - Number(a?.timestamp ?? 0));
  const p = sorted[0] ?? {};
  return {
    transactionId: str(p.transactionId),
    paymentMode: str(p.paymentMode, 40),
    state: state(p.state),
    amount: Number.isInteger(p.amount) ? p.amount : null,
    errorCode: str(p.errorCode, 80),
    detailedErrorCode: str(p.detailedErrorCode, 80),
  };
}

// ── The two operations ──────────────────────────────────────────────────────

/**
 * Creates a hosted checkout. Not retried: if the request times out we cannot
 * tell whether PhonePe created it, and a second create would be a second
 * payment. The caller treats that attempt as unusable and lets the customer
 * start a fresh one.
 */
export async function createPayment({ merchantOrderId, amount, redirectUrl, expireAfter, message, udf = {} }) {
  const json = await call('POST', '/checkout/v2/pay', {
    merchantOrderId,
    amount,
    expireAfter,
    metaInfo: udf,
    paymentFlow: {
      type: 'PG_CHECKOUT',
      message,
      merchantUrls: { redirectUrl },
    },
  }, { label: 'checkout.pay' });

  const checkoutUrl = safeCheckoutUrl(json.redirectUrl);
  if (!checkoutUrl) throw new PhonePeError('PhonePe did not return a usable checkout link', { kind: 'invalid' });

  return {
    gatewayOrderId: str(json.orderId),
    state: state(json.state),
    expireAt: Number(json.expireAt) > 0 ? new Date(Number(json.expireAt)) : null,
    redirectUrl: checkoutUrl,
  };
}

/** The authoritative answer to "has this been paid?". Safe to retry. */
export async function getOrderStatus(merchantOrderId) {
  const json = await call(
    'GET',
    `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false&errorContext=true`,
    undefined,
    { label: 'checkout.status', retries: 2 },
  );

  return {
    gatewayOrderId: str(json.orderId),
    state: state(json.state),
    amount: Number.isInteger(json.amount) ? json.amount : null,
    expireAt: Number(json.expireAt) > 0 ? new Date(Number(json.expireAt)) : null,
    errorCode: str(json.errorCode ?? json.errorContext?.errorCode, 80),
    detailedErrorCode: str(json.detailedErrorCode ?? json.errorContext?.detailedErrorCode, 80),
    payment: latestPayment(json.paymentDetails),
  };
}

export default { createPayment, getOrderStatus, setPhonePeFetch, resetTokenCache };
