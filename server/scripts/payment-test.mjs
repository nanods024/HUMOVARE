/**
 * PhonePe payment integration test.
 *
 *   npm run test:payments --workspace server
 *
 * Boots the real API on an in-memory MongoDB with the real PhonePe client,
 * whose network calls go to an in-process test double of PhonePe's documented API (tests only)
 * (script./lib/phonepe-test-double.mjs). Webhooks are sent over real HTTP with the
 * real Authorization scheme. Nothing touches PhonePe or Resend.
 *
 * Every log line is captured so the suite can prove the client secret and
 * access tokens are never logged.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'node:crypto';
import { createPhonePeTestDouble, webhookAuthorization } from './lib/phonepe-test-double.mjs';

// ── Log capture ──────────────────────────────────────────────────────────────
const logged = [];
for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[method].bind(console);
  console[method] = (...args) => {
    logged.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    if (typeof args[0] === 'string' && /^\s+(PASS|FAIL)|^──|^=+|^PASSED|^Failures|^\s+-/.test(args[0])) original(...args);
  };
}

let pass = 0;
let fail = 0;
const failures = [];
function check(name, condition, extra = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    failures.push(`${name} ${extra}`);
    console.log(`  FAIL  ${name} ${extra}`);
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Environment ──────────────────────────────────────────────────────────────
const CLIENT_ID = 'TEST-HUMOVARE-CLIENT';
const CLIENT_SECRET = `sk_test_${crypto.randomBytes(16).toString('hex')}`;
const WEBHOOK_USER = 'humovare-webhook';
const WEBHOOK_PASS = crypto.randomBytes(12).toString('hex');

const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGODB_URI: mongo.getUri('humovare'),
  JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
  CLIENT_URL: 'http://localhost:5173',
  ADMIN_URL: 'http://localhost:5174',
  FRONTEND_URL: 'https://humovare.in',
  EMAIL_TRANSPORT: 'memory',
  EMAIL_RETRY_WORKER: 'false',
  RESEND_FROM_EMAIL: 'noreply@humovare.in',
  RESEND_FROM_NAME: 'HUMOVARE',
  RESEND_REPLY_TO: 'support@humovare.in',
  DISABLE_RATE_LIMIT: 'true',
  LOG_LEVEL: 'debug',
  SEED_SUPER_ADMIN_EMAIL: 'owner@humovare.test',
  SEED_SUPER_ADMIN_PASSWORD: 'Humovare@Admin2025',
  PHONEPE_ENV: 'sandbox',
  PHONEPE_CLIENT_ID: CLIENT_ID,
  PHONEPE_CLIENT_SECRET: CLIENT_SECRET,
  PHONEPE_CLIENT_VERSION: '1',
  PHONEPE_WEBHOOK_USERNAME: WEBHOOK_USER,
  PHONEPE_WEBHOOK_PASSWORD: WEBHOOK_PASS,
  PHONEPE_TIMEOUT_MS: '400',
  PAYMENT_RECONCILER: 'false',
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
await connectDB({ autoIndex: false });
const { seedDatabase } = await import('../src/seed/seed.js');
await seedDatabase({ fresh: true });

const { setPhonePeFetch } = await import('../src/services/payments/phonepe.client.js');
const payments = await import('../src/services/payments/onlinePayment.service.js');
await payments.ensurePaymentIndexes();
const { memoryTransport } = await import('../src/services/email/transport.js');
const { Order } = await import('../src/models/Order.js');
const { Product } = await import('../src/models/Product.js');
const { PaymentAttempt } = await import('../src/models/PaymentAttempt.js');
const { PaymentEvent } = await import('../src/models/PaymentEvent.js');
const { EmailEvent } = await import('../src/models/EmailEvent.js');
// Registered for its side effect: populated refs need the model.
await import('../src/models/AdminUser.js');
const { createApp } = await import('../src/app.js');

const fake = createPhonePeTestDouble({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
setPhonePeFetch(fake.fetch);

const server = await new Promise((resolve) => {
  const s = createApp().listen(5499, () => resolve(s));
});
const BASE = 'http://127.0.0.1:5499';
const responses = []; // every API response body, checked for leaks at the end

// ── Helpers ──────────────────────────────────────────────────────────────────
async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  responses.push(text);
  let json = {};
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json };
}

const AUTH = webhookAuthorization(WEBHOOK_USER, WEBHOOK_PASS);
async function webhook(body, authorization = AUTH) {
  const headers = { 'Content-Type': 'application/json' };
  if (authorization !== null) headers.Authorization = authorization;
  const res = await fetch(`${BASE}/api/payments/phonepe/webhook`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  responses.push(text);
  return { status: res.status, json: (() => { try { return JSON.parse(text); } catch { return {}; } })() };
}

const orderWebhook = (attempt, state = 'COMPLETED', extra = {}) => ({
  event: state === 'COMPLETED' ? 'checkout.order.completed' : 'checkout.order.failed',
  payload: {
    orderId: fake.orders.get(attempt)?.orderId,
    merchantId: 'HUMOVARETEST',
    merchantOrderId: attempt,
    state,
    amount: fake.orders.get(attempt)?.amount,
    expireAt: Date.now() + 600000,
    ...extra,
  },
});

let adminCookies = '';
let csrfToken = '';
async function adminApi(method, path, body, session = null) {
  const headers = { 'Content-Type': 'application/json' };
  const jar = session?.cookies ?? adminCookies;
  const csrf = session?.csrf ?? csrfToken;
  if (jar) headers.Cookie = jar;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(`${BASE}/api/admin${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!session) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const pair = raw.split(';')[0];
      const cookieJar = new Map(adminCookies.split('; ').filter(Boolean).map((entry) => [entry.split('=')[0], entry]));
      cookieJar.set(pair.split('=')[0], pair);
      adminCookies = [...cookieJar.values()].join('; ');
      if (pair.startsWith('hv_admin_csrf=')) csrfToken = pair.slice('hv_admin_csrf='.length);
    }
  }
  const text = await res.text();
  responses.push(text);
  let json = {};
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, setCookie: res.headers.getSetCookie?.() ?? [] };
}

const sent = (type, orderNumber) =>
  memoryTransport.outbox.filter((m) => m.tags?.[0]?.value === type.toLowerCase() && (!orderNumber || m.html.includes(orderNumber)));
const events = (orderId, type) => PaymentEvent.countDocuments({ order: orderId, ...(type ? { type } : {}) });

const address = {
  name: 'Aarav Mehta', phone: '9876543210', addressLine1: '12 Beach Road, Flat 4B', addressLine2: '',
  city: 'Visakhapatnam', state: 'Andhra Pradesh', postalCode: '530016', country: 'India',
};

const products = (await api('GET', '/api/products?limit=12')).json.data.products;
const product = (await api('GET', `/api/products/${products[0].slug}`)).json.data.product;
const variant = product.variants.find((item) => item.stock > 20);

async function variantStock() {
  const doc = await Product.findById(product._id).lean();
  return doc.variants.find((item) => String(item._id) === String(variant._id)).stock;
}

async function placeOnline(token, quantity = 1, extraBody = {}) {
  await api('POST', '/api/cart/items', { productId: product._id, variantId: variant._id, quantity }, token);
  return api('POST', '/api/orders', { shippingAddress: address, paymentMethod: 'ONLINE', ...extraBody }, token);
}

const latestAttempt = (orderId) => PaymentAttempt.findOne({ order: orderId }).sort({ attemptNumber: -1 }).lean();

// ── Accounts ─────────────────────────────────────────────────────────────────
const registered = await api('POST', '/api/auth/register', { name: 'Aarav Mehta', email: 'aarav.pay@gmail.com', password: 'Humovare@Pay1' });
const token = registered.json.data.accessToken;
const other = await api('POST', '/api/auth/register', { name: 'Someone Else', email: 'someone.else@gmail.com', password: 'Humovare@Pay2' });
const otherToken = other.json.data.accessToken;
// The seeded owner's password counts as set by someone else; this suite is not about that.
await (await import('../src/models/AdminUser.js')).AdminUser.updateOne(
  { email: 'owner@humovare.test' },
  { $set: { mustChangePassword: false } },
);
await adminApi('POST', '/auth/login', { email: 'owner@humovare.test', password: 'Humovare@Admin2025' });

// ── Configuration ────────────────────────────────────────────────────────────
console.log('── Configuration ──');
const methods = await api('GET', '/api/orders/payment-methods');
const online = methods.json.data.methods.find((m) => m.method === 'ONLINE');
check('PhonePe is offered when configured', online?.enabled === true && online?.provider === 'phonepe');
check('checkout is told it is sandbox', online?.testMode === true);
check('payment methods reveal no credentials', !JSON.stringify(methods.json).includes(CLIENT_ID) && !JSON.stringify(methods.json).includes(CLIENT_SECRET));

// ── 1. Successful payment ────────────────────────────────────────────────────
console.log('\n── 1. Successful payment ──');
const stockBefore = await variantStock();
const first = await placeOnline(token, 2);
const firstOrder = first.json.data?.order;
check('checkout creates the order', first.status === 201 && Boolean(firstOrder?._id));
check('the order waits for payment', firstOrder?.orderStatus === 'PENDING' && firstOrder?.paymentStatus === 'PENDING');
check('checkout returns a PhonePe checkout link', first.json.data?.payment?.status === 'redirect' && /^https:\/\/mercury-uat\.phonepe\.com\//.test(first.json.data?.payment?.redirectUrl ?? ''));
check('stock is held for the payment window', (await variantStock()) === stockBefore - 2);
check('nothing is confirmed before payment', sent('ORDER_CONFIRMATION', firstOrder.orderNumber).length === 0);

const firstAttempt = await latestAttempt(firstOrder._id);
const firstPay = fake.payRequests.find((r) => r.merchantOrderId === firstAttempt.merchantOrderId);
check('PhonePe is asked for the server-side total, in paise', firstPay?.amount === Math.round(firstOrder.total * 100), `(${firstPay?.amount} vs ${firstOrder.total})`);
check('the reference is order number + attempt', firstAttempt.merchantOrderId === `${firstOrder.orderNumber}-P1`);
check('the return URL carries only the order id', firstPay?.paymentFlow?.merchantUrls?.redirectUrl === `https://humovare.in/payment/status?order=${firstOrder._id}`);
check('a pending status is reported before payment', (await api('GET', `/api/orders/${firstOrder._id}/payment-status`, undefined, token)).json.data?.payment?.state === 'PENDING');

fake.complete(firstAttempt.merchantOrderId);
const hook = await webhook(orderWebhook(firstAttempt.merchantOrderId));
check('a signed webhook is accepted', hook.status === 200);
await payments.drainWebhookWork();

const paidOrder = await Order.findById(firstOrder._id).lean();
check('the order is paid', paidOrder.paymentStatus === 'PAID');
check('…and confirmed', paidOrder.orderStatus === 'CONFIRMED');
check('…with PhonePe details recorded', paidOrder.payment.provider === 'phonepe' && paidOrder.payment.reference === firstAttempt.merchantOrderId && Boolean(paidOrder.payment.transactionId));
check('…and the amount PhonePe confirmed', paidOrder.payment.amountPaid === firstPay.amount);
check('the webhook was verified with the status API', fake.calls.status >= 1);

const receipt = sent('PAYMENT_SUCCESS', firstOrder.orderNumber);
check('one payment receipt is sent', receipt.length === 1);
check('receipt subject', receipt[0]?.subject === `Payment successful - HUMOVARE Order #${firstOrder.orderNumber}`);
check('receipt comes from noreply@humovare.in', receipt[0]?.from === 'HUMOVARE <noreply@humovare.in>');
check('replies go to support@humovare.in', receipt[0]?.replyTo === 'support@humovare.in');
check('one order confirmation is sent', sent('ORDER_CONFIRMATION', firstOrder.orderNumber).length === 1);
check('a PAYMENT_SUCCESS event is recorded', (await events(firstOrder._id, 'PAYMENT_SUCCESS')) === 1);
check('the payment page shows PAID', (await api('GET', `/api/orders/${firstOrder._id}/payment-status`, undefined, token)).json.data?.payment?.state === 'PAID');

// ── 6. Duplicate webhook ─────────────────────────────────────────────────────
console.log('\n── 6. Duplicate callback ──');
const again = await webhook(orderWebhook(firstAttempt.merchantOrderId));
await payments.drainWebhookWork();
check('a duplicate webhook still gets 200', again.status === 200);
check('…no second receipt', sent('PAYMENT_SUCCESS', firstOrder.orderNumber).length === 1);
check('…no second confirmation', sent('ORDER_CONFIRMATION', firstOrder.orderNumber).length === 1);
check('…no second success event', (await events(firstOrder._id, 'PAYMENT_SUCCESS')) === 1);

// ── 8. Refresh the success page ──────────────────────────────────────────────
console.log('\n── 8. Refreshing the success page ──');
for (let i = 0; i < 3; i += 1) await api('GET', `/api/orders/${firstOrder._id}/payment-status`, undefined, token);
check('refreshing changes nothing', sent('PAYMENT_SUCCESS', firstOrder.orderNumber).length === 1 && (await events(firstOrder._id, 'PAYMENT_SUCCESS')) === 1);

// ── 25. Simultaneous callbacks ───────────────────────────────────────────────
console.log('\n── 25. Callbacks arriving together ──');
const race = await placeOnline(token);
const raceOrder = race.json.data.order;
const raceRef = (await latestAttempt(raceOrder._id)).merchantOrderId;
fake.complete(raceRef);
await Promise.all([
  ...Array.from({ length: 5 }, () => webhook(orderWebhook(raceRef))),
  ...Array.from({ length: 3 }, () => api('GET', `/api/orders/${raceOrder._id}/payment-status`, undefined, token)),
]);
await payments.drainWebhookWork();
check('eight simultaneous callbacks → one success event', (await events(raceOrder._id, 'PAYMENT_SUCCESS')) === 1);
check('…one receipt', sent('PAYMENT_SUCCESS', raceOrder.orderNumber).length === 1);
check('…one confirmation', sent('ORDER_CONFIRMATION', raceOrder.orderNumber).length === 1);
check('…and the order is confirmed once', (await Order.findById(raceOrder._id).lean()).statusHistory.filter((h) => h.status === 'CONFIRMED').length === 1);

// ── 2, 3, 9. Failed and cancelled payments ───────────────────────────────────
console.log('\n── 2, 3, 9. Failed / cancelled payment ──');
const failing = await placeOnline(token);
const failingOrder = failing.json.data.order;
const failingRef = (await latestAttempt(failingOrder._id)).merchantOrderId;
fake.fail(failingRef, 'USER_CANCELLED');
const failedView = await api('GET', `/api/orders/${failingOrder._id}/payment-status`, undefined, token);
check('a cancelled payment is reported as failed', failedView.json.data?.payment?.state === 'FAILED');
check('…and can be retried', failedView.json.data?.payment?.canRetry === true);
check('the order is not paid', (await Order.findById(failingOrder._id).lean()).paymentStatus === 'FAILED');
check('…and not confirmed', (await Order.findById(failingOrder._id).lean()).orderStatus === 'PENDING');
check('PhonePe\'s error is recorded on the attempt', (await latestAttempt(failingOrder._id)).errorCode === 'USER_CANCELLED');
await sleep(200);
check('one payment-failed email', sent('PAYMENT_FAILED', failingOrder.orderNumber).length === 1);
await sleep(4100);
await api('GET', `/api/orders/${failingOrder._id}/payment-status`, undefined, token);
check('refreshing the failure page sends nothing more', sent('PAYMENT_FAILED', failingOrder.orderNumber).length === 1);
check('no confirmation for a failed payment', sent('ORDER_CONFIRMATION', failingOrder.orderNumber).length === 0);

// ── 16. Retry a failed payment ───────────────────────────────────────────────
console.log('\n── 16. Retry ──');
const retry = await api('POST', `/api/orders/${failingOrder._id}/payment/retry`, undefined, token);
check('retry returns a new checkout link', retry.status === 200 && retry.json.data?.payment?.status === 'redirect' && Boolean(retry.json.data.payment.redirectUrl));
const attempts = await PaymentAttempt.find({ order: failingOrder._id }).sort({ attemptNumber: 1 }).lean();
check('a second attempt with its own reference', attempts.length === 2 && attempts[1].merchantOrderId === `${failingOrder.orderNumber}-P2`);
check('the failed attempt is kept, unchanged', attempts[0].status === 'FAILED' && attempts[0].errorCode === 'USER_CANCELLED');
check('the order is payable again', (await Order.findById(failingOrder._id).lean()).paymentStatus === 'PENDING');
check('still the same order (no duplicate)', (await Order.countDocuments({ orderNumber: failingOrder.orderNumber })) === 1);
fake.complete(attempts[1].merchantOrderId);
await sleep(4100);
const retried = await api('GET', `/api/orders/${failingOrder._id}/payment-status`, undefined, token);
check('the retried payment completes', retried.json.data?.payment?.state === 'PAID');
check('the paid attempt is the second one', (await Order.findById(failingOrder._id).lean()).payment.reference === attempts[1].merchantOrderId);
const retryPaid = await api('POST', `/api/orders/${failingOrder._id}/payment/retry`, undefined, token);
check('retrying a paid order opens nothing new', retryPaid.json.data?.payment?.status === 'paid' && (await PaymentAttempt.countDocuments({ order: failingOrder._id })) === 2);

// ── 7. Duplicate "Pay" clicks ────────────────────────────────────────────────
console.log('\n── 7. Double clicks ──');
await api('POST', '/api/cart/items', { productId: product._id, variantId: variant._id, quantity: 1 }, token);
const [clickA, clickB] = await Promise.all([
  api('POST', '/api/orders', { shippingAddress: address, paymentMethod: 'ONLINE' }, token),
  api('POST', '/api/orders', { shippingAddress: address, paymentMethod: 'ONLINE' }, token),
]);
const created = [clickA, clickB].filter((r) => r.status === 201);
check('two simultaneous "Place order" clicks create one order', created.length === 1, `(${clickA.status}, ${clickB.status})`);
const doubleOrder = created[0].json.data.order;
const payCallsBefore = fake.calls.pay;
const [retryA, retryB] = await Promise.all([
  api('POST', `/api/orders/${doubleOrder._id}/payment/retry`, undefined, token),
  api('POST', `/api/orders/${doubleOrder._id}/payment/retry`, undefined, token),
]);
check('two "Pay" clicks reuse the open checkout', retryA.json.data?.payment?.redirectUrl === created[0].json.data.payment.redirectUrl
  && retryB.json.data?.payment?.redirectUrl === created[0].json.data.payment.redirectUrl);
check('…without asking PhonePe for another payment', fake.calls.pay === payCallsBefore);
check('…so there is still one attempt', (await PaymentAttempt.countDocuments({ order: doubleOrder._id })) === 1);

// ── 10. Invalid order ids / other people's orders ────────────────────────────
console.log('\n── 10. Invalid order id ──');
check('a malformed order id is refused', (await api('GET', '/api/orders/not-an-id/payment-status', undefined, token)).status === 422);
check('an unknown order id is 404', (await api('GET', `/api/orders/${new (await import('mongoose')).default.Types.ObjectId()}/payment-status`, undefined, token)).status === 404);
check('another customer\'s order is 404', (await api('GET', `/api/orders/${doubleOrder._id}/payment-status`, undefined, otherToken)).status === 404);
check('another customer cannot retry it', (await api('POST', `/api/orders/${doubleOrder._id}/payment/retry`, undefined, otherToken)).status === 404);
check('signed-out users cannot read it', (await api('GET', `/api/orders/${doubleOrder._id}/payment-status`)).status === 401);

// ── 11, 12, 17, 18. Webhook validation ───────────────────────────────────────
console.log('\n── 11, 12, 17, 18. Webhook validation ──');
const doubleRef = (await latestAttempt(doubleOrder._id)).merchantOrderId;
check('a wrong signature is 401', (await webhook(orderWebhook(doubleRef), 'f'.repeat(64))).status === 401);
check('a missing signature is 401', (await webhook(orderWebhook(doubleRef), null)).status === 401);
check('a signature for other credentials is 401', (await webhook(orderWebhook(doubleRef), webhookAuthorization(WEBHOOK_USER, 'wrong'))).status === 401);
check('refusals are recorded', (await PaymentEvent.countDocuments({ type: 'WEBHOOK_REJECTED' })) >= 3);
check('an empty payload is 400', (await webhook({})).status === 400);
check('a payload without a state is 400', (await webhook({ event: 'checkout.order.completed', payload: { merchantOrderId: doubleRef, amount: 100 } })).status === 400);
check('malformed JSON is refused', [400, 422].includes((await webhook('{"event": "checkout.order')).status));
check('an unknown payment reference is 404', (await webhook(orderWebhook('HV-NOPE-P1', 'COMPLETED', { amount: 10000 }))).status === 404);
fake.complete(doubleRef);
check('a webhook with the wrong amount is 400', (await webhook(orderWebhook(doubleRef, 'COMPLETED', { amount: 100 }))).status === 400);
await payments.drainWebhookWork();
check('…and the order is not paid', (await Order.findById(doubleOrder._id).lean()).paymentStatus === 'PENDING');

fake.reportAmount(doubleRef, 100);
await sleep(4100);
await api('GET', `/api/orders/${doubleOrder._id}/payment-status`, undefined, token);
const mismatched = await Order.findById(doubleOrder._id).lean();
check('PhonePe reporting a different amount does not mark it paid', mismatched.paymentStatus === 'PENDING' && mismatched.orderStatus === 'PENDING');
check('…it is flagged for review', mismatched.payment.needsReview === true);
check('…and recorded', (await events(doubleOrder._id, 'PAYMENT_AMOUNT_MISMATCH')) >= 1);
check('…with no receipt', sent('PAYMENT_SUCCESS', doubleOrder.orderNumber).length === 0);

// ── 13, 14. Tampered price and quantity ──────────────────────────────────────
console.log('\n── 13, 14. Price and quantity tampering ──');
await api('POST', '/api/cart/items', { productId: product._id, variantId: variant._id, quantity: 1, price: 1 }, token);
const cart = await api('GET', '/api/cart', undefined, token);
check('a price sent with the cart is ignored', cart.json.data.cart.items[0]?.price === (variant.price ?? product.price));
const tampered = await api('POST', '/api/orders', {
  shippingAddress: address, paymentMethod: 'ONLINE', total: 1, amount: 100, subtotal: 1, discount: 99999, shippingFee: 0,
}, token);
const tamperedRef = tampered.status === 201 ? (await latestAttempt(tampered.json.data.order._id)).merchantOrderId : null;
const tamperedPay = fake.payRequests.find((r) => r.merchantOrderId === tamperedRef);
check('totals sent by the browser are refused or ignored', tampered.status === 422 || (tamperedPay && tamperedPay.amount === Math.round(tampered.json.data.order.total * 100) && tampered.json.data.order.total > 1));
if (tampered.status === 201) await api('POST', `/api/orders/${tampered.json.data.order._id}/cancel`, {}, token);
else await api('DELETE', '/api/cart', undefined, token);

check('a negative quantity is refused', (await api('POST', '/api/cart/items', { productId: product._id, variantId: variant._id, quantity: -1 }, token)).status === 422);
check('a zero quantity is refused', (await api('POST', '/api/cart/items', { productId: product._id, variantId: variant._id, quantity: 0 }, token)).status === 422);
check('a fractional quantity is refused', (await api('POST', '/api/cart/items', { productId: product._id, variantId: variant._id, quantity: 1.5 }, token)).status === 422);
const tooMany = await api('POST', '/api/cart/items', { productId: product._id, variantId: variant._id, quantity: 9999 }, token);
check('more than is in stock is refused', tooMany.status >= 400 && tooMany.status < 500);
check('an unknown product is refused', (await api('POST', '/api/cart/items', { productId: String(new (await import('mongoose')).default.Types.ObjectId()), variantId: variant._id, quantity: 1 }, token)).status >= 400);

// ── 22, 23. PhonePe timeouts and temporary failures ──────────────────────────
console.log('\n── 22, 23. Gateway timeouts and outages ──');
fake.inject('pay', { kind: 'timeout' });
const slow = await placeOnline(token);
check('a PhonePe timeout still saves the order', slow.status === 201 && Boolean(slow.json.data?.order?._id));
check('…and says the payment is unavailable', slow.json.data?.payment?.status === 'unavailable' && /try the payment again/i.test(slow.json.data.payment.message));
check('…without leaking gateway details', !/abort|mercury|oauth|token/i.test(slow.json.data?.payment?.message ?? ''));
const slowOrder = slow.json.data.order;
check('the unusable attempt is closed', (await latestAttempt(slowOrder._id)).status === 'FAILED');
const slowRetry = await api('POST', `/api/orders/${slowOrder._id}/payment/retry`, undefined, token);
check('retrying after the outage works', slowRetry.json.data?.payment?.status === 'redirect');
const slowRef = (await latestAttempt(slowOrder._id)).merchantOrderId;

fake.complete(slowRef);
fake.inject('status', { kind: 'timeout', count: 3 });
await sleep(4100);
const unverified = await api('GET', `/api/orders/${slowOrder._id}/payment-status`, undefined, token);
check('a status-check timeout leaves the order pending, not failed', unverified.status === 200 && unverified.json.data.payment.state === 'PENDING');

fake.inject('status', { status: 503 });
await sleep(4100);
const recovered = await api('GET', `/api/orders/${slowOrder._id}/payment-status`, undefined, token);
check('a temporary 503 is retried and the payment confirmed', recovered.json.data?.payment?.state === 'PAID');

const tokensBefore = fake.calls.token;
fake.revokeTokens();
const afterRevoke = await placeOnline(token);
check('an expired access token is replaced once, transparently', afterRevoke.json.data?.payment?.status === 'redirect' && fake.calls.token === tokensBefore + 1);
check('access tokens are cached between calls', fake.calls.token <= 3, `(${fake.calls.token} token requests)`);

// ── 21. Email failure after payment ──────────────────────────────────────────
console.log('\n── 21. Email outage ──');
const emailOrder = afterRevoke.json.data.order;
const emailRef = (await latestAttempt(emailOrder._id)).merchantOrderId;
fake.complete(emailRef);
memoryTransport.failNext(6);
await webhook(orderWebhook(emailRef));
await payments.drainWebhookWork();
const emailPaid = await Order.findById(emailOrder._id).lean();
check('the payment stands when Resend fails', emailPaid.paymentStatus === 'PAID' && emailPaid.orderStatus === 'CONFIRMED');
check('the failed email is recorded for retry', (await EmailEvent.countDocuments({ order: emailOrder._id, status: 'failed' })) >= 1);
memoryTransport.reset();

// ── 24. Failure while handling a callback ────────────────────────────────────
console.log('\n── 24. Failure during callback handling ──');
const crash = await placeOnline(token);
const crashOrder = crash.json.data.order;
const crashRef = (await latestAttempt(crashOrder._id)).merchantOrderId;
fake.complete(crashRef);
const realUpdate = Order.findOneAndUpdate.bind(Order);
let crashed = false;
Order.findOneAndUpdate = function patched(filter, ...rest) {
  if (!crashed && String(filter?._id) === String(crashOrder._id) && filter?.orderStatus === 'PENDING') {
    crashed = true;
    throw new Error('Simulated database failure');
  }
  return realUpdate(filter, ...rest);
};
const crashHook = await webhook(orderWebhook(crashRef));
await payments.drainWebhookWork();
Order.findOneAndUpdate = realUpdate;
check('the webhook is acknowledged', crashHook.status === 200);
check('the database failure happened mid-update', crashed === true);
const halfDone = await Order.findById(crashOrder._id).lean();
check('the attempt is paid but the order update was lost', (await latestAttempt(crashOrder._id)).status === 'PAID' && halfDone.paymentStatus === 'PENDING');
await PaymentAttempt.updateOne({ order: crashOrder._id, status: 'PAID' }, { $set: { finalizedAt: new Date(Date.now() - 120000) } });
const repair = await payments.reconcilePayments();
const repaired = await Order.findById(crashOrder._id).lean();
check('the reconciler repairs it', repair.repaired >= 1 && repaired.paymentStatus === 'PAID' && repaired.orderStatus === 'CONFIRMED');
check('…with exactly one confirmation', sent('ORDER_CONFIRMATION', crashOrder.orderNumber).length === 1);

// ── 4, 5, 15. Abandoned and expired payments ─────────────────────────────────
console.log('\n── 4, 5, 15. Abandoned checkout and timeout ──');
const abandoned = await placeOnline(token, 3);
const abandonedOrder = abandoned.json.data.order;
const abandonedRef = (await latestAttempt(abandonedOrder._id)).merchantOrderId;
const heldStock = await variantStock();

// Past the order's window, but PhonePe still says PENDING: do not give up.
await Order.updateOne({ _id: abandonedOrder._id }, { $set: { 'payment.expiresAt': new Date(Date.now() - 1000) } });
await PaymentAttempt.updateOne({ merchantOrderId: abandonedRef }, { $set: { createdAt: new Date(Date.now() - 600000), lastCheckedAt: null } });
await PaymentAttempt.collection.updateOne({ merchantOrderId: abandonedRef }, { $set: { createdAt: new Date(Date.now() - 600000) } });
await payments.reconcilePayments();
check('time passing alone does not fail a payment', (await latestAttempt(abandonedOrder._id)).status === 'PENDING');
check('…nor cancel its order', (await Order.findById(abandonedOrder._id).lean()).orderStatus === 'PENDING');

// PhonePe expires the checkout.
fake.expireNow(abandonedRef);
await PaymentAttempt.updateOne({ merchantOrderId: abandonedRef }, { $set: { lastCheckedAt: null, expireAt: new Date(Date.now() - 1000) } });
const swept = await payments.reconcilePayments();
const expiredAttempt = await PaymentAttempt.findOne({ merchantOrderId: abandonedRef }).lean();
const expiredOrder = await Order.findById(abandonedOrder._id).lean();
check('once PhonePe confirms expiry the attempt is closed', ['FAILED', 'EXPIRED'].includes(expiredAttempt.status));
check('…the unpaid order is cancelled', swept.expiredOrders >= 1 && expiredOrder.orderStatus === 'CANCELLED' && expiredOrder.paymentStatus === 'CANCELLED');
check('…and its stock is released', (await variantStock()) === heldStock + 3);
check('an expired order cannot be paid', (await api('POST', `/api/orders/${abandonedOrder._id}/payment/retry`, undefined, token)).status === 409);
check('the payment page says so', (await api('GET', `/api/orders/${abandonedOrder._id}/payment-status`, undefined, token)).json.data?.payment?.state === 'CANCELLED');

// A payment that lands after the order was cancelled is kept and flagged.
fake.orders.get(abandonedRef).state = 'COMPLETED';
fake.orders.get(abandonedRef).touched = true;
await webhook(orderWebhook(abandonedRef));
await payments.drainWebhookWork();
const late = await Order.findById(abandonedOrder._id).lean();
check('a late payment is never lost', late.paymentStatus === 'PAID' && late.payment.needsReview === true);
check('…the order is not silently revived', late.orderStatus === 'CANCELLED');
check('…and it is recorded for review', (await events(abandonedOrder._id, 'PAYMENT_LATE_SUCCESS')) === 1);

// ── Customer cancellation ────────────────────────────────────────────────────
console.log('\n── Customer cancellation ──');
check('a paid online order cannot be self-cancelled', (await api('POST', `/api/orders/${firstOrder._id}/cancel`, {}, token)).status === 409);
const toCancel = await placeOnline(token);
const cancelRes = await api('POST', `/api/orders/${toCancel.json.data.order._id}/cancel`, {}, token);
check('an unpaid online order can be cancelled', cancelRes.status === 200);
check('…closing its checkout', (await latestAttempt(toCancel.json.data.order._id)).status === 'CANCELLED');
const paidInOtherTab = await placeOnline(token);
fake.complete((await latestAttempt(paidInOtherTab.json.data.order._id)).merchantOrderId);
const cancelPaid = await api('POST', `/api/orders/${paidInOtherTab.json.data.order._id}/cancel`, {}, token);
check('cancelling an order that was just paid confirms it instead', cancelPaid.status === 409 && (await Order.findById(paidInOtherTab.json.data.order._id).lean()).paymentStatus === 'PAID');

// ── Admin: no manual confirmation of unpaid online orders ────────────────────
const unpaid = await placeOnline(token);
check('an admin cannot confirm an unpaid online order', (await adminApi('PUT', `/orders/${unpaid.json.data.order._id}/status`, { status: 'CONFIRMED' })).status === 409);

// ── Refunds are not offered ──────────────────────────────────────────────────
console.log('\n── No refunds ──');
check('there is no gateway refund endpoint', (await adminApi('POST', `/orders/${firstOrder._id}/refunds`, {})).status === 404);
check('there is no manual refund endpoint', (await adminApi('PUT', `/orders/${firstOrder._id}/refund`, { status: 'COMPLETED' })).status === 404);
check('customers have no refund endpoint either', (await api('POST', `/api/orders/${firstOrder._id}/refund`, {}, token)).status === 404);
const refundHook = await webhook({ event: 'pg.refund.completed', payload: { merchantRefundId: 'X-R1', state: 'COMPLETED', amount: 100 } });
await payments.drainWebhookWork();
check('a refund webhook is acknowledged and ignored', refundHook.status === 200 && refundHook.json.ignored === true);
check('…and the paid order is unchanged', (await Order.findById(firstOrder._id).lean()).paymentStatus === 'PAID');
check('PhonePe\'s refund API is never called', !fake.calls.refund);
check('no refund email exists', sent('REFUND_INITIATED').length === 0 && sent('REFUND_COMPLETED').length === 0);

// ── Admin payment view ───────────────────────────────────────────────────────
console.log('\n── Admin view ──');
const view = await adminApi('GET', `/orders/${failingOrder._id}/payments`);
check('the admin sees every attempt', view.status === 200 && view.json.data.attempts.length === 2);
check('…with references, amounts and states', view.json.data.attempts.every((a) => a.merchantOrderId && a.amount && a.status));
check('…and the event trail', view.json.data.events.some((e) => e.type === 'PAYMENT_SUCCESS'));
check('…but never the customer\'s checkout link', !JSON.stringify(view.json).includes('mercury-uat'));

// ── Secrets ──────────────────────────────────────────────────────────────────
console.log('\n── Secrets ──');
const allLogs = logged.join('\n');
const allResponses = responses.join('\n');
const issuedTokens = [...new Set(allLogs.match(/tok_[0-9a-f]{24}/g) ?? [])];
check('the client secret never appears in a log line', !allLogs.includes(CLIENT_SECRET));
check('no access token appears in a log line', issuedTokens.length === 0);
check('the webhook password never appears in a log line', !allLogs.includes(WEBHOOK_PASS));
check('the client secret never appears in an API response', !allResponses.includes(CLIENT_SECRET));
check('no access token appears in an API response', !/tok_[0-9a-f]{24}/.test(allResponses));
check('payment events store no secrets', !JSON.stringify(await PaymentEvent.find().lean()).includes(CLIENT_SECRET));

// ── Summary ──────────────────────────────────────────────────────────────────
server.close();
await disconnectDB();
await mongo.stop();

console.log(`\n${'='.repeat(56)}`);
console.log(`PASSED: ${pass}   FAILED: ${fail}`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log('='.repeat(56));
process.exit(fail === 0 ? 0 : 1);
