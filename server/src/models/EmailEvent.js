import mongoose from 'mongoose';

/** Every transactional email the store sends. */
export const EMAIL_TYPES = Object.freeze({
  WELCOME: 'WELCOME',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ORDER_CONFIRMATION: 'ORDER_CONFIRMATION',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  ORDER_PROCESSING: 'ORDER_PROCESSING',
  ORDER_SHIPPED: 'ORDER_SHIPPED',
  ORDER_OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ADMIN_PASSWORD_RESET: 'ADMIN_PASSWORD_RESET',
  ADMIN_PASSWORD_CHANGED: 'ADMIN_PASSWORD_CHANGED',
  ADMIN_SECURITY_ALERT: 'ADMIN_SECURITY_ALERT',
  ADMIN_PANEL_LOCKED: 'ADMIN_PANEL_LOCKED',
});

export const EMAIL_STATUSES = Object.freeze(['sending', 'sent', 'failed', 'skipped']);

/**
 * One row per logical email, keyed by what it is *about* rather than when it
 * was attempted.
 *
 * `idempotencyKey` is the duplicate guard. It names the event — "order X was
 * shipped", "user Y registered" — so a retried request, a replayed webhook, an
 * admin double-click or a background retry all resolve to the same row, and
 * the unique index turns a second send into a no-op. The same key is passed to
 * Resend, which dedupes on its side too.
 *
 * The rendered email is deliberately not stored: it holds names, addresses and
 * for password resets a live token. A retry re-renders from the order instead.
 */
const emailEventSchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, required: true, unique: true, maxlength: 256 },
    type: { type: String, enum: Object.values(EMAIL_TYPES), required: true, index: true },
    status: { type: String, enum: EMAIL_STATUSES, required: true, index: true },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },

    /** The address it went to. Masked in every log line, shown in the admin. */
    recipient: { type: String, trim: true, lowercase: true, default: '' },
    subject: { type: String, trim: true, maxlength: 240, default: '' },

    provider: { type: String, default: '' },
    providerMessageId: { type: String, default: '' },

    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    /** When the retry worker may try again. Null means it will not. */
    nextAttemptAt: { type: Date, default: null, index: true },
    /**
     * Some emails cannot be rebuilt later — a password reset carries a token
     * that only ever existed in memory — so they are retried inline or not at
     * all.
     */
    retryable: { type: Boolean, default: true },
    /** Held while a send is in flight, so two workers never race one email. */
    lockedUntil: { type: Date, default: null },

    /** A coarse bucket for dashboards and alerting — never the raw error. */
    errorCategory: { type: String, default: '' },
    /** The provider's message, with anything secret-shaped stripped out. */
    errorMessage: { type: String, maxlength: 500, default: '' },

    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

emailEventSchema.index({ order: 1, createdAt: -1 });
emailEventSchema.index({ status: 1, nextAttemptAt: 1 });
emailEventSchema.index({ user: 1, type: 1, createdAt: -1 });

export const EmailEvent = mongoose.model('EmailEvent', emailEventSchema);
export default EmailEvent;
