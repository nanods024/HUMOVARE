import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Authenticates a PhonePe webhook.
 *
 * PhonePe signs webhooks with credentials set on its dashboard: the
 * `Authorization` header is SHA256("<username>:<password>") as hex, which is
 * what PhonePe's own SDKs compare against in `validateCallback`.
 *
 * That header proves the sender knows the webhook credentials, but it is the
 * same on every call — it cannot, by itself, stop a captured webhook being
 * replayed. So a webhook is only ever a prompt: the handler re-reads the
 * payment's state from PhonePe's status API before changing anything, and
 * every state change is one-way and idempotent. A replayed "COMPLETED" can
 * neither mark an unpaid order paid nor send a second email.
 */
export function verifyWebhookAuthorization(header) {
  const { webhookUsername, webhookPassword, webhookConfigured } = env.phonepe;
  if (!webhookConfigured) return false;

  const provided = String(header ?? '').trim().replace(/^sha256\s+/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;

  const expected = crypto.createHash('sha256').update(`${webhookUsername}:${webhookPassword}`).digest();
  return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), expected);
}

/** The Standard Checkout payment events HUMOVARE acts on. */
export const WEBHOOK_EVENTS = Object.freeze({
  ORDER_COMPLETED: 'checkout.order.completed',
  ORDER_FAILED: 'checkout.order.failed',
});

/**
 * PhonePe's docs say to read `event` and ignore `type`; the SDK samples use
 * `type` in upper snake case. Accept either, normalised to the `event` form.
 */
const TYPE_TO_EVENT = {
  CHECKOUT_ORDER_COMPLETED: WEBHOOK_EVENTS.ORDER_COMPLETED,
  CHECKOUT_ORDER_FAILED: WEBHOOK_EVENTS.ORDER_FAILED,
};

export function webhookEventName(body) {
  if (typeof body?.event === 'string' && body.event) return body.event.toLowerCase();
  if (typeof body?.type === 'string') return TYPE_TO_EVENT[body.type] ?? body.type.toLowerCase();
  return '';
}
