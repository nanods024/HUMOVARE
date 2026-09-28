/**
 * End-to-end test for transactional email.
 *
 *   npm run test:email --workspace server
 *
 * Boots the real API against an in-memory MongoDB with the `memory` email
 * transport, so every email is captured in process and nothing touches the
 * network. It walks every trigger — registration, password reset, checkout,
 * payment, each admin status change, cancellation — and then the
 * failure paths: provider outages, permanent rejections, retries, duplicate
 * requests and replayed webhooks.
 *
 * All console output is captured for the run so the suite can assert that no
 * reset token, password or API key was ever logged.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'node:crypto';
import { createPhonePeTestDouble, webhookAuthorization } from './lib/phonepe-test-double.mjs';

// ── Capture every log line ───────────────────────────────────────────────────
const logged = [];
for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[method].bind(console);
  console[method] = (...args) => {
    logged.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    // Only the test's own PASS/FAIL lines are echoed, to keep the run readable.
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

const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
// Online payments go through the real PhonePe client against an in-process
// fake of PhonePe's API — never the network.
const PHONEPE = { id: 'EMAIL-TEST-CLIENT', secret: crypto.randomBytes(16).toString('hex'), hookUser: 'hook', hookPass: crypto.randomBytes(8).toString('hex') };

Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGODB_URI: mongo.getUri('humovare'),
  JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
  PHONEPE_ENV: 'sandbox',
  PHONEPE_CLIENT_ID: PHONEPE.id,
  PHONEPE_CLIENT_SECRET: PHONEPE.secret,
  PHONEPE_WEBHOOK_USERNAME: PHONEPE.hookUser,
  PHONEPE_WEBHOOK_PASSWORD: PHONEPE.hookPass,
  PAYMENT_RECONCILER: 'false',
  CLIENT_URL: 'http://localhost:5173',
  ADMIN_URL: 'http://localhost:5174',
  // Production-shaped links, so the suite checks what customers will get.
  FRONTEND_URL: 'https://humovare.in',
  EMAIL_TRANSPORT: 'memory',
  EMAIL_RETRY_WORKER: 'false',
  RESEND_FROM_EMAIL: 'noreply@humovare.in',
  RESEND_FROM_NAME: 'HUMOVARE',
  RESEND_REPLY_TO: 'support@humovare.in',
  // A key-shaped value that must never appear in a log line or response.
  RESEND_API_KEY: 're_TESTKEY_mustNeverBeLogged_1234567890',
  DISABLE_RATE_LIMIT: 'true',
  LOG_LEVEL: 'debug',
  SEED_SUPER_ADMIN_EMAIL: 'owner@humovare.test',
  SEED_SUPER_ADMIN_PASSWORD: 'Humovare@Admin2025',
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
await connectDB({ autoIndex: false });

const { seedDatabase } = await import('../src/seed/seed.js');
await seedDatabase({ fresh: true });

const { memoryTransport } = await import('../src/services/email/transport.js');
const { EmailEvent } = await import('../src/models/EmailEvent.js');
const { User } = await import('../src/models/User.js');
const { Order } = await import('../src/models/Order.js');
const notifications = await import('../src/services/email/notifications.js');
const { createApp } = await import('../src/app.js');
const { setPhonePeFetch } = await import('../src/services/payments/phonepe.client.js');
const payments = await import('../src/services/payments/onlinePayment.service.js');
const { PaymentAttempt } = await import('../src/models/PaymentAttempt.js');
await payments.ensurePaymentIndexes();
const phonepe = createPhonePeTestDouble({ clientId: PHONEPE.id, clientSecret: PHONEPE.secret });
setPhonePeFetch(phonepe.fetch);

const server = await new Promise((resolve) => {
  const s = createApp().listen(5399, () => resolve(s));
});
const BASE = 'http://127.0.0.1:5399';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

let adminCookies = '';
let csrfToken = '';

async function adminApi(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (adminCookies) headers.Cookie = adminCookies;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const res = await fetch(`${BASE}/api/admin${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0];
    const jar = new Map(adminCookies.split('; ').filter(Boolean).map((entry) => [entry.split('=')[0], entry]));
    jar.set(pair.split('=')[0], pair);
    adminCookies = [...jar.values()].join('; ');
    if (pair.startsWith('hv_admin_csrf=')) csrfToken = pair.slice('hv_admin_csrf='.length);
  }
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const sent = (type, predicate = () => true) =>
  memoryTransport.outbox.filter((message) => message.tags?.[0]?.value === type.toLowerCase() && predicate(message));

async function waitForEmail(type, predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = sent(type, predicate);
    if (found.length) return found[found.length - 1];
    await sleep(50);
  }
  return null;
}

const address = {
  name: 'Aarav <b>Mehta</b>',
  phone: '9876543210',
  addressLine1: '12 Beach Road, Flat 4B',
  addressLine2: '',
  city: 'Visakhapatnam',
  state: 'Andhra Pradesh',
  postalCode: '530016',
  country: 'India',
};

const products = (await api('GET', '/api/products?limit=12')).json.data.products;
const productDetail = (await api('GET', `/api/products/${products[0].slug}`)).json.data.product;
const variant = productDetail.variants.find((item) => item.stock > 5);

async function placeOrder(token, paymentMethod) {
  await api('POST', '/api/cart/items', { productId: productDetail._id, variantId: variant._id, quantity: 1 }, token);
  return api('POST', '/api/orders', { shippingAddress: address, paymentMethod }, token);
}

const referenceOf = async (orderId) =>
  (await PaymentAttempt.findOne({ order: orderId }).sort({ attemptNumber: -1 }).lean()).merchantOrderId;

/** The customer pays on PhonePe; PhonePe sends its signed webhook. */
async function payOnline(orderId) {
  const reference = await referenceOf(orderId);
  phonepe.complete(reference);
  const res = await fetch(`${BASE}/api/payments/phonepe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: webhookAuthorization(PHONEPE.hookUser, PHONEPE.hookPass) },
    body: JSON.stringify({ event: 'checkout.order.completed', payload: { merchantOrderId: reference, state: 'COMPLETED', amount: phonepe.orders.get(reference).amount } }),
  });
  await payments.drainWebhookWork();
  return { status: res.status, reference };
}

const FROM = 'HUMOVARE <noreply@humovare.in>';
const REPLY_TO = 'support@humovare.in';

// ── 1. Registration → welcome ────────────────────────────────────────────────
console.log('── Registration ──');

const customerEmail = 'aarav.test@gmail.com';
const initialPassword = 'Humovare@Initial1';

const registered = await api('POST', '/api/auth/register', {
  name: 'Aarav Mehta',
  email: customerEmail,
  password: initialPassword,
});
check('registration succeeds', registered.status === 201);
let token = registered.json.data.accessToken;
const userId = registered.json.data.user.id ?? registered.json.data.user._id;

const welcome = await waitForEmail('WELCOME', (message) => message.to === customerEmail);
check('a welcome email is sent after registration', Boolean(welcome));
check('welcome subject', welcome?.subject === 'Welcome to HUMOVARE');
check('sent from HUMOVARE <noreply@humovare.in>', welcome?.from === FROM);
check('reply-to is support@humovare.in', welcome?.replyTo === REPLY_TO);
check('welcome greets by first name', welcome?.html.includes('Hi Aarav,'));
check('welcome has a Shop now link to the live site', welcome?.html.includes('https://humovare.in/shop'));
check('welcome has a plain-text part', welcome?.text?.includes('Welcome to HUMOVARE'));

const duplicateRegistration = await api('POST', '/api/auth/register', {
  name: 'Aarav Mehta', email: customerEmail, password: initialPassword,
});
check('a failed registration is refused', duplicateRegistration.status === 409);
await sleep(300);
check('a failed registration sends nothing', sent('WELCOME', (m) => m.to === customerEmail).length === 1);

// ── 2–3, 17–20. Password reset ───────────────────────────────────────────────
console.log('\n── Password reset ──');

const unknownReset = await api('POST', '/api/auth/forgot-password', { email: 'nobody@example.com' });
const knownReset = await api('POST', '/api/auth/forgot-password', { email: customerEmail });
check('forgot-password answers 200 for an unknown address', unknownReset.status === 200);
check(
  'the response is identical whether or not the account exists',
  JSON.stringify(unknownReset.json) === JSON.stringify(knownReset.json),
);
check('the response carries no token or link', !/token|reset-password|devReset/i.test(knownReset.text));

const resetEmail = await waitForEmail('PASSWORD_RESET', (message) => message.to === customerEmail);
check('a reset email is sent to a registered address', Boolean(resetEmail));
check('no reset email goes to an unknown address', sent('PASSWORD_RESET', (m) => m.to === 'nobody@example.com').length === 0);
check('reset subject', resetEmail?.subject === 'Reset your HUMOVARE password');
check('reset email is from the HUMOVARE sender', resetEmail?.from === FROM && resetEmail?.replyTo === REPLY_TO);
check('reset email greets by first name', resetEmail?.html.includes('Hi Aarav,'));
check('reset email states the expiry', resetEmail?.html.includes('30 minutes'));
check('reset email says it can be ignored', /did not ask to reset/i.test(resetEmail?.html ?? ''));
check('reset email never contains a password', !(resetEmail?.html ?? '').includes(initialPassword));

const linkMatch = /https:\/\/humovare\.in\/reset-password\?token=([a-f0-9]{64})/.exec(resetEmail?.html ?? '');
check('reset link is https://humovare.in/reset-password?token=…', Boolean(linkMatch));
const rawToken = linkMatch?.[1] ?? '';

const stored = await User.findOne({ email: customerEmail }).select('+resetPasswordTokenHash').lean();
check('only a hash of the token is stored', stored.resetPasswordTokenHash && stored.resetPasswordTokenHash !== rawToken);
check(
  'the stored value is the SHA-256 of the token',
  stored.resetPasswordTokenHash === crypto.createHash('sha256').update(rawToken).digest('hex'),
);

const tooSoon = await api('POST', '/api/auth/forgot-password', { email: customerEmail });
await sleep(300);
check('a second request inside the cooldown still answers 200', tooSoon.status === 200);
check('…but sends no second email', sent('PASSWORD_RESET', (m) => m.to === customerEmail).length === 1);

const newPassword = 'Humovare@Reset22';
const didReset = await api('POST', '/api/auth/reset-password', { token: rawToken, password: newPassword });
check('the reset link works', didReset.status === 200);

const loginAfter = await api('POST', '/api/auth/login', { email: customerEmail, password: newPassword });
check('the new password signs in', loginAfter.status === 200);
token = loginAfter.json.data.accessToken;

const oldPassword = await api('POST', '/api/auth/login', { email: customerEmail, password: initialPassword });
check('the old password no longer works', oldPassword.status === 401);

const reused = await api('POST', '/api/auth/reset-password', { token: rawToken, password: 'Humovare@Again33' });
check('a used token is refused (single use)', reused.status === 400);

const invalid = await api('POST', '/api/auth/reset-password', { token: 'f'.repeat(64), password: 'Humovare@Again33' });
check('an invalid token is refused', invalid.status === 400);

// Move the last reset out of the cooldown window, then issue a fresh one.
await EmailEvent.collection.updateMany(
  { user: new (await import('mongoose')).default.Types.ObjectId(userId), type: 'PASSWORD_RESET' },
  { $set: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } },
);
await api('POST', '/api/auth/forgot-password', { email: customerEmail });
const secondResetEmail = await waitForEmail('PASSWORD_RESET', (m) => m.to === customerEmail && !m.html.includes(rawToken));
const secondToken = /token=([a-f0-9]{64})/.exec(secondResetEmail?.html ?? '')?.[1] ?? '';
check('a fresh reset issues a different token', Boolean(secondToken) && secondToken !== rawToken);

await User.updateOne({ email: customerEmail }, { $set: { resetPasswordExpiresAt: new Date(Date.now() - 1000) } });
const expired = await api('POST', '/api/auth/reset-password', { token: secondToken, password: 'Humovare@Late44' });
check('an expired token is refused', expired.status === 400);

// ── 4. Order confirmation (COD) ──────────────────────────────────────────────
console.log('\n── Order confirmation ──');

const cod = await placeOrder(token, 'COD');
check('a COD order is placed', cod.status === 201);
check('checkout reports the confirmation email as sent', cod.json.data?.notifications?.email === 'sent');

const codOrder = cod.json.data.order;
const confirmation = await waitForEmail('ORDER_CONFIRMATION', (m) => m.html.includes(codOrder.orderNumber));
check('an order confirmation email is sent', Boolean(confirmation));
check('confirmation subject', confirmation?.subject === `Order confirmed - HUMOVARE #${codOrder.orderNumber}`);
check('confirmation is from the HUMOVARE sender', confirmation?.from === FROM && confirmation?.replyTo === REPLY_TO);
check('confirmation says thank you', confirmation?.html.includes('Thank you for your order'));
check('confirmation lists the product', confirmation?.html.includes(codOrder.items[0].name));
check('confirmation shows the total', confirmation?.html.includes('₹') && confirmation?.html.includes('Total'));
check('confirmation names the payment method', confirmation?.html.includes('Cash on delivery'));
check('confirmation shows the shipping address', confirmation?.html.includes('12 Beach Road'));
check(
  'the View order button links to the existing order page',
  confirmation?.html.includes(`https://humovare.in/account/orders/${codOrder._id}`),
);
check('confirmation carries the logo', /<img[^>]+alt="HUMOVARE"/.test(confirmation?.html ?? ''));
check('customer-supplied markup is escaped', confirmation?.html.includes('&lt;b&gt;Mehta') && !confirmation?.html.includes('<b>Mehta'));
check('confirmation has a plain-text part', confirmation?.text?.includes(codOrder.orderNumber));
check('the transport receives the idempotency key', confirmation?.idempotencyKey === `order:${codOrder._id}:confirmation`);

// The delivery contact email is not Gmail-restricted: it is metadata on an
// address a signed-in customer already owns, not a new sign-up, and an
// existing account on another domain must never be blocked from ordering.
await api('POST', '/api/cart/items', { productId: productDetail._id, variantId: variant._id, quantity: 1 }, token);
const outlookContact = await api('POST', '/api/orders', {
  shippingAddress: { ...address, email: 'contact@outlook.com' }, paymentMethod: 'COD',
}, token);
check('a non-Gmail delivery contact email is accepted at checkout', outlookContact.status === 201);

await api('POST', '/api/cart/items', { productId: productDetail._id, variantId: variant._id, quantity: 1 }, token);
const malformedContact = await api('POST', '/api/orders', {
  shippingAddress: { ...address, email: 'not-an-email' }, paymentMethod: 'COD',
}, token);
check('a malformed delivery contact email is still refused', malformedContact.status === 422);

// ── 5, 15. Online payment: failure, success, duplicate webhook ───────────────
console.log('\n── Payment ──');

const online = await placeOrder(token, 'ONLINE');
const onlineOrder = online.json.data.order;
check('an online order waits for payment before confirming', online.json.data.notifications?.email === 'none');
check('no confirmation is sent before payment', sent('ORDER_CONFIRMATION', (m) => m.html.includes(onlineOrder.orderNumber)).length === 0);

// PhonePe reports the payment failed; the return page asks the API.
phonepe.fail(await referenceOf(onlineOrder._id));
const failedStatus = await api('GET', `/api/orders/${onlineOrder._id}/payment-status`, null, token);
check('a failed payment is reported as failed', failedStatus.json.data?.payment?.state === 'FAILED');
const failedEmail = await waitForEmail('PAYMENT_FAILED', (m) => m.html.includes(onlineOrder.orderNumber));
check('a payment-failed email is sent', Boolean(failedEmail));

// A second failed attempt on the same order.
await api('POST', `/api/orders/${onlineOrder._id}/payment/retry`, null, token);
phonepe.fail(await referenceOf(onlineOrder._id));
await sleep(4100);
await api('GET', `/api/orders/${onlineOrder._id}/payment-status`, null, token);
await sleep(300);
check('repeated failures send one payment-failed email', sent('PAYMENT_FAILED', (m) => m.html.includes(onlineOrder.orderNumber)).length === 1);

await api('POST', `/api/orders/${onlineOrder._id}/payment/retry`, null, token);
const paid = await payOnline(onlineOrder._id);
const paidOrder = await Order.findById(onlineOrder._id).lean();
check('a verified payment is accepted', paid.status === 200 && paidOrder.paymentStatus === 'PAID' && paidOrder.orderStatus === 'CONFIRMED');

const receipt = sent('PAYMENT_SUCCESS', (m) => m.html.includes(onlineOrder.orderNumber))[0];
check('a payment-successful email is sent', Boolean(receipt));
check('payment subject', receipt?.subject === `Payment successful - HUMOVARE Order #${onlineOrder.orderNumber}`);
check('payment email shows the gateway reference', receipt?.html.includes(paid.reference));
check('payment email shows the amount', receipt?.html.includes('Amount'));
check('the order confirmation follows the payment', sent('ORDER_CONFIRMATION', (m) => m.html.includes(onlineOrder.orderNumber)).length === 1);

const replay = await payOnline(onlineOrder._id);
check('a replayed payment webhook still answers 200', replay.status === 200);
check('…and sends no second receipt', sent('PAYMENT_SUCCESS', (m) => m.html.includes(onlineOrder.orderNumber)).length === 1);
check('…and no second confirmation', sent('ORDER_CONFIRMATION', (m) => m.html.includes(onlineOrder.orderNumber)).length === 1);

// ── 6–10, 16. Admin status changes ───────────────────────────────────────────
console.log('\n── Order status ──');

// The seeded owner's password counts as set by someone else; this suite is not about that.
await (await import('../src/models/AdminUser.js')).AdminUser.updateOne(
  { email: 'owner@humovare.test' },
  { $set: { mustChangePassword: false } },
);
const adminLogin = await adminApi('POST', '/auth/login', { email: 'owner@humovare.test', password: 'Humovare@Admin2025' });
check('admin signs in', adminLogin.status === 200);

const processing = await adminApi('PUT', `/orders/${codOrder._id}/status`, { status: 'PROCESSING' });
check('admin moves the order to processing', processing.status === 200);
check('the admin is told the customer was emailed', processing.json.data?.email?.status === 'sent');
const processingEmail = sent('ORDER_PROCESSING', (m) => m.html.includes(codOrder.orderNumber))[0];
check('processing subject', processingEmail?.subject === `Your HUMOVARE order #${codOrder.orderNumber} is being processed`);

const sameStatus = await adminApi('PUT', `/orders/${codOrder._id}/status`, { status: 'PROCESSING' });
check('setting the same status again is refused', sameStatus.status === 409);
check('…and sends nothing', sent('ORDER_PROCESSING', (m) => m.html.includes(codOrder.orderNumber)).length === 1);

const badTracking = await adminApi('PUT', `/orders/${codOrder._id}/status`, {
  status: 'SHIPPED', shipment: { trackingUrl: 'javascript:alert(1)' },
});
check('a non-http tracking link is refused', badTracking.status === 400 || badTracking.status === 422);

const shipped = await adminApi('PUT', `/orders/${codOrder._id}/status`, {
  status: 'SHIPPED',
  shipment: {
    carrier: 'Delhivery',
    trackingNumber: 'DLV1234567890',
    trackingUrl: 'https://www.delhivery.com/track/package/DLV1234567890',
    estimatedDelivery: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  },
});
check('admin marks the order shipped with tracking', shipped.status === 200);
const shippedEmail = sent('ORDER_SHIPPED', (m) => m.html.includes(codOrder.orderNumber))[0];
check('shipped subject', shippedEmail?.subject === `Your HUMOVARE order #${codOrder.orderNumber} has shipped`);
check('shipped email names the courier', shippedEmail?.html.includes('Delhivery'));
check('shipped email shows the tracking number', shippedEmail?.html.includes('DLV1234567890'));
check('shipped email has a Track order button', /Track order/i.test(shippedEmail?.html ?? '') && shippedEmail.html.includes('delhivery.com/track'));
check('shipped email shows an estimated delivery', shippedEmail?.html.includes('Estimated delivery'));

const replayShipped = await notifications.notifyOrderStatus(codOrder._id, 'SHIPPED');
check('a replayed status event is suppressed as a duplicate', replayShipped.status === 'duplicate');
check('…and nothing is resent', sent('ORDER_SHIPPED', (m) => m.html.includes(codOrder.orderNumber)).length === 1);

const outForDelivery = await adminApi('PUT', `/orders/${codOrder._id}/status`, { status: 'OUT_FOR_DELIVERY' });
check('admin marks it out for delivery', outForDelivery.status === 200);
const ofdEmail = sent('ORDER_OUT_FOR_DELIVERY', (m) => m.html.includes(codOrder.orderNumber))[0];
check('out-for-delivery subject', ofdEmail?.subject === `Your HUMOVARE order #${codOrder.orderNumber} is out for delivery`);
check('the tracking number carries over', ofdEmail?.html.includes('DLV1234567890'));

const delivered = await adminApi('PUT', `/orders/${codOrder._id}/status`, { status: 'DELIVERED' });
check('admin marks it delivered', delivered.status === 200);
const deliveredEmail = sent('ORDER_DELIVERED', (m) => m.html.includes(codOrder.orderNumber))[0];
check('delivered subject', deliveredEmail?.subject === `Your HUMOVARE order #${codOrder.orderNumber} has been delivered`);
check('delivered email shows the delivery date', deliveredEmail?.html.includes('Delivered'));
check('delivered email shows the total', deliveredEmail?.html.includes('Total'));

// A shipment with no courier details must not show an empty tracking box.
const bare = await placeOrder(token, 'COD');
const bareOrder = bare.json.data.order;
await adminApi('PUT', `/orders/${bareOrder._id}/status`, { status: 'PROCESSING' });
await adminApi('PUT', `/orders/${bareOrder._id}/status`, { status: 'SHIPPED' });
const bareShipped = sent('ORDER_SHIPPED', (m) => m.html.includes(bareOrder.orderNumber))[0];
check('a shipped email without tracking omits the tracking section', bareShipped && !/>Tracking</.test(bareShipped.html));
check('…and falls back to the View order button', bareShipped?.html.includes(`/account/orders/${bareOrder._id}`));

// ── Skipping steps, and courier details the customer can see ────────────────
console.log('\n── Shipping shortcuts & tracking ──');
const direct = await placeOrder(token, 'COD');
const directOrder = direct.json.data.order;
const shipDirect = await adminApi('PUT', `/orders/${directOrder._id}/status`, {
  status: 'SHIPPED',
  shipment: { carrier: 'Blue Dart', trackingNumber: 'BD998877', trackingUrl: 'https://www.bluedart.com/tracking?awb=BD998877' },
});
check('a confirmed order can go straight to Shipped', shipDirect.status === 200, `(got ${shipDirect.status} ${shipDirect.json.message ?? ''})`);
check('…and the shipped email goes out', sent('ORDER_SHIPPED', (m) => m.html.includes(directOrder.orderNumber)).length === 1);

const customerView = await api('GET', `/api/orders/${directOrder._id}`, null, token);
const seen = customerView.json.data?.order?.shipment ?? {};
check('the customer sees the courier on their order', seen.carrier === 'Blue Dart');
check('…and the tracking number and link', seen.trackingNumber === 'BD998877' && seen.trackingUrl === 'https://www.bluedart.com/tracking?awb=BD998877');
check('…and when it shipped', Boolean(seen.shippedAt));

const shippedEmailsBefore = sent('ORDER_SHIPPED', (m) => m.html.includes(directOrder.orderNumber)).length;
const fixTracking = await adminApi('PUT', `/orders/${directOrder._id}/shipment`, { trackingNumber: 'BD998878' });
check('courier details can be corrected after shipping', fixTracking.status === 200);
const afterFix = await api('GET', `/api/orders/${directOrder._id}`, null, token);
check('…the customer sees the correction', afterFix.json.data?.order?.shipment?.trackingNumber === 'BD998878');
check('…the courier is kept', afterFix.json.data?.order?.shipment?.carrier === 'Blue Dart');
check('…and no second email is sent', sent('ORDER_SHIPPED', (m) => m.html.includes(directOrder.orderNumber)).length === shippedEmailsBefore);

const badLink = await adminApi('PUT', `/orders/${directOrder._id}/shipment`, { trackingUrl: 'javascript:alert(1)' });
check('a non-http tracking link is refused when editing', badLink.status === 400 || badLink.status === 422);

const cancelShipped = await adminApi('PUT', `/orders/${directOrder._id}/status`, { status: 'CANCELLED' });
check('a shipped order cannot be cancelled', cancelShipped.status === 409);
const backwards = await adminApi('PUT', `/orders/${directOrder._id}/status`, { status: 'PROCESSING' });
check('an order cannot move backwards', backwards.status === 409);

const notShipped = await placeOrder(token, 'COD');
const notShippedOrder = notShipped.json.data.order;
const earlyTracking = await adminApi('PUT', `/orders/${notShippedOrder._id}/shipment`, { carrier: 'Blue Dart' });
check('courier details wait until the order ships', earlyTracking.status === 409);
const straightDelivered = await adminApi('PUT', `/orders/${notShippedOrder._id}/status`, { status: 'DELIVERED' });
check('a confirmed order can be marked delivered directly', straightDelivered.status === 200);
check('…which records a ship date too', Boolean(straightDelivered.json.data?.order?.shipment?.shippedAt));
check('…and marks cash on delivery as paid', straightDelivered.json.data?.order?.paymentStatus === 'PAID');

const unpaid = await placeOrder(token, 'ONLINE');
const shipUnpaid = await adminApi('PUT', `/orders/${unpaid.json.data.order._id}/status`, { status: 'SHIPPED' });
check('an unpaid online order cannot be shipped', shipUnpaid.status === 409);

// ── 10–12. Cancellation ──────────────────────────────────────────
console.log('\n── Cancellation ──');

const toCancel = await placeOrder(token, 'COD');
const cancelOrder = toCancel.json.data.order;
const cancelled = await api('POST', `/api/orders/${cancelOrder._id}/cancel`, { reason: 'Ordered the wrong size' }, token);
check('the customer cancels an order', cancelled.status === 200);
check('the cancellation reports its email as sent', cancelled.json.data?.notifications?.email === 'sent');
const cancelEmail = sent('ORDER_CANCELLED', (m) => m.html.includes(cancelOrder.orderNumber))[0];
check('cancelled subject', cancelEmail?.subject === `Your HUMOVARE order #${cancelOrder.orderNumber} has been cancelled`);
check('cancelled email gives the reason', cancelEmail?.html.includes('Ordered the wrong size'));
check('cancelled email lists the cancelled items', cancelEmail?.html.includes('Cancelled items'));
check('the cancellation email has no refund wording', !/refund/i.test(cancelEmail?.html ?? ''));

// A paid online order: the customer cannot cancel it; the admin can.
const paidToCancel = await placeOrder(token, 'ONLINE');
const paidCancelOrder = paidToCancel.json.data.order;
await payOnline(paidCancelOrder._id);
check('a customer cannot self-cancel a paid online order', (await api('POST', `/api/orders/${paidCancelOrder._id}/cancel`, { reason: 'No longer needed' }, token)).status === 409);

await adminApi('PUT', `/orders/${paidCancelOrder._id}/status`, { status: 'CANCELLED', note: 'No longer needed' });
const paidCancelEmail = sent('ORDER_CANCELLED', (m) => m.html.includes(paidCancelOrder.orderNumber))[0];
check('the admin can cancel a paid order', Boolean(paidCancelEmail));
check('…and its email has no refund wording', !/refund/i.test(paidCancelEmail?.html ?? ''));
check('there is no refund endpoint', (await adminApi('PUT', `/orders/${paidCancelOrder._id}/refund`, { status: 'INITIATED' })).status === 404);
check('no refund email is ever sent', sent('REFUND_INITIATED').length === 0 && sent('REFUND_COMPLETED').length === 0);

// ── 13–14. Failures, retries, and the order surviving them ───────────────────
console.log('\n── Failure handling ──');

// A provider outage that outlasts the inline retries.
memoryTransport.failNext(3);
const outage = await placeOrder(token, 'COD');
const outageOrder = outage.json.data.order;
check('the order is still placed when the email fails', outage.status === 201 && Boolean(outageOrder?._id));
check('checkout reports the failure', outage.json.data.notifications?.email === 'failed');
check(
  'the customer gets the friendly message',
  outage.json.data.notifications?.message ===
    "Your order was placed successfully. We couldn't send the confirmation email right now, but you can view your order from your account.",
);
check(
  'the provider error is not exposed to the customer',
  !/injected test failure|internal_server_error|provider_error/i.test(JSON.stringify(outage.json)) &&
    !/resend/i.test(outage.json.data.notifications?.message ?? ''),
);
check('the order really exists', Boolean(await Order.exists({ _id: outageOrder._id })));

const failedEvent = await EmailEvent.findOne({ idempotencyKey: `order:${outageOrder._id}:confirmation` }).lean();
check('the failure is recorded', failedEvent?.status === 'failed');
check('three inline attempts were made', failedEvent?.attempts === 3);
check('it is scheduled for a later retry', failedEvent?.nextAttemptAt > new Date());
check('the error is categorised', failedEvent?.errorCategory === 'provider_error');

const notYet = await notifications.retryDueEmails();
check('the worker does not retry before it is due', notYet.length === 0);

await EmailEvent.updateOne({ _id: failedEvent._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
const retried = await notifications.retryDueEmails();
check('the worker retries a due email', retried.some((result) => result.status === 'sent'));
check('the retried email arrives exactly once', sent('ORDER_CONFIRMATION', (m) => m.html.includes(outageOrder.orderNumber)).length === 1);

const afterRetry = await EmailEvent.findById(failedEvent._id).lean();
check('the record becomes sent', afterRetry.status === 'sent' && Boolean(afterRetry.providerMessageId));
check('the attempt count includes the retry', afterRetry.attempts === 4);

const secondPass = await notifications.retryDueEmails();
check('a sent email is never picked up again', secondPass.length === 0);

// A permanent rejection is not retried.
memoryTransport.failNext(1, { code: 'validation_error', category: 'invalid_request', retryable: false });
const permanent = await adminApi('PUT', `/orders/${outageOrder._id}/status`, { status: 'PROCESSING' });
check('the status change succeeds despite a rejected email', permanent.status === 200);
check('the admin is told the email failed', permanent.json.data?.email?.status === 'failed');
const permanentEvent = await EmailEvent.findOne({ idempotencyKey: `order:${outageOrder._id}:status:PROCESSING` }).lean();
check('a permanent failure is not retried inline', permanentEvent?.attempts === 1);
check('…nor scheduled for later', permanentEvent?.nextAttemptAt === null);

// History and manual retry from the admin.
const history = await adminApi('GET', `/orders/${outageOrder._id}/emails`);
check('the admin can see an order’s email history', history.status === 200 && history.json.data.emails.length === 2);
check('history carries status, time and message id', history.json.data.emails.every((e) => 'status' in e && 'createdAt' in e && 'providerMessageId' in e));
check('history carries the failure reason', history.json.data.emails.some((e) => e.errorCategory === 'invalid_request'));
check('history never carries a body', !JSON.stringify(history.json).includes('<table'));

const manual = await adminApi('POST', `/orders/${outageOrder._id}/emails/${permanentEvent._id}/retry`);
check('the admin can retry a failed email', manual.status === 200 && manual.json.data.result.status === 'sent');
check('the manual retry delivers it once', sent('ORDER_PROCESSING', (m) => m.html.includes(outageOrder.orderNumber)).length === 1);

const manualAgain = await adminApi('POST', `/orders/${outageOrder._id}/emails/${permanentEvent._id}/retry`);
check('retrying a sent email does not send it twice', manualAgain.json.data?.result?.status === 'duplicate');

const customerHistory = await fetch(`${BASE}/api/admin/orders/${outageOrder._id}/emails`, {
  headers: { Authorization: `Bearer ${token}` },
});
check('a customer cannot read email history', customerHistory.status === 401);

// A stale status email is dropped rather than sent late.
memoryTransport.failNext(3);
const stale = await placeOrder(token, 'COD');
const staleOrder = stale.json.data.order;
memoryTransport.reset();
await notifications.retryDueEmails();
memoryTransport.failNext(3);
await adminApi('PUT', `/orders/${staleOrder._id}/status`, { status: 'PROCESSING' });
await adminApi('PUT', `/orders/${staleOrder._id}/status`, { status: 'SHIPPED' });
await EmailEvent.updateMany({ order: staleOrder._id, status: 'failed' }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
const staleRetry = await notifications.retryDueEmails();
check('an email the order has outgrown is dropped as superseded', staleRetry.some((r) => r.status === 'superseded'));
check('…and is never sent late', sent('ORDER_PROCESSING', (m) => m.html.includes(staleOrder.orderNumber)).length === 0);

// Concurrent sends of the same event.
const raceKey = `order:${staleOrder._id}:race-test`;
const racers = await Promise.all(
  Array.from({ length: 5 }, () =>
    (async () => (await import('../src/services/email/email.service.js')).sendEmail({
      type: 'ORDER_DELIVERED',
      to: customerEmail,
      idempotencyKey: raceKey,
      render: () => ({ subject: 'race', html: '<p>race</p>', text: 'race' }),
    }))(),
  ),
);
check('five simultaneous sends of one event deliver exactly once', racers.filter((r) => r.status === 'sent').length === 1);

// ── 20. Rate-limited reset requests ──────────────────────────────────────────
console.log('\n── Rate limiting ──');

process.env.DISABLE_RATE_LIMIT = 'false';
const burst = [];
for (let i = 0; i < 7; i += 1) {
  burst.push((await api('POST', '/api/auth/forgot-password', { email: `burst${i}@example.com` })).status);
}
check('repeated reset requests from one address are rate-limited', burst.includes(429));

// ── Logging hygiene ──────────────────────────────────────────────────────────
console.log('\n── Logging ──');

const everything = logged.join('\n');
const tokens = [rawToken, secondToken].filter(Boolean);
check('both reset tokens were captured for this check', tokens.length === 2);
check('no reset token was ever logged', tokens.every((value) => !everything.includes(value)));
check('no password was ever logged', ![initialPassword, newPassword].some((p) => everything.includes(p)));
check('the API key was never logged', !everything.includes(process.env.RESEND_API_KEY));
check('recipients are masked in the logs', everything.includes('a***@gmail.com') && !everything.includes(`"${customerEmail}"`));
check('sent emails are logged with their message id', /Email sent[\s\S]*messageId/.test(everything));

// ── Summary ──────────────────────────────────────────────────────────────────
server.close();
await disconnectDB();
await mongo.stop();

console.log(`\n${'='.repeat(50)}`);
console.log(`PASSED: ${pass}   FAILED: ${fail}`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
