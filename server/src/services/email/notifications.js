import { Order } from '../../models/Order.js';
import { User } from '../../models/User.js';
import { EmailEvent, EMAIL_TYPES } from '../../models/EmailEvent.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHODS } from '../../constants/index.js';
import { sendEmail, MAX_ATTEMPTS } from './email.service.js';
import { renderTemplate } from './templates/index.js';
import { formatDate } from './templates/components.js';

/**
 * Store events → customer emails.
 *
 * Services call these after their database write has succeeded. Every
 * function here resolves (never rejects) with the send outcome, so a caller
 * can report it but never has to guard against it.
 *
 * Idempotency keys name the event, not the attempt:
 *
 *   welcome:<user>                       once per account
 *   password-reset:<user>:<token-hash>   once per reset token
 *   order:<order>:confirmation           once per order
 *   order:<order>:payment-success        once per order
 *   order:<order>:payment-failed         once per order
 *   order:<order>:status:<STATUS>        once per order per status
 */

// ── Keys ─────────────────────────────────────────────────────────────────────

export const emailKeys = {
  welcome: (userId) => `welcome:${userId}`,
  passwordReset: (userId, tokenHash) => `password-reset:${userId}:${String(tokenHash).slice(0, 24)}`,
  confirmation: (orderId) => `order:${orderId}:confirmation`,
  paymentSuccess: (orderId) => `order:${orderId}:payment-success`,
  paymentFailed: (orderId) => `order:${orderId}:payment-failed`,
  status: (orderId, status) => `order:${orderId}:status:${status}`,
};

/** Which email an order status change sends. PENDING sends nothing. */
export const STATUS_EMAIL = Object.freeze({
  [ORDER_STATUS.CONFIRMED]: EMAIL_TYPES.ORDER_CONFIRMATION,
  [ORDER_STATUS.PROCESSING]: EMAIL_TYPES.ORDER_PROCESSING,
  [ORDER_STATUS.SHIPPED]: EMAIL_TYPES.ORDER_SHIPPED,
  [ORDER_STATUS.OUT_FOR_DELIVERY]: EMAIL_TYPES.ORDER_OUT_FOR_DELIVERY,
  [ORDER_STATUS.DELIVERED]: EMAIL_TYPES.ORDER_DELIVERED,
  [ORDER_STATUS.CANCELLED]: EMAIL_TYPES.ORDER_CANCELLED,
});

// ── View models ──────────────────────────────────────────────────────────────

const firstNameOf = (name) => String(name ?? '').trim().split(/\s+/)[0] ?? '';

const METHOD_LABELS = {
  [PAYMENT_METHODS.COD]: 'Cash on delivery',
  [PAYMENT_METHODS.ONLINE]: 'Online payment (PhonePe)',
};

function paymentStatusView(order) {
  switch (order.paymentStatus) {
    case PAYMENT_STATUS.PAID:
      return { label: 'Paid', tone: 'success' };
    case PAYMENT_STATUS.FAILED:
      return { label: 'Failed', tone: 'danger' };
    case PAYMENT_STATUS.CANCELLED:
      return { label: 'Not charged', tone: 'info' };
    default:
      return order.paymentMethod === PAYMENT_METHODS.COD
        ? { label: 'Due on delivery', tone: 'warning' }
        : { label: 'Awaiting payment', tone: 'warning' };
  }
}

const STATUS_VIEW = {
  [ORDER_STATUS.PENDING]: ['Awaiting payment', 'warning'],
  [ORDER_STATUS.CONFIRMED]: ['Confirmed', 'success'],
  [ORDER_STATUS.PROCESSING]: ['Processing', 'info'],
  [ORDER_STATUS.SHIPPED]: ['Shipped', 'info'],
  [ORDER_STATUS.OUT_FOR_DELIVERY]: ['Out for delivery', 'info'],
  [ORDER_STATUS.DELIVERED]: ['Delivered', 'success'],
  [ORDER_STATUS.CANCELLED]: ['Cancelled', 'danger'],
};

/** The customer-facing reason for a cancellation, from the status history. */
function cancellationReason(order) {
  const event = [...(order.statusHistory ?? [])].reverse().find((entry) => entry.status === ORDER_STATUS.CANCELLED);
  return event?.note ?? '';
}

/**
 * Everything a template may show about an order, already formatted.
 *
 * Templates never see the raw document, so a new internal field can never
 * leak into an email by accident — it has to be added here on purpose.
 */
export function orderViewModel(order, user) {
  const [statusLabel, statusTone] = STATUS_VIEW[order.orderStatus] ?? ['Updated', 'neutral'];
  const payment = paymentStatusView(order);
  const shipment = order.shipment ?? {};

  return {
    firstName: firstNameOf(user?.name ?? order.shippingAddress?.name),
    customerName: user?.name ?? order.shippingAddress?.name ?? '',
    orderNumber: order.orderNumber,
    orderUrl: `${env.frontendUrl}/account/orders/${order._id}`,
    orderDate: formatDate(order.createdAt, { withTime: true }),
    statusLabel,
    statusTone,
    items: (order.items ?? []).map((item) => ({
      name: item.name,
      variant: [item.color, item.size].filter(Boolean).join(' · '),
      quantity: item.quantity,
      unitPrice: item.price,
      lineTotal: item.lineTotal ?? item.price * item.quantity,
      image: item.image,
    })),
    totals: {
      subtotal: order.subtotal,
      discount: order.discount ?? 0,
      shippingFee: order.shippingFee ?? 0,
      tax: order.tax ?? 0,
      total: order.total,
    },
    payment: {
      methodLabel: METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod,
      statusLabel: payment.label,
      statusTone: payment.tone,
      // The provider's payment id is what a bank statement shows, so it is
      // safe and useful. The internal order _id never appears in an email body.
      reference: order.paymentMethod === PAYMENT_METHODS.ONLINE ? order.payment?.reference ?? '' : '',
      paidAt: formatDate(order.payment?.paidAt, { withTime: true }),
      amount: order.total,
    },
    shippingAddress: order.shippingAddress,
    shipment: {
      carrier: shipment.carrier ?? '',
      trackingNumber: shipment.trackingNumber ?? '',
      trackingUrl: shipment.trackingUrl ?? '',
      estimatedDelivery: formatDate(shipment.estimatedDelivery),
    },
    estimatedDelivery: formatDate(shipment.estimatedDelivery),
    cancellation: { reason: cancellationReason(order) },
    deliveredAt: formatDate(order.deliveredAt, { withTime: true }),
  };
}

async function loadOrder(orderOrId) {
  const id = orderOrId?._id ?? orderOrId;
  const order = await Order.findById(id).lean();
  if (!order) return { order: null, user: null };
  const user = await User.findById(order.user).select('name email').lean();
  return { order, user };
}

/** Builds and sends one order email. Resolves with the send outcome. */
async function sendOrderEmail(type, orderOrId, idempotencyKey, { force = false } = {}) {
  try {
    const { order, user } = await loadOrder(orderOrId);
    if (!order || !user?.email) {
      return { status: 'skipped', errorCategory: order ? 'no_recipient' : 'order_not_found' };
    }

    return await sendEmail({
      type,
      to: user.email,
      idempotencyKey,
      userId: user._id,
      orderId: order._id,
      force,
      render: () => renderTemplate(type, orderViewModel(order, user)),
    });
  } catch (error) {
    logger.error('Order email could not be prepared', { type, key: idempotencyKey, message: error?.message });
    return { status: 'failed', errorCategory: 'internal' };
  }
}

// ── Account ──────────────────────────────────────────────────────────────────

export async function notifyWelcome(user) {
  return sendEmail({
    type: EMAIL_TYPES.WELCOME,
    to: user.email,
    idempotencyKey: emailKeys.welcome(user._id ?? user.id),
    userId: user._id ?? user.id,
    render: () => renderTemplate(EMAIL_TYPES.WELCOME, { firstName: firstNameOf(user.name) }),
  });
}

/**
 * The reset link exists only in this call — only its hash is stored — so this
 * email cannot be rebuilt by the retry worker. It gets inline retries, and a
 * customer who never receives it simply asks again.
 */
export async function sendPasswordReset({ user, resetUrl, tokenHash, expiresInMinutes }) {
  return sendEmail({
    type: EMAIL_TYPES.PASSWORD_RESET,
    to: user.email,
    idempotencyKey: emailKeys.passwordReset(user._id, tokenHash),
    userId: user._id,
    retryable: false,
    render: () =>
      renderTemplate(EMAIL_TYPES.PASSWORD_RESET, {
        firstName: firstNameOf(user.name),
        resetUrl,
        expiresInMinutes,
      }),
  });
}

// ── Orders ───────────────────────────────────────────────────────────────────

export const notifyOrderConfirmed = (order) =>
  sendOrderEmail(EMAIL_TYPES.ORDER_CONFIRMATION, order, emailKeys.confirmation(order._id ?? order));

export const notifyPaymentSucceeded = (order) =>
  sendOrderEmail(EMAIL_TYPES.PAYMENT_SUCCESS, order, emailKeys.paymentSuccess(order._id ?? order));

export const notifyPaymentFailed = (order) =>
  sendOrderEmail(EMAIL_TYPES.PAYMENT_FAILED, order, emailKeys.paymentFailed(order._id ?? order));

/** The email for a status change, if that status has one. */
export async function notifyOrderStatus(order, status) {
  const type = STATUS_EMAIL[status];
  if (!type) return { status: 'none' };

  const orderId = order._id ?? order;
  // A confirmation is the same email whether it came from checkout, payment or
  // an admin — one key, so it can only ever go once.
  const key = type === EMAIL_TYPES.ORDER_CONFIRMATION
    ? emailKeys.confirmation(orderId)
    : emailKeys.status(orderId, status);

  return sendOrderEmail(type, order, key);
}

// ── Request-path helper ──────────────────────────────────────────────────────

/**
 * Waits for an email up to `ms`, then lets it finish in the background.
 *
 * Checkout wants to tell the customer whether their confirmation went out,
 * but must never be held hostage by a slow provider. Past the deadline the
 * caller gets `queued` and the send carries on — its outcome still lands in
 * the email log.
 */
export async function awaitEmail(promise, ms = 4000) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: 'queued' }), ms);
  });

  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// ── Retries ──────────────────────────────────────────────────────────────────

const PROGRESSION = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
];

const TYPE_STATUS = Object.fromEntries(Object.entries(STATUS_EMAIL).map(([status, type]) => [type, status]));

/**
 * True when a failed email is no longer worth sending because the order has
 * moved on — nobody wants "your order is being processed" after "delivered".
 */
function isSuperseded(event, order) {
  if (!order) return true;

  const eventStatus = TYPE_STATUS[event.type];
  const cancelled = order.orderStatus === ORDER_STATUS.CANCELLED;

  if (event.type === EMAIL_TYPES.PAYMENT_FAILED) {
    return order.paymentStatus === PAYMENT_STATUS.PAID || cancelled;
  }

  if (eventStatus && eventStatus !== ORDER_STATUS.CANCELLED) {
    if (cancelled) return true;
    // Anything later than the step the email announces makes it stale —
    // except the confirmation, which still works as a receipt.
    if (event.type !== EMAIL_TYPES.ORDER_CONFIRMATION) {
      return PROGRESSION.indexOf(order.orderStatus) > PROGRESSION.indexOf(eventStatus);
    }
  }

  return false;
}

/** Rebuilds a recorded email from the database and sends it again. */
async function resend(event, { force }) {
  if (!event.retryable) {
    return { status: 'not_retryable' };
  }

  if (event.type === EMAIL_TYPES.WELCOME) {
    const user = await User.findById(event.user).select('name email').lean();
    if (!user) return { status: 'skipped' };
    return sendEmail({
      type: event.type,
      to: user.email,
      idempotencyKey: event.idempotencyKey,
      userId: user._id,
      force,
      render: () => renderTemplate(EMAIL_TYPES.WELCOME, { firstName: firstNameOf(user.name) }),
    });
  }

  if (!event.order) return { status: 'not_retryable' };

  const { order } = await loadOrder(event.order);
  if (isSuperseded(event, order)) {
    await EmailEvent.updateOne(
      { _id: event._id, status: { $ne: 'sent' } },
      { $set: { status: 'skipped', nextAttemptAt: null, errorCategory: 'superseded', errorMessage: 'The order moved on before this could be delivered' } },
    );
    return { status: 'superseded' };
  }

  return sendOrderEmail(event.type, event.order, event.idempotencyKey, { force });
}

/** One pass of the retry worker: every failed email that is due, oldest first. */
export async function retryDueEmails({ limit = 20 } = {}) {
  const due = await EmailEvent.find({
    status: 'failed',
    retryable: true,
    attempts: { $lt: MAX_ATTEMPTS },
    nextAttemptAt: { $ne: null, $lte: new Date() },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(limit)
    .lean();

  const results = [];
  for (const event of due) {
    // Sequential on purpose: a provider that is struggling should not get a burst.
    results.push(await resend(event, { force: false }));
  }

  if (due.length) {
    logger.info('Email retry pass', {
      due: due.length,
      sent: results.filter((result) => result.status === 'sent').length,
    });
  }

  return results;
}

/** An admin asking for one specific email to go again. */
export async function retryEmailEvent(eventId) {
  const event = await EmailEvent.findById(eventId).lean();
  if (!event) return { status: 'not_found' };
  if (event.status === 'sent') return { status: 'duplicate' };
  return resend(event, { force: true });
}

/**
 * Starts the background retry loop. Overlapping passes are skipped, the timer
 * does not keep the process alive, and the returned function stops it.
 */
export function startEmailRetryWorker() {
  if (!env.email.retryWorker) return () => {};

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await retryDueEmails();
    } catch (error) {
      logger.error('Email retry pass failed', { message: error?.message });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, env.email.retryIntervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export default {
  emailKeys,
  notifyWelcome,
  sendPasswordReset,
  notifyOrderConfirmed,
  notifyPaymentSucceeded,
  notifyPaymentFailed,
  notifyOrderStatus,
  awaitEmail,
  retryDueEmails,
  retryEmailEvent,
  startEmailRetryWorker,
};
