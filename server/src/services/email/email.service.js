import { EmailEvent } from '../../models/EmailEvent.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { getTransport, scrubSecrets } from './transport.js';

/**
 * The one door every transactional email goes through.
 *
 * It owns three guarantees, so no caller has to think about them:
 *
 *   1. **At most once.** A send first claims its `EmailEvent` row by
 *      idempotency key, atomically. A retried request, a replayed webhook or
 *      an admin double-click finds the row already `sent` and stops there.
 *   2. **Never fatal.** `sendEmail` does not throw. An order that was placed
 *      stays placed even if Resend is down; the failure is recorded and the
 *      retry worker picks it up.
 *   3. **Nothing sensitive in the logs.** Recipients are masked, bodies are
 *      never logged, provider errors are scrubbed of anything key-shaped.
 */

/** Attempts across inline retries and the background worker, combined. */
export const MAX_ATTEMPTS = 5;

/** How long a claimed send may take before another worker may take it over. */
const LOCK_MS = 60 * 1000;

/** A send that hangs this long is treated as a network failure. */
const SEND_TIMEOUT_MS = 10 * 1000;

/** Pauses between inline attempts. Short: a customer request is waiting. */
const INLINE_BACKOFF_MS = [0, 500, 1500];

/** When the worker should try a failed email again, by attempts so far. */
const DEFERRED_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The duplicate guard *is* the unique index on `idempotencyKey`, and
 * production connects with autoIndex off. Rather than trust that someone ran
 * the seed after deploying, the service builds its own indexes before its
 * first send. `createIndexes` is idempotent, so this is one cheap round trip.
 */
let indexesReady = null;
function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = EmailEvent.createIndexes().catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  return indexesReady;
}

/** `priya@example.com` → `p***@example.com`. Enough to correlate, not to harvest. */
export function maskEmail(email) {
  const [local = '', domain = ''] = String(email ?? '').split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

async function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, code: 'timeout', category: 'network', message: 'Timed out waiting for the email provider', retryable: true }),
      ms,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Claims the right to send `idempotencyKey`, or explains why not.
 *
 * The claim is a single `findOneAndUpdate` with upsert. The filter only
 * matches a row that is failed (or a stale in-flight one whose lock expired),
 * so when the row is already `sent` the upsert tries to insert a second one
 * with the same key and the unique index refuses — which is exactly the
 * signal that this email has been dealt with.
 */
async function claim({ idempotencyKey, type, userId, orderId, recipient, retryable, force }) {
  const now = new Date();

  const claimable = force ? ['failed', 'sending', 'skipped'] : ['failed', 'sending'];
  const filter = {
    idempotencyKey,
    status: { $in: claimable },
    $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
  };
  if (!force) filter.attempts = { $lt: MAX_ATTEMPTS };

  try {
    const event = await EmailEvent.findOneAndUpdate(
      filter,
      {
        $set: {
          status: 'sending',
          lockedUntil: new Date(now.getTime() + LOCK_MS),
          lastAttemptAt: now,
          recipient,
          provider: getTransport(recipient).name,
        },
        $setOnInsert: {
          type,
          user: userId ?? null,
          order: orderId ?? null,
          retryable,
        },
        $inc: { attempts: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return { event };
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const existing = await EmailEvent.findOne({ idempotencyKey }).lean();
    if (!existing) return { refused: 'in_flight' };
    if (existing.status === 'sent') return { refused: 'duplicate', existing };
    if (existing.status === 'skipped') return { refused: 'skipped', existing };
    if (existing.status === 'sending') return { refused: 'in_flight', existing };
    return { refused: 'exhausted', existing };
  }
}

/**
 * Sends one transactional email, at most once per `idempotencyKey`.
 *
 * @param {object}   opts
 * @param {string}   opts.type             an EMAIL_TYPES value
 * @param {string}   opts.to               recipient address
 * @param {string}   opts.idempotencyKey   names the event, e.g. `order:<id>:status:SHIPPED`
 * @param {Function} opts.render           () => ({ subject, html, text })
 * @param {string}  [opts.userId]
 * @param {string}  [opts.orderId]
 * @param {boolean} [opts.retryable=true]  false when the email cannot be rebuilt later
 * @param {boolean} [opts.force=false]     admin retry: ignore the attempt cap
 * @param {number}  [opts.inlineAttempts=3]
 * @returns {Promise<{status: string, eventId?: string, messageId?: string, errorCategory?: string}>}
 */
export async function sendEmail({
  type,
  to,
  idempotencyKey,
  render,
  userId = null,
  orderId = null,
  retryable = true,
  force = false,
  inlineAttempts = INLINE_BACKOFF_MS.length,
}) {
  const recipient = String(to ?? '').trim().toLowerCase();
  const context = {
    type,
    key: idempotencyKey,
    user: userId ? String(userId) : undefined,
    order: orderId ? String(orderId) : undefined,
    to: maskEmail(recipient),
  };

  try {
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      logger.warn('Email not sent: no valid recipient', context);
      return { status: 'skipped', errorCategory: 'no_recipient' };
    }

    await ensureIndexes();

    const { event, refused, existing } = await claim({
      idempotencyKey, type, userId, orderId, recipient, retryable, force,
    });

    if (refused) {
      if (refused === 'duplicate') logger.info('Email already sent — duplicate suppressed', context);
      return {
        status: refused,
        eventId: existing?._id ? String(existing._id) : undefined,
        messageId: existing?.providerMessageId || undefined,
      };
    }

    // ── Render ──────────────────────────────────────────────────────────────
    let message;
    try {
      const rendered = await render();
      message = {
        from: env.email.from,
        replyTo: env.email.replyTo,
        to: recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tags: [{ name: 'type', value: type.toLowerCase() }],
        headers: { 'X-Entity-Ref-ID': idempotencyKey },
      };
    } catch (error) {
      // A rendering bug will fail identically on every retry.
      await EmailEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            status: 'failed', lockedUntil: null, nextAttemptAt: null,
            errorCategory: 'render', errorMessage: scrubSecrets(error?.message),
          },
        },
      );
      logger.error('Email render failed', { ...context, category: 'render' });
      return { status: 'failed', eventId: String(event._id), errorCategory: 'render' };
    }

    // ── Deliver, with short inline retries for transient failures ────────────
    const transport = getTransport(recipient);
    let result;
    let tries = 0;

    for (let i = 0; i < Math.max(1, inlineAttempts); i += 1) {
      if (INLINE_BACKOFF_MS[i]) await sleep(INLINE_BACKOFF_MS[i]);
      tries += 1;
      result = await withTimeout(transport.send(message, { idempotencyKey }), SEND_TIMEOUT_MS);
      if (result.ok || result.skipped || !result.retryable) break;
    }

    const extraTries = tries - 1;

    if (result.ok) {
      await EmailEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            status: 'sent',
            subject: message.subject,
            providerMessageId: result.id ?? '',
            sentAt: new Date(),
            lockedUntil: null,
            nextAttemptAt: null,
            errorCategory: '',
            errorMessage: result.note ? `Provider reported ${result.note}` : '',
          },
          ...(extraTries ? { $inc: { attempts: extraTries } } : {}),
        },
      );

      logger.info('Email sent', { ...context, provider: transport.name, messageId: result.id });
      return { status: 'sent', eventId: String(event._id), messageId: result.id };
    }

    if (result.skipped) {
      await EmailEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            status: 'skipped', subject: message.subject, lockedUntil: null, nextAttemptAt: null,
            errorCategory: result.category, errorMessage: result.message,
          },
        },
      );
      logger.warn('Email skipped', { ...context, category: result.category });
      return { status: 'skipped', eventId: String(event._id), errorCategory: result.category };
    }

    // ── Failed: record it and schedule a deferred retry if that could help ───
    const attempts = event.attempts + extraTries;
    const canRetryLater = result.retryable && event.retryable && attempts < MAX_ATTEMPTS;
    const delay = DEFERRED_BACKOFF_MS[Math.min(attempts - 1, DEFERRED_BACKOFF_MS.length - 1)];

    await EmailEvent.updateOne(
      { _id: event._id },
      {
        $set: {
          status: 'failed',
          subject: message.subject,
          lockedUntil: null,
          nextAttemptAt: canRetryLater ? new Date(Date.now() + delay) : null,
          errorCategory: result.category ?? 'unknown',
          errorMessage: scrubSecrets(result.message),
        },
        ...(extraTries ? { $inc: { attempts: extraTries } } : {}),
      },
    );

    logger.warn('Email failed', {
      ...context,
      provider: transport.name,
      category: result.category,
      code: result.code,
      attempts,
      willRetry: canRetryLater,
    });

    return { status: 'failed', eventId: String(event._id), errorCategory: result.category };
  } catch (error) {
    // The database itself failed. Still never let that escape into an order.
    logger.error('Email pipeline error', { ...context, message: scrubSecrets(error?.message) });
    return { status: 'failed', errorCategory: 'internal' };
  }
}

/** Email history for an order, newest first — what the admin sees. */
export async function listEmailEvents(filter = {}) {
  return EmailEvent.find(filter)
    .select('type status recipient subject providerMessageId attempts lastAttemptAt nextAttemptAt retryable errorCategory errorMessage sentAt createdAt')
    .sort({ createdAt: -1 })
    .lean();
}

export default { sendEmail, listEmailEvents, maskEmail, MAX_ATTEMPTS };
