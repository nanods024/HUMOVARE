import { env } from '../../config/env.js';
import { Order } from '../../models/Order.js';
import { PaymentAttempt } from '../../models/PaymentAttempt.js';
import { PaymentEvent } from '../../models/PaymentEvent.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import { releaseOrderStock } from '../stock.js';
import { storeSettings } from '../storeSettings.service.js';
import {
  notifyOrderConfirmed,
  notifyPaymentSucceeded,
  notifyPaymentFailed,
  awaitEmail,
} from '../email/notifications.js';
import * as phonepe from './phonepe.client.js';
import { verifyWebhookAuthorization, webhookEventName, WEBHOOK_EVENTS } from './phonepe.webhook.js';
import {
  ORDER_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  PAYMENT_ATTEMPT_STATUS as A,
  PAYMENT_GATEWAYS,
  PAYMENT_EVENT_TYPES as E,
} from '../../constants/index.js';

/**
 * Online payment, end to end.
 *
 *   checkout ──▶ startAttempt ──▶ PhonePe hosted checkout ──▶ customer pays
 *                                                    │
 *        webhook / return page / reconciler ─────────┘
 *                         │
 *                  checkAttempt  ── asks PhonePe's status API, every time
 *                         │
 *                  applyGatewayState ── one-way, compare-and-set updates
 *                         │
 *            PAID ──▶ order CONFIRMED ──▶ receipt + confirmation, once
 *
 * The rule the whole file follows: nothing a browser or a webhook *says*
 * changes money state. Only PhonePe's status API, called from here, does.
 *
 * Race safety without transactions (the database may be a standalone
 * MongoDB): every transition is a single `findOneAndUpdate` whose filter
 * names the state it is leaving. When two callers race — two webhooks, a
 * webhook and the return page — exactly one update matches, and only that
 * caller records the event and sends the email. Everyone else gets
 * "duplicate". The email layer's own idempotency keys are a second guard.
 */

const GATEWAY = PAYMENT_GATEWAYS.PHONEPE;
const PROVIDER = 'phonepe';
const OPEN = [A.CREATED, A.PENDING];
const PAID_LIKE = [PAYMENT_STATUS.PAID];

/** How often a status check may hit PhonePe for one attempt. */
const CHECK_THROTTLE_MS = 4000;
/** A CREATED attempt that never got a checkout link (the server stopped mid-request). */
const STUCK_CREATE_MS = 5 * 60 * 1000;

const toPaise = (rupees) => Math.round(Number(rupees) * 100);

// ── Availability ─────────────────────────────────────────────────────────────

export function isOnlinePaymentAvailable() {
  if (!env.phonepe.isConfigured) return false;
  // Production payment links must come back over https.
  if (env.isProd && !/^https:\/\//.test(env.frontendUrl)) return false;
  return true;
}

/**
 * Whether checkout may take NEW online orders: PhonePe is configured and the
 * store has not switched online payment off in Settings. Orders already
 * waiting for a payment keep using isOnlinePaymentAvailable, so switching it
 * off never strands a customer mid-payment or stops verification.
 */
export function isOnlineCheckoutOpen() {
  return isOnlinePaymentAvailable() && storeSettings().shipping.onlineEnabled !== false;
}

export function onlineMethodInfo() {
  return {
    method: PAYMENT_METHODS.ONLINE,
    label: 'PhonePe — UPI, cards, net banking',
    enabled: isOnlineCheckoutOpen(),
    provider: isOnlineCheckoutOpen() ? PROVIDER : null,
    // A sandbox payment moves no real money; the checkout says so.
    testMode: env.phonepe.env === 'sandbox',
  };
}

// ── Audit trail ──────────────────────────────────────────────────────────────

async function recordEvent(fields) {
  try {
    await PaymentEvent.create({ gateway: GATEWAY, ...fields, detail: String(fields.detail ?? '').slice(0, 300) });
  } catch (error) {
    // The audit trail must never be the reason a payment fails.
    logger.error('Payment event could not be recorded', { type: fields.type, message: error?.message });
  }
}

export async function ensurePaymentIndexes() {
  await Promise.all([PaymentAttempt.createIndexes(), PaymentEvent.createIndexes()]);
}

// ── Starting a payment ───────────────────────────────────────────────────────

function returnUrlFor(order) {
  // Only the order id — the page asks the API for the verified outcome.
  return `${env.frontendUrl}/payment/status?order=${order._id}`;
}

function publicAttempt(attempt) {
  return {
    attemptId: String(attempt._id),
    attemptNumber: attempt.attemptNumber,
    attemptStatus: attempt.status,
    expireAt: attempt.expireAt,
  };
}

/**
 * Opens a new attempt for an unpaid order and gets a PhonePe checkout link.
 *
 * The amount is the order's own server-side total, converted to paise here —
 * the request body never carries one.
 */
export async function startAttempt(order, { source }) {
  if (!isOnlinePaymentAvailable()) {
    throw new ApiError(503, 'Online payment is not available right now. Please choose Cash on Delivery.');
  }

  const now = Date.now();
  const windowEnds = order.payment?.expiresAt ? new Date(order.payment.expiresAt).getTime() : now + env.payment.windowMinutes * 60000;
  if (windowEnds - now < 60 * 1000) {
    throw ApiError.conflict('The time to pay for this order has run out. Please place the order again.');
  }

  const amount = toPaise(order.total);
  if (!Number.isInteger(amount) || amount < 100) {
    throw ApiError.badRequest('This order total cannot be paid online.');
  }

  const expireAfter = Math.min(Math.max(Math.min(env.phonepe.attemptExpirySeconds, Math.floor((windowEnds - now) / 1000)), 300), 3600);
  const attemptNumber = (await PaymentAttempt.countDocuments({ order: order._id })) + 1;

  let attempt;
  try {
    attempt = await PaymentAttempt.create({
      order: order._id,
      user: order.user,
      gateway: GATEWAY,
      attemptNumber,
      merchantOrderId: `${order.orderNumber}-P${attemptNumber}`,
      amount,
      currency: order.currency || 'INR',
      status: A.CREATED,
      active: true,
    });
  } catch (error) {
    if (error?.code === 11000) {
      // Another request for this order won the race (a double click). Hand
      // back its link rather than opening a second payment.
      const open = await PaymentAttempt.findOne({ order: order._id, active: true });
      if (open?.redirectUrl && open.status === A.PENDING) {
        return { ...publicAttempt(open), redirectUrl: open.redirectUrl, reused: true };
      }
      throw ApiError.conflict('Your payment is already being set up. Please wait a moment and try again.');
    }
    throw error;
  }

  await Order.updateOne(
    { _id: order._id },
    {
      $set: { 'payment.provider': PROVIDER, 'payment.lastAttemptAt': new Date() },
      $inc: { 'payment.attempts': 1 },
    },
  );

  try {
    const created = await phonepe.createPayment({
      merchantOrderId: attempt.merchantOrderId,
      amount,
      expireAfter,
      redirectUrl: returnUrlFor(order),
      message: `HUMOVARE order ${order.orderNumber}`,
      udf: { udf1: order.orderNumber, udf2: String(attempt.attemptNumber) },
    });

    attempt = await PaymentAttempt.findOneAndUpdate(
      { _id: attempt._id, status: A.CREATED },
      {
        $set: {
          status: A.PENDING,
          gatewayOrderId: created.gatewayOrderId,
          redirectUrl: created.redirectUrl,
          // Whichever is sooner: PhonePe's expiry, or the one we asked for
          // (the sandbox has been seen to report a much later one).
          expireAt: new Date(Math.min(created.expireAt?.getTime() ?? Infinity, now + expireAfter * 1000)),
        },
      },
      { new: true },
    );

    await recordEvent({
      order: order._id,
      attempt: attempt._id,
      type: E.PAYMENT_CREATED,
      source,
      gatewayReference: attempt.merchantOrderId,
      status: A.PENDING,
      amount,
      detail: `Attempt ${attempt.attemptNumber}; checkout link valid until ${attempt.expireAt?.toISOString?.() ?? ''}`,
    });

    return { ...publicAttempt(attempt), redirectUrl: attempt.redirectUrl, reused: false };
  } catch (error) {
    // No usable checkout link reached the customer, so nothing can be paid on
    // this attempt. Close it; the customer can start another.
    await PaymentAttempt.updateOne(
      { _id: attempt._id, status: A.CREATED },
      {
        $set: { status: A.FAILED, errorCode: error.code || error.kind || 'CREATE_FAILED', finalizedAt: new Date() },
        $unset: { active: 1 },
      },
    );
    await recordEvent({
      order: order._id,
      attempt: attempt._id,
      type: E.PAYMENT_CREATE_FAILED,
      source,
      gatewayReference: attempt.merchantOrderId,
      status: A.FAILED,
      amount,
      detail: error instanceof phonepe.PhonePeError ? `${error.kind} ${error.status || ''} ${error.code || ''}`.trim() : 'internal',
    });

    if (error instanceof phonepe.PhonePeError) {
      logger.warn('PhonePe checkout could not be created', { order: order.orderNumber, kind: error.kind, status: error.status, code: error.code });
      throw new ApiError(502, 'PhonePe is not responding right now. Your order is saved — please try the payment again in a moment.');
    }
    throw error;
  }
}

// ── Reading the truth from PhonePe ───────────────────────────────────────────

/**
 * Asks PhonePe where one attempt stands and applies the answer.
 * Gateway errors are returned, not thrown: a status check that cannot reach
 * PhonePe leaves everything exactly as it was.
 */
export async function checkAttempt(attemptOrId, { source, recheckClosed = false }) {
  // (An ObjectId also has an `_id` getter, so test for a real field.)
  const attempt = attemptOrId?.merchantOrderId ? attemptOrId : await PaymentAttempt.findById(attemptOrId);
  if (!attempt) return { status: 'not_found' };

  if (attempt.status === A.PAID) return { status: 'final', attemptStatus: attempt.status };
  // A closed attempt is only re-asked when PhonePe itself says something
  // happened to it (a webhook) — that is how a late payment is caught.
  if (!OPEN.includes(attempt.status) && !recheckClosed) return { status: 'final', attemptStatus: attempt.status };

  if (attempt.status === A.CREATED && !attempt.gatewayOrderId) {
    if (Date.now() - new Date(attempt.createdAt).getTime() > STUCK_CREATE_MS) {
      return markFailed(attempt, { state: 'FAILED', errorCode: 'CREATE_INCOMPLETE' }, { source });
    }
    return { status: 'pending' };
  }

  await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { lastCheckedAt: new Date() }, $inc: { checks: 1 } });

  let gateway;
  try {
    gateway = await phonepe.getOrderStatus(attempt.merchantOrderId);
  } catch (error) {
    if (error instanceof phonepe.PhonePeError) {
      // PhonePe has no record of an order we created long ago: it can never be paid.
      if (error.status === 404 && attempt.expireAt && attempt.expireAt < new Date()) {
        return markFailed(attempt, { state: 'FAILED', errorCode: 'NOT_FOUND' }, { source });
      }
      return { status: 'unverified', reason: error.kind };
    }
    throw error;
  }

  return applyGatewayState(attempt, gateway, { source });
}

async function applyGatewayState(attempt, gateway, { source }) {
  // The amount PhonePe says it holds must be exactly the amount we asked for.
  // A completed payment that reports no amount cannot be checked, so it is
  // held for review rather than accepted.
  const amountUnknown = gateway.amount === null && gateway.state === 'COMPLETED';
  if (amountUnknown || (gateway.amount !== null && gateway.amount !== attempt.amount)) {
    await PaymentAttempt.updateOne(
      { _id: attempt._id },
      { $set: { needsReview: true, reviewReason: `Gateway amount ${gateway.amount} ≠ expected ${attempt.amount}` } },
    );
    await Order.updateOne({ _id: attempt.order }, { $set: { 'payment.needsReview': true } });
    await recordEvent({
      order: attempt.order,
      attempt: attempt._id,
      type: E.PAYMENT_AMOUNT_MISMATCH,
      source,
      gatewayReference: attempt.merchantOrderId,
      status: gateway.state,
      amount: gateway.amount,
      detail: `Expected ${attempt.amount} paise`,
    });
    logger.error('PhonePe amount mismatch — payment not accepted', { reference: attempt.merchantOrderId, expected: attempt.amount, reported: gateway.amount });
    return { status: 'mismatch' };
  }

  if (gateway.state === 'COMPLETED') return markPaid(attempt, gateway, { source });
  if (!OPEN.includes(attempt.status)) return { status: 'final', attemptStatus: attempt.status };
  if (gateway.state === 'FAILED') return markFailed(attempt, gateway, { source });

  if (attempt.status === A.CREATED) {
    await PaymentAttempt.updateOne({ _id: attempt._id, status: A.CREATED }, { $set: { status: A.PENDING } });
  }
  return { status: 'pending' };
}

async function markPaid(attempt, gateway, { source }) {
  const now = new Date();
  const p = gateway.payment ?? {};

  // Any not-yet-paid state may become PAID: if PhonePe has the money, that is
  // the truth, even for an attempt we had given up on.
  const won = await PaymentAttempt.findOneAndUpdate(
    { _id: attempt._id, status: { $ne: A.PAID } },
    {
      $set: {
        status: A.PAID,
        gatewayOrderId: gateway.gatewayOrderId || attempt.gatewayOrderId,
        transactionId: p.transactionId || '',
        paymentMode: p.paymentMode || '',
        finalizedAt: now,
        errorCode: '',
        detailedErrorCode: '',
      },
      $unset: { active: 1 },
    },
    { new: true },
  );
  if (!won) {
    // Someone else marked the attempt paid. If their order update never
    // happened (the process died in between), finish it — it is idempotent.
    const already = await PaymentAttempt.findById(attempt._id);
    if (already?.status === A.PAID) {
      const result = await settleOrderForPaidAttempt(already, { source });
      if (result.status !== 'already_settled') return result;
    }
    return { status: 'duplicate' };
  }

  await recordEvent({
    order: won.order,
    attempt: won._id,
    type: E.PAYMENT_SUCCESS,
    source,
    gatewayReference: won.merchantOrderId,
    status: 'COMPLETED',
    amount: won.amount,
    detail: [p.paymentMode, p.transactionId && `txn ${p.transactionId}`].filter(Boolean).join(' · '),
  });

  return settleOrderForPaidAttempt(won, { source, wasGivenUp: !OPEN.includes(attempt.status) });
}

/**
 * The order half of a successful payment: confirm it, or — if the order was
 * no longer waiting — flag it for review. Safe to run more than once for the
 * same attempt (the email keys and the order filters make repeats no-ops),
 * which is what lets the reconciler repair an interrupted update.
 */
export async function settleOrderForPaidAttempt(won, { source, wasGivenUp = false }) {
  const now = new Date();
  const paid = {
    paymentStatus: PAYMENT_STATUS.PAID,
    'payment.provider': PROVIDER,
    'payment.reference': won.merchantOrderId,
    'payment.gatewayOrderId': won.gatewayOrderId,
    'payment.transactionId': won.transactionId,
    'payment.paymentMode': won.paymentMode,
    'payment.amountPaid': won.amount,
    'payment.paidAt': now,
  };

  // The normal case: an unpaid order waiting for this payment.
  const confirmed = await Order.findOneAndUpdate(
    { _id: won.order, orderStatus: ORDER_STATUS.PENDING, paymentStatus: { $ne: PAYMENT_STATUS.PAID } },
    {
      $set: { ...paid, orderStatus: ORDER_STATUS.CONFIRMED },
      $push: { statusHistory: { status: ORDER_STATUS.CONFIRMED, note: 'Payment received via PhonePe', at: now } },
    },
    { new: true },
  );

  if (confirmed) {
    // Nothing else on this order should still be payable.
    await closeOpenAttempts(confirmed._id, source);
    const [receipt, confirmation] = await Promise.all([
      awaitEmail(notifyPaymentSucceeded(confirmed._id)),
      awaitEmail(notifyOrderConfirmed(confirmed._id)),
    ]);
    return { status: 'paid', order: confirmed, emails: { receipt, confirmation } };
  }

  // Money arrived for an order that is no longer waiting for it: already
  // paid by another attempt, or cancelled while the customer was paying.
  // Never lose the fact that the customer paid — record it, flag it for a
  // decision, and send them a receipt so they are not left guessing.
  const current = await Order.findById(won.order);
  if (current?.payment?.reference === won.merchantOrderId && PAID_LIKE.includes(current.paymentStatus)) {
    return { status: 'already_settled' };
  }
  const reason = current?.paymentStatus === PAYMENT_STATUS.PAID
    ? 'A second payment succeeded on an order that was already paid — contact the customer.'
    : `Payment succeeded after the order was ${String(current?.orderStatus ?? 'closed').toLowerCase()} — contact the customer or reinstate it.`;

  await PaymentAttempt.updateOne({ _id: won._id }, { $set: { needsReview: true, reviewReason: reason } });
  if (current && current.paymentStatus !== PAYMENT_STATUS.PAID) {
    await Order.updateOne({ _id: current._id, paymentStatus: { $ne: PAYMENT_STATUS.PAID } }, { $set: { ...paid, 'payment.needsReview': true } });
  } else if (current) {
    await Order.updateOne({ _id: current._id }, { $set: { 'payment.needsReview': true } });
  }
  await recordEvent({
    order: won.order,
    attempt: won._id,
    type: E.PAYMENT_LATE_SUCCESS,
    source,
    gatewayReference: won.merchantOrderId,
    status: 'COMPLETED',
    amount: won.amount,
    detail: reason,
  });
  logger.warn('Payment needs review', { reference: won.merchantOrderId, wasGivenUp, reason });

  const receipt = await awaitEmail(notifyPaymentSucceeded(won.order));
  return { status: 'paid_needs_review', emails: { receipt } };
}

async function markFailed(attempt, gateway, { source }) {
  const expired = attempt.expireAt && attempt.expireAt < new Date();
  const final = expired && !gateway.errorCode ? A.EXPIRED : A.FAILED;

  const won = await PaymentAttempt.findOneAndUpdate(
    { _id: attempt._id, status: { $in: OPEN } },
    {
      $set: {
        status: final,
        errorCode: gateway.errorCode || gateway.payment?.errorCode || '',
        detailedErrorCode: gateway.detailedErrorCode || gateway.payment?.detailedErrorCode || '',
        finalizedAt: new Date(),
      },
      $unset: { active: 1 },
    },
    { new: true },
  );
  if (!won) return { status: 'duplicate' };

  await recordEvent({
    order: won.order,
    attempt: won._id,
    type: final === A.EXPIRED ? E.PAYMENT_EXPIRED : E.PAYMENT_FAILED,
    source,
    gatewayReference: won.merchantOrderId,
    status: 'FAILED',
    amount: won.amount,
    detail: [won.errorCode, won.detailedErrorCode].filter(Boolean).join(' / '),
  });

  // The order stays open for a retry; only its payment state records the failure.
  const order = await Order.findOneAndUpdate(
    { _id: won.order, orderStatus: ORDER_STATUS.PENDING, paymentStatus: PAYMENT_STATUS.PENDING },
    { $set: { paymentStatus: PAYMENT_STATUS.FAILED } },
    { new: true },
  );

  // Once per order (the email key is per order, not per attempt).
  if (order) void notifyPaymentFailed(order._id);
  return { status: 'failed', attemptStatus: final };
}

// ── Customer-facing operations ───────────────────────────────────────────────

async function ownedOnlineOrder(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.paymentMethod !== PAYMENT_METHODS.ONLINE) {
    throw ApiError.conflict('This order is Cash on Delivery — there is nothing to pay online.');
  }
  return order;
}

/**
 * "Retry payment" / "Complete payment". Reuses a still-valid checkout link
 * instead of opening a second payment, and checks with PhonePe first so an
 * attempt that was actually paid is never reopened.
 */
export async function retryPayment(userId, orderId) {
  const order = await ownedOnlineOrder(userId, orderId);

  if (order.paymentStatus === PAYMENT_STATUS.PAID) return { status: 'paid' };
  if (order.orderStatus !== ORDER_STATUS.PENDING) {
    throw ApiError.conflict('This order can no longer be paid. Please place a new order.');
  }

  const open = await PaymentAttempt.findOne({ order: order._id, active: true });
  if (open) {
    const result = await checkAttempt(open, { source: 'retry' });
    if (result.status === 'paid' || result.status === 'duplicate') {
      const fresh = await Order.findById(order._id).lean();
      if (fresh?.paymentStatus === PAYMENT_STATUS.PAID) return { status: 'paid' };
    }
    const still = await PaymentAttempt.findById(open._id);
    if (still && OPEN.includes(still.status)) {
      const usable = still.redirectUrl && still.expireAt && still.expireAt.getTime() - Date.now() > 60 * 1000;
      if (usable) return { status: 'redirect', ...publicAttempt(still), redirectUrl: still.redirectUrl, reused: true };
      throw ApiError.conflict('PhonePe is still processing your last payment. Please check again in a minute before paying again.');
    }
  }

  // A fresh attempt: the order's payment is live again.
  await Order.updateOne(
    { _id: order._id, paymentStatus: PAYMENT_STATUS.FAILED },
    { $set: { paymentStatus: PAYMENT_STATUS.PENDING } },
  );
  const attempt = await startAttempt(order, { source: 'retry' });
  return { status: 'redirect', ...attempt };
}

/**
 * The verified payment state, for the return page and the order page.
 * If an attempt is still open, PhonePe is asked (at most every few seconds)
 * before answering — the page never decides anything itself.
 */
export async function getPaymentStatus(userId, orderId) {
  let order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) throw ApiError.notFound('Order not found');

  if (order.paymentMethod === PAYMENT_METHODS.ONLINE && order.orderStatus === ORDER_STATUS.PENDING) {
    const open = await PaymentAttempt.findOne({ order: order._id, active: true });
    const due = open && (!open.lastCheckedAt || Date.now() - open.lastCheckedAt.getTime() > CHECK_THROTTLE_MS);
    if (due && isOnlinePaymentAvailable()) {
      await checkAttempt(open, { source: 'status_check' });
      order = await Order.findById(order._id).lean();
    }
  }

  return paymentView(order, await PaymentAttempt.findOne({ order: order._id }).sort({ attemptNumber: -1 }).lean());
}

function paymentView(order, latest) {
  const paidLike = [PAYMENT_STATUS.PAID];
  const isPaid = paidLike.includes(order.paymentStatus);

  let state = 'PENDING';
  if (order.paymentMethod === PAYMENT_METHODS.COD) state = 'COD';
  else if (isPaid) state = 'PAID';
  else if (order.orderStatus === ORDER_STATUS.CANCELLED) state = 'CANCELLED';
  else if (order.paymentStatus === PAYMENT_STATUS.FAILED) state = 'FAILED';

  const windowOpen = !order.payment?.expiresAt || new Date(order.payment.expiresAt).getTime() - Date.now() > 60 * 1000;
  const canRetry = order.paymentMethod === PAYMENT_METHODS.ONLINE
    && order.orderStatus === ORDER_STATUS.PENDING
    && !isPaid
    && windowOpen
    && isOnlinePaymentAvailable();

  return {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    state,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    paymentMethod: order.paymentMethod,
    amount: order.total,
    currency: order.currency,
    paidAt: order.payment?.paidAt ?? null,
    expiresAt: order.payment?.expiresAt ?? null,
    canRetry,
    attempt: latest ? {
      attemptNumber: latest.attemptNumber,
      status: latest.status,
      expireAt: latest.expireAt,
      paymentMode: latest.paymentMode || '',
    } : null,
  };
}

/**
 * Customer cancelling an unpaid online order. Checks with PhonePe first: if
 * the customer paid in another tab, the order is confirmed instead.
 */
export async function prepareCustomerCancel(order) {
  if (order.paymentMethod !== PAYMENT_METHODS.ONLINE) return;

  if (order.paymentStatus === PAYMENT_STATUS.PAID) {
    throw ApiError.conflict(
      `This order has been paid online. To cancel it, please contact ${env.email.supportEmail}.`,
    );
  }

  const open = await PaymentAttempt.findOne({ order: order._id, active: true });
  if (!open) return;

  const result = await checkAttempt(open, { source: 'customer_cancel' });
  if (result.status === 'paid') {
    throw ApiError.conflict('Your payment has just gone through, so this order is confirmed. Contact support if you still want to cancel.');
  }
  if (result.status === 'unverified') {
    throw new ApiError(503, 'We could not confirm your payment status with PhonePe. Please try again in a minute.');
  }
  await closeOpenAttempts(order._id, 'customer_cancel');
}

/** Marks any still-open attempt CANCELLED (e.g. when the order is cancelled). */
export async function closeOpenAttempts(orderId, source) {
  const open = await PaymentAttempt.find({ order: orderId, active: true });
  for (const attempt of open) {
    const won = await PaymentAttempt.findOneAndUpdate(
      { _id: attempt._id, status: { $in: OPEN } },
      { $set: { status: A.CANCELLED, finalizedAt: new Date() }, $unset: { active: 1 } },
    );
    if (won) {
      await recordEvent({
        order: orderId,
        attempt: attempt._id,
        type: E.PAYMENT_FAILED,
        source,
        gatewayReference: attempt.merchantOrderId,
        status: A.CANCELLED,
        amount: attempt.amount,
        detail: 'Order cancelled before payment completed',
      });
    }
  }
}

// ── Webhook ──────────────────────────────────────────────────────────────────

/** In-flight webhook follow-ups, so tests (and shutdown) can wait for them. */
const pendingWork = new Set();

function inBackground(label, fn) {
  const job = Promise.resolve()
    .then(fn)
    .catch((error) => logger.error('Webhook follow-up failed; the reconciler will retry', { label, message: error?.message }))
    .finally(() => pendingWork.delete(job));
  pendingWork.add(job);
}

export async function drainWebhookWork() {
  while (pendingWork.size) await Promise.allSettled([...pendingWork]);
}

/**
 * Handles one PhonePe webhook. Authentication, shape, reference and amount
 * are checked before answering, so a bad request gets a clear status code.
 * The payment itself is then re-verified with PhonePe's status API in the
 * background — PhonePe expects an answer within a few seconds.
 *
 * @returns {{ statusCode: number, body: object }}
 */
export async function handleWebhook({ authorization, body }) {
  if (!env.phonepe.isConfigured || !env.phonepe.webhookConfigured) {
    return { statusCode: 503, body: { success: false, message: 'Webhook not configured' } };
  }

  if (!verifyWebhookAuthorization(authorization)) {
    await recordEvent({ type: E.WEBHOOK_REJECTED, source: 'webhook', detail: 'Authorization header did not match' });
    logger.warn('PhonePe webhook refused: bad authorization');
    return { statusCode: 401, body: { success: false, message: 'Unauthorized' } };
  }

  const event = webhookEventName(body);
  const payload = body?.payload;
  const malformed = !event || !payload || typeof payload !== 'object' || Array.isArray(payload)
    || typeof payload.state !== 'string'
    || (payload.amount !== undefined && !Number.isInteger(payload.amount));
  if (malformed) {
    await recordEvent({ type: E.WEBHOOK_REJECTED, source: 'webhook', detail: 'Malformed payload' });
    return { statusCode: 400, body: { success: false, message: 'Malformed payload' } };
  }

  if (event === WEBHOOK_EVENTS.ORDER_COMPLETED || event === WEBHOOK_EVENTS.ORDER_FAILED) {
    const reference = typeof payload.merchantOrderId === 'string' ? payload.merchantOrderId : '';
    const attempt = reference ? await PaymentAttempt.findOne({ merchantOrderId: reference }) : null;
    if (!attempt) {
      await recordEvent({ type: E.WEBHOOK_REJECTED, source: 'webhook', gatewayReference: reference.slice(0, 80), detail: 'Unknown payment reference' });
      return { statusCode: 404, body: { success: false, message: 'Unknown payment reference' } };
    }
    if (Number.isInteger(payload.amount) && payload.amount !== attempt.amount) {
      await recordEvent({
        order: attempt.order,
        attempt: attempt._id,
        type: E.WEBHOOK_REJECTED,
        source: 'webhook',
        gatewayReference: reference,
        status: payload.state,
        amount: payload.amount,
        detail: `Amount mismatch: expected ${attempt.amount}`,
      });
      return { statusCode: 400, body: { success: false, message: 'Amount does not match' } };
    }

    await recordEvent({
      order: attempt.order,
      attempt: attempt._id,
      type: E.WEBHOOK_RECEIVED,
      source: 'webhook',
      gatewayReference: reference,
      status: String(payload.state).slice(0, 20),
      amount: Number.isInteger(payload.amount) ? payload.amount : null,
      detail: event,
    });

    // The webhook's own "state" is not trusted: ask PhonePe.
    inBackground(reference, () => checkAttempt(attempt._id, { source: 'webhook', recheckClosed: true }));
    return { statusCode: 200, body: { success: true } };
  }

  // A documented event we do not act on. Acknowledge it
  // so PhonePe does not keep retrying.
  return { statusCode: 200, body: { success: true, ignored: true } };
}

// ── Admin views ──────────────────────────────────────────────────────────────

export async function adminPaymentDetails(orderId) {
  const order = await Order.findById(orderId).select('_id').lean();
  if (!order) throw ApiError.notFound('Order not found');

  const [attempts, events] = await Promise.all([
    // The checkout link is the customer's; the admin never needs it.
    PaymentAttempt.find({ order: orderId }).select('-redirectUrl -active').sort({ attemptNumber: 1 }).lean(),
    PaymentEvent.find({ order: orderId }).sort({ createdAt: 1 }).limit(200).lean(),
  ]);

  return { gateway: GATEWAY, environment: env.phonepe.env || 'unconfigured', attempts, events };
}

/** "Check with PhonePe" from the admin portal: every open attempt. */
export async function adminVerify(orderId) {
  const order = await Order.findById(orderId).select('_id').lean();
  if (!order) throw ApiError.notFound('Order not found');
  if (!isOnlinePaymentAvailable()) throw new ApiError(503, 'PhonePe is not configured on this server.');

  const results = [];
  for (const attempt of await PaymentAttempt.find({ order: orderId, status: { $in: OPEN } })) {
    results.push({ reference: attempt.merchantOrderId, ...(await checkAttempt(attempt, { source: 'admin' })) });
  }
  return { results };
}

// ── Reconciler ───────────────────────────────────────────────────────────────

/**
 * Settles what webhooks may have missed:
 *   1. open attempts → ask PhonePe;
 *   2. unpaid online orders past their window with nothing open → cancel and
 *      put the stock back (every attempt is already verified final).
 */
export async function reconcilePayments({ now = new Date(), limit = 50 } = {}) {
  const summary = { checked: 0, paid: 0, failed: 0, expiredOrders: 0 };
  if (!isOnlinePaymentAvailable()) return summary;

  const recheckBefore = new Date(now.getTime() - 60 * 1000);
  const open = await PaymentAttempt.find({
    active: true,
    createdAt: { $lt: new Date(now.getTime() - 60 * 1000) },
    $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lt: recheckBefore } }],
  }).limit(limit);

  for (const attempt of open) {
    const result = await checkAttempt(attempt, { source: 'reconciler' });
    summary.checked += 1;
    if (result.status === 'paid' || result.status === 'paid_needs_review') summary.paid += 1;
    if (result.status === 'failed') summary.failed += 1;
  }

  // Repair: an attempt marked PAID whose order update never landed.
  const paidRecently = await PaymentAttempt.find({
    status: A.PAID,
    needsReview: { $ne: true },
    finalizedAt: { $lt: new Date(now.getTime() - 60 * 1000), $gt: new Date(now.getTime() - 7 * 86400000) },
  }).select('order merchantOrderId amount gatewayOrderId transactionId paymentMode').limit(limit * 4);
  if (paidRecently.length) {
    const unsettled = new Set((await Order.find({
      _id: { $in: paidRecently.map((attempt) => attempt.order) },
      paymentStatus: { $nin: PAID_LIKE },
    }).select('_id').lean()).map((order) => String(order._id)));
    for (const attempt of paidRecently.filter((item) => unsettled.has(String(item.order)))) {
      await settleOrderForPaidAttempt(attempt, { source: 'reconciler' });
      summary.repaired = (summary.repaired ?? 0) + 1;
    }
  }

  const overdue = await Order.find({
    paymentMethod: PAYMENT_METHODS.ONLINE,
    orderStatus: ORDER_STATUS.PENDING,
    paymentStatus: { $in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED] },
    'payment.expiresAt': { $lt: now },
  }).limit(limit);

  for (const order of overdue) {
    // Still open at PhonePe: wait for a final answer before giving up.
    if (await PaymentAttempt.exists({ order: order._id, active: true })) continue;

    const cancelled = await Order.findOneAndUpdate(
      {
        _id: order._id,
        orderStatus: ORDER_STATUS.PENDING,
        paymentStatus: { $in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED] },
      },
      {
        $set: { orderStatus: ORDER_STATUS.CANCELLED, paymentStatus: PAYMENT_STATUS.CANCELLED, cancelledAt: now },
        $push: { statusHistory: { status: ORDER_STATUS.CANCELLED, note: 'Payment was not completed in time', at: now } },
      },
      { new: true },
    );
    if (!cancelled) continue;

    await releaseOrderStock(cancelled);
    await recordEvent({ order: cancelled._id, type: E.ORDER_PAYMENT_EXPIRED, source: 'reconciler', status: PAYMENT_STATUS.CANCELLED, amount: toPaise(cancelled.total), detail: 'Unpaid past the payment window; stock released' });
    summary.expiredOrders += 1;
  }

  return summary;
}

export function startPaymentReconciler() {
  if (!env.payment.reconciler || !isOnlinePaymentAvailable()) return () => {};

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const summary = await reconcilePayments();
      if (summary.checked || summary.expiredOrders || summary.repaired) logger.info('Payments reconciled', summary);
    } catch (error) {
      logger.error('Payment reconciliation failed', { message: error?.message });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, env.payment.reconcileIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
