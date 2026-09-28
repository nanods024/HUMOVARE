import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';

import { env } from '../../config/env.js';

/**
 * Delivery transports.
 *
 * Every transport takes the same message and returns the same shape:
 *
 *   { ok: true,  id }                              delivered to the provider
 *   { ok: false, category, message, retryable }    not delivered
 *
 * so the email service above it never has to know which one is in use. The
 * Resend client is created lazily and only on the server — this module is the
 * single place the API key is read from configuration.
 */

// ── Error classification ─────────────────────────────────────────────────────

/**
 * Resend's error names, bucketed by what to do about them.
 *
 * Transient errors are worth retrying; permanent ones will fail the same way
 * every time (a bad key, an unverified sender, a malformed address), so
 * retrying them only burns quota and delays the alert.
 */
const TRANSIENT = new Set([
  'rate_limit_exceeded',
  'concurrent_idempotent_requests',
  'internal_server_error',
  'application_error',
  'daily_quota_exceeded',
]);

const CATEGORY = {
  missing_api_key: 'configuration',
  invalid_api_key: 'configuration',
  restricted_api_key: 'configuration',
  invalid_from_address: 'configuration',
  invalid_access: 'configuration',
  invalid_region: 'configuration',
  validation_error: 'invalid_request',
  missing_required_field: 'invalid_request',
  invalid_parameter: 'invalid_request',
  invalid_attachment: 'invalid_request',
  invalid_idempotency_key: 'invalid_request',
  rate_limit_exceeded: 'rate_limited',
  daily_quota_exceeded: 'quota',
  monthly_quota_exceeded: 'quota',
  concurrent_idempotent_requests: 'in_flight',
  internal_server_error: 'provider_error',
  application_error: 'provider_error',
  security_error: 'provider_error',
  not_found: 'provider_error',
  method_not_allowed: 'provider_error',
};

/** Strips anything that looks like a key before an error is stored or logged. */
export function scrubSecrets(text) {
  return String(text ?? '')
    .replace(/re_[A-Za-z0-9_]{8,}/g, 're_***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .slice(0, 500);
}

function fromResendError(error) {
  const name = error?.name ?? 'application_error';
  const status = error?.statusCode ?? null;

  return {
    ok: false,
    code: name,
    category: CATEGORY[name] ?? (status && status >= 500 ? 'provider_error' : 'unknown'),
    message: scrubSecrets(error?.message ?? 'Resend rejected the request'),
    retryable: TRANSIENT.has(name) || (status !== null && status >= 500),
  };
}

// ── Resend ───────────────────────────────────────────────────────────────────

let resendClient = null;

function getResend() {
  if (!resendClient) resendClient = new Resend(env.email.resendApiKey);
  return resendClient;
}

const resendTransport = {
  name: 'resend',

  async send(message, { idempotencyKey } = {}) {
    try {
      const { data, error } = await getResend().emails.send(
        {
          from: message.from,
          to: [message.to],
          replyTo: message.replyTo,
          subject: message.subject,
          html: message.html,
          text: message.text,
          tags: message.tags,
          headers: message.headers,
        },
        idempotencyKey ? { idempotencyKey } : undefined,
      );

      if (error) {
        // Resend rejects a reused key with a *different* payload. We only ever
        // reuse a key for the same logical email, so this means the original
        // attempt was accepted even though we never saw the reply.
        if (error.name === 'invalid_idempotent_request') {
          return { ok: true, id: '', note: 'already-accepted' };
        }
        return fromResendError(error);
      }

      return { ok: true, id: data?.id ?? '' };
    } catch (error) {
      // A thrown error is the network, not Resend: DNS, a reset socket, a
      // timeout. Always worth another go.
      return {
        ok: false,
        code: 'network_error',
        category: 'network',
        message: scrubSecrets(error?.message ?? 'Network error talking to Resend'),
        retryable: true,
      };
    }
  },
};

// ── Memory (test suites) ─────────────────────────────────────────────────────

/**
 * Keeps sent mail in process so a test can read it back — including the reset
 * link, which is how the suite exercises the real reset flow end to end.
 *
 * `failNext` lets a test inject a provider failure without touching the
 * network. It exists only on this transport.
 */
const outbox = [];
const failures = [];

export const memoryTransport = {
  name: 'memory',
  outbox,

  /** Queue a failure for the next N sends. */
  failNext(count = 1, failure = { code: 'internal_server_error', category: 'provider_error', retryable: true }) {
    for (let i = 0; i < count; i += 1) failures.push(failure);
  },

  reset() {
    outbox.length = 0;
    failures.length = 0;
  },

  async send(message, { idempotencyKey } = {}) {
    if (failures.length) {
      const failure = failures.shift();
      return { ok: false, message: 'Injected test failure', ...failure };
    }

    const id = `mem_${outbox.length + 1}_${Date.now()}`;
    outbox.push({ ...message, id, idempotencyKey });
    return { ok: true, id };
  },
};

// ── Preview (local development without a key) ───────────────────────────────

const PREVIEW_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.email-previews');

/**
 * Writes each email to server/.email-previews/ as an HTML file, so a developer
 * without a Resend key can still open a reset link or check a layout.
 *
 * This is the email itself landing on the developer's own disk, not a log
 * line: nothing is printed to the console, and the directory is gitignored.
 * It refuses to run in production.
 */
const previewTransport = {
  name: 'preview',

  async send(message) {
    if (env.isProd) {
      return { ok: false, category: 'configuration', message: 'Preview transport is disabled in production', retryable: false };
    }

    await fs.mkdir(PREVIEW_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(PREVIEW_DIR, `${stamp}-${message.tags?.[0]?.value ?? 'email'}.html`);
    await fs.writeFile(file, message.html, 'utf8');

    return { ok: true, id: `preview_${stamp}` };
  },
};

// ── Disabled ─────────────────────────────────────────────────────────────────

const disabledTransport = {
  name: 'disabled',
  async send() {
    return { ok: false, skipped: true, category: 'disabled', message: 'Email delivery is disabled', retryable: true };
  },
};

const TRANSPORTS = {
  resend: resendTransport,
  memory: memoryTransport,
  preview: previewTransport,
  disabled: disabledTransport,
};

/** True when `recipient` matches the development allowlist. */
export function isAllowedInDevelopment(recipient) {
  const address = String(recipient ?? '').toLowerCase();
  const domain = address.split('@')[1] ?? '';

  return env.email.devAllowlist.some((entry) => {
    const rule = entry.toLowerCase();
    // `*` switches the safety net off: every customer gets real mail.
    if (rule === '*') return true;
    return rule.startsWith('*@') ? domain === rule.slice(2) : address === rule;
  });
}

/**
 * The transport for this recipient.
 *
 * In production that is simply the configured one. Everywhere else, a real
 * send is only allowed to allowlisted addresses; anything else is diverted to
 * the preview folder, so local testing can never email a stranger.
 */
export function getTransport(recipient) {
  const name = env.email.transport;
  if (name === 'resend' && !env.email.resendApiKey) return disabledTransport;

  if (name === 'resend' && !env.isProd && recipient && !isAllowedInDevelopment(recipient)) {
    return previewTransport;
  }

  return TRANSPORTS[name] ?? disabledTransport;
}

export default getTransport;
