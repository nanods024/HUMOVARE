import mongoose from 'mongoose';
import {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  HISTORICAL_PAYMENT_STATUSES,
} from '../constants/index.js';

/**
 * Order lines are a full snapshot, not references. A product can be renamed,
 * repriced or deactivated later; the order must still render exactly as it
 * was placed.
 */
const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    size: { type: String, required: true },
    color: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const shippingAddressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: '' },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
  },
  { _id: false },
);

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUS_VALUES, required: true },
    note: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    /** Human-facing reference shown in emails and support tickets. */
    orderNumber: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    items: { type: [orderItemSchema], required: true, validate: (v) => v.length > 0 },
    shippingAddress: { type: shippingAddressSchema, required: true },

    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    paymentMethod: { type: String, enum: Object.values(PAYMENT_METHODS), required: true },
    paymentStatus: {
      type: String,
      // HISTORICAL_PAYMENT_STATUSES: values older orders may still hold.
      enum: [...Object.values(PAYMENT_STATUS), ...HISTORICAL_PAYMENT_STATUSES],
      default: PAYMENT_STATUS.PENDING,
      index: true,
    },
    /**
     * A summary of the money side, for lists and emails. The full history —
     * every attempt, every gateway state — is in PaymentAttempt and
     * PaymentEvent; this is only ever written from a verified gateway result.
     */
    payment: {
      provider: { type: String, default: '' },
      /** The paid attempt's gateway reference (our merchantOrderId). */
      reference: { type: String, default: '' },
      gatewayOrderId: { type: String, default: '' },
      transactionId: { type: String, default: '' },
      paymentMode: { type: String, default: '' },
      /** Paise, as confirmed by the gateway. */
      amountPaid: { type: Number, default: 0 },
      attempts: { type: Number, default: 0 },
      lastAttemptAt: { type: Date, default: null },
      paidAt: { type: Date, default: null },
      /** Unpaid online orders release their stock after this. */
      expiresAt: { type: Date, default: null },
      needsReview: { type: Boolean, default: false },
    },

    orderStatus: {
      type: String,
      enum: ORDER_STATUS_VALUES,
      default: ORDER_STATUS.PENDING,
      index: true,
    },
    statusHistory: { type: [statusEventSchema], default: [] },

    customerNote: { type: String, trim: true, maxlength: 500, default: '' },
    cancelledAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },

    /**
     * Courier details, set by an admin when the parcel ships. All optional:
     * the shipped email simply leaves out whatever is not known rather than
     * showing an empty tracking section.
     */
    shipment: {
      carrier: { type: String, trim: true, maxlength: 80, default: '' },
      trackingNumber: { type: String, trim: true, maxlength: 80, default: '' },
      trackingUrl: { type: String, trim: true, maxlength: 500, default: '' },
      estimatedDelivery: { type: Date, default: null },
      shippedAt: { type: Date, default: null },
    },

  },
  { timestamps: true },
);

orderSchema.index({ user: 1, createdAt: -1 });
// The admin order list and the dashboard read orders newest-first by date.
orderSchema.index({ createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
// The reconciler's sweep for unpaid online orders past their window.
orderSchema.index({ paymentMethod: 1, orderStatus: 1, 'payment.expiresAt': 1 });

orderSchema.methods.pushStatus = function pushStatus(status, note = '') {
  this.orderStatus = status;
  this.statusHistory.push({ status, note, at: new Date() });
  if (status === ORDER_STATUS.DELIVERED) this.deliveredAt = new Date();
  if (status === ORDER_STATUS.CANCELLED) this.cancelledAt = new Date();
  return this;
};

export const Order = mongoose.model('Order', orderSchema);
export default Order;
