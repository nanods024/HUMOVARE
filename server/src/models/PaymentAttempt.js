import mongoose from 'mongoose';
import { PAYMENT_ATTEMPT_STATUS, PAYMENT_GATEWAYS } from '../constants/index.js';

/**
 * One trip to the gateway's checkout for an order.
 *
 * An order keeps every attempt it ever had — a failed first try is history,
 * not something to overwrite — and each attempt has its own gateway reference
 * (`merchantOrderId`), because PhonePe treats every reference as a separate
 * payment.
 *
 * `active` is set while the attempt can still be paid and removed the moment
 * it reaches a final state. The partial unique index on it means an order can
 * never have two open attempts, however many times "Pay" is clicked or the
 * request retried: the second insert fails at the database, not in a
 * read-then-write check that two requests could both pass.
 */
const paymentAttemptSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gateway: { type: String, enum: Object.values(PAYMENT_GATEWAYS), required: true },
    attemptNumber: { type: Number, required: true, min: 1 },

    /** Our reference, sent to PhonePe: `<orderNumber>-P<n>`. */
    merchantOrderId: { type: String, required: true, unique: true },
    /** Amount in paise, fixed from the server-side order total. */
    amount: { type: Number, required: true, min: 100 },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: Object.values(PAYMENT_ATTEMPT_STATUS),
      default: PAYMENT_ATTEMPT_STATUS.CREATED,
      index: true,
    },
    active: { type: Boolean, default: undefined },

    /** PhonePe's own ids, once known. */
    gatewayOrderId: { type: String, default: '' },
    transactionId: { type: String, default: '' },
    paymentMode: { type: String, default: '' },
    /** The hosted checkout page; returned to the owner only, while valid. */
    redirectUrl: { type: String, default: '' },
    expireAt: { type: Date, default: null },

    errorCode: { type: String, default: '' },
    detailedErrorCode: { type: String, default: '' },

    lastCheckedAt: { type: Date, default: null },
    checks: { type: Number, default: 0 },
    finalizedAt: { type: Date, default: null },
    /** Set when something needs a human: an amount mismatch, a late payment. */
    needsReview: { type: Boolean, default: false },
    reviewReason: { type: String, default: '' },
  },
  { timestamps: true },
);

paymentAttemptSchema.index(
  { order: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'one_active_attempt_per_order' },
);
paymentAttemptSchema.index({ order: 1, attemptNumber: 1 }, { unique: true });
paymentAttemptSchema.index({ status: 1, expireAt: 1 });
// The reconciler polls open attempts every couple of minutes.
paymentAttemptSchema.index(
  { active: 1, lastCheckedAt: 1 },
  { partialFilterExpression: { active: true }, name: 'open_attempts_to_check' },
);

export const PaymentAttempt = mongoose.model('PaymentAttempt', paymentAttemptSchema);
export default PaymentAttempt;
