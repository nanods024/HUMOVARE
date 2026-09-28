import mongoose from 'mongoose';
import { PAYMENT_EVENT_TYPES, PAYMENT_GATEWAYS } from '../constants/index.js';

/**
 * Append-only payment audit trail: every attempt created, every state the
 * gateway reported, every webhook accepted or refused.
 *
 * It records what happened and where the news came from — never a secret,
 * token, raw webhook body or card detail.
 */
const paymentEventSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAttempt', default: null },
    gateway: { type: String, enum: Object.values(PAYMENT_GATEWAYS), required: true },
    type: { type: String, enum: Object.values(PAYMENT_EVENT_TYPES), required: true },
    /** checkout, retry, webhook, status_check, reconciler, admin */
    source: { type: String, required: true },
    gatewayReference: { type: String, default: '' },
    status: { type: String, default: '' },
    /** Paise. */
    amount: { type: Number, default: null },
    detail: { type: String, maxlength: 300, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

paymentEventSchema.index({ order: 1, createdAt: 1 });

export const PaymentEvent = mongoose.model('PaymentEvent', paymentEventSchema);
export default PaymentEvent;
