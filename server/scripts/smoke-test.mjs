/**
 * End-to-end smoke test for the HUMOVARE API against an in-memory MongoDB.
 *
 *   npm run test:smoke
 *
 * Requires the optional `mongodb-memory-server` dev dependency, which
 * downloads a mongod binary on first run. Nothing here touches Atlas.
 * Exercises: seed -> browse -> filter -> search -> auth -> wishlist -> cart
 * -> guest merge -> address -> checkout -> order history -> cancel.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'node:crypto';

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

const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
const uri = mongo.getUri('humovare');
console.log(`In-memory MongoDB: ${uri}\n`);

const secretA = crypto.randomBytes(32).toString('hex');
const secretB = crypto.randomBytes(32).toString('hex');

const envVars = {
  ...process.env,
  NODE_ENV: 'development',
  MONGODB_URI: uri,
  JWT_ACCESS_SECRET: secretA,
  JWT_REFRESH_SECRET: secretB,
  PORT: '5199',
  CLIENT_URL: 'http://localhost:5173',
  DISABLE_RATE_LIMIT: 'true',
  LOG_LEVEL: 'warn',
  // Never the network: server/.env may hold a live Resend key, and the seed
  // creates customers on domains the shop does not own.
  EMAIL_TRANSPORT: 'memory',
  EMAIL_RETRY_WORKER: 'false',
  // Never the real gateway, even if server/.env holds PhonePe credentials:
  // this suite runs with online payment off (see test:payments for PhonePe).
  PHONEPE_ENV: '',
  PHONEPE_CLIENT_ID: '',
  PHONEPE_CLIENT_SECRET: '',
  PAYMENT_RECONCILER: 'false',
  GOOGLE_CLIENT_ID: 'smoke-test.apps.googleusercontent.com',
};

// ── 1. Boot + seed (in-process) ───────────────────────────────────
// NOTE: the seed runs in this process rather than via spawnSync. Child
// processes in this sandbox cannot sustain many MongoDB commands.
console.log('── Seeding ──');
Object.assign(process.env, envVars);
const { connectDB, disconnectDB } = await import('../src/config/db.js');
await connectDB({ autoIndex: false });
const { seedDatabase } = await import('../src/seed/seed.js');
const seedResult = await seedDatabase({ fresh: true });
// Counted from the seed data itself, so adding a category there is not a
// test failure.
const seedData = await import('../src/seed/data.js');
const expectedCategories = (seedData.categories ?? seedData.default?.categories ?? []).length;

check('seed creates 18 products', seedResult.products === 18, `(got ${seedResult.products})`);
check(
  'seed creates every category in the seed data',
  seedResult.categories === expectedCategories,
  `(got ${seedResult.categories}, expected ${expectedCategories})`,
);

// ── 2. Boot the API in-process ───────────────────────────────────────────────
const { createApp } = await import('../src/app.js');
const app = createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(5199, () => resolve(s));
});

const BASE = 'http://127.0.0.1:5199';
let accessToken = null;
let cookie = '';

async function api(method, path, body, { auth = false, raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];

  const json = await res.json().catch(() => ({}));
  return raw ? { status: res.status, json } : json;
}

console.log('\n── Health & catalogue ──');
const health = await api('GET', '/health');
check('GET /health returns ok', health.success === true && health.data.status === 'ok');

const nav = await api('GET', '/api/categories/navigation');
// Menswear-only: there is no gender tier, just the four product types.
check('navigation exposes the product types', nav.data.productTypes.length === 4);
check('navigation has no gender tier', nav.data.gender.length === 0);

const list = await api('GET', '/api/products?limit=6');
check('GET /api/products paginates', list.data.products.length === 6 && list.data.pagination.totalProducts === 18);
check('listing omits description (card projection)', list.data.products[0].description === undefined);
check('pagination reports hasNextPage', list.data.pagination.hasNextPage === true);

const tees = await api('GET', '/api/products?category=t-shirts&gender=men');
check('filter by category + gender', tees.data.products.length > 0 && tees.data.products.every((p) => p.gender === 'men'));

const priced = await api('GET', '/api/products?minPrice=1000&maxPrice=1500');
check('filter by price range', priced.data.products.every((p) => p.price >= 1000 && p.price <= 1500));

const sorted = await api('GET', '/api/products?sort=price-asc&limit=10');
const prices = sorted.data.products.map((p) => p.price);
check('sort=price-asc is ascending', prices.every((v, i) => i === 0 || prices[i - 1] <= v));

const sizeFilter = await api('GET', '/api/products?size=XXL');
check('filter by size returns results', sizeFilter.data.products.length > 0);

const colorFilter = await api('GET', '/api/products?color=signature-red');
check('filter by colour returns results', colorFilter.data.products.length > 0);

const saleList = await api('GET', '/api/products?collection=sale');
check('virtual collection "sale" resolves', saleList.data.products.length > 0);

const newDrops = await api('GET', '/api/products?collection=new-drops');
check('virtual collection "new-drops" resolves', newDrops.data.products.length > 0);

const facets = await api('GET', '/api/products/facets?category=t-shirts');
check('facets return sizes & colours', facets.data.sizes.length > 0 && facets.data.colors.length > 0);

const feed = await api('GET', '/api/products/home-feed');
check('home feed has rails', feed.data.newDrops.length > 0 && feed.data.bestsellers.length > 0);

const search = await api('GET', '/api/products/search?q=hoodie');
check('search finds hoodies', search.data.products.length > 0);

const searchFull = await api('GET', '/api/products?search=oversized');
check('text search via listing works', searchFull.data.products.length > 0);

const slug = list.data.products[0].slug;
const detail = await api('GET', `/api/products/${slug}`);
check('product detail returns product + related', Boolean(detail.data.product) && Array.isArray(detail.data.related));
check('detail includes variants', detail.data.product.variants.length > 0);

const missing = await api('GET', '/api/products/not-a-real-product', null, { raw: true });
check('unknown slug 404s with envelope', missing.status === 404 && missing.json.success === false);

console.log('\n── Auth ──');
const badRegister = await api('POST', '/api/auth/register', { name: 'A', email: 'bad', password: '123' }, { raw: true });
check('register validation rejects bad input', badRegister.status === 422 && Array.isArray(badRegister.json.error));

const nonGmail = await api('POST', '/api/auth/register', {
  name: 'Outlook User', email: 'someone@outlook.com', password: 'Humovare@2025',
}, { raw: true });
check('registration only accepts Gmail addresses', nonGmail.status === 422 && /gmail/i.test(JSON.stringify(nonGmail.json)));

const lookalike = await api('POST', '/api/auth/register', {
  name: 'Lookalike', email: 'someone@gmail.co', password: 'Humovare@2025',
}, { raw: true });
check('a look-alike domain is refused', lookalike.status === 422);

// Seeded accounts are on another domain: they must still be able to sign in.
const legacyLogin = await api('POST', '/api/auth/login', { email: 'demo@humovare.com', password: 'Humovare@2025' }, { raw: true });
check('an existing non-Gmail account can still sign in', legacyLogin.status === 200);

const reg = await api('POST', '/api/auth/register', {
  name: 'Test Shopper',
  email: 'shopper.test@gmail.com',
  password: 'Humovare@2025',
});
check('register succeeds', reg.success === true && Boolean(reg.data.accessToken));
check('register never leaks passwordHash', JSON.stringify(reg).includes('passwordHash') === false);
accessToken = reg.data.accessToken;

const dupe = await api('POST', '/api/auth/register', {
  name: 'Test Shopper',
  email: 'shopper.test@gmail.com',
  password: 'Humovare@2025',
}, { raw: true });
check('duplicate email 409s', dupe.status === 409);

const badLogin = await api('POST', '/api/auth/login', { email: 'shopper.test@gmail.com', password: 'wrongpass' }, { raw: true });
check('wrong password 401s', badLogin.status === 401);
check('login error does not reveal which field failed', /incorrect/i.test(badLogin.json.message));

const login = await api('POST', '/api/auth/login', { email: 'shopper.test@gmail.com', password: 'Humovare@2025' });
accessToken = login.data.accessToken;
check('login returns access token', Boolean(accessToken));

const noAuth = await api('GET', '/api/cart', null, { raw: true });
check('cart requires auth', noAuth.status === 401);

const refreshed = await api('POST', '/api/auth/refresh');
check('refresh rotates session from cookie', refreshed.success === true && Boolean(refreshed.data.accessToken));
accessToken = refreshed.data.accessToken;

const meRes = await api('GET', '/api/auth/me', null, { auth: true });
check('GET /api/auth/me returns user', meRes.data.user.email === 'shopper.test@gmail.com');

console.log('\n── Wishlist ──');
const productA = detail.data.product;
const wlAdd = await api('POST', `/api/wishlist/${productA._id}`, null, { auth: true });
check('add to wishlist', wlAdd.data.wishlist.count === 1);

const wlAgain = await api('POST', `/api/wishlist/${productA._id}`, null, { auth: true });
check('wishlist add is idempotent', wlAgain.data.wishlist.count === 1);

const wlIds = await api('GET', '/api/wishlist/ids', null, { auth: true });
check('wishlist ids endpoint', wlIds.data.productIds.length === 1);

console.log('\n── Cart ──');
const inStockVariant = productA.variants.find((v) => v.stock > 3);
const add = await api('POST', '/api/cart/items', {
  productId: productA._id,
  variantId: inStockVariant._id,
  quantity: 2,
}, { auth: true });
check('add to cart', add.data.cart.items.length === 1 && add.data.cart.totalQuantity === 2);
check('cart computes summary', add.data.cart.summary.total > 0);

const addAgain = await api('POST', '/api/cart/items', {
  productId: productA._id,
  variantId: inStockVariant._id,
  quantity: 1,
}, { auth: true });
check('re-adding same variant merges quantity', addAgain.data.cart.items.length === 1 && addAgain.data.cart.totalQuantity === 3);

const soldOut = productA.variants.find((v) => v.stock === 0);
if (soldOut) {
  const oos = await api('POST', '/api/cart/items', {
    productId: productA._id,
    variantId: soldOut._id,
    quantity: 1,
  }, { auth: true, raw: true });
  check('sold-out variant is rejected', oos.status === 409);
}

const overQty = await api('POST', '/api/cart/items', {
  productId: productA._id,
  variantId: inStockVariant._id,
  quantity: 99,
}, { auth: true, raw: true });
check('quantity above max is rejected', overQty.status === 422);

const itemId = addAgain.data.cart.items[0].id;
const upd = await api('PUT', `/api/cart/items/${itemId}`, { quantity: 1 }, { auth: true });
check('update cart quantity', upd.data.cart.totalQuantity === 1);

// Guest merge
const productB = list.data.products[2];
const detailB = await api('GET', `/api/products/${productB.slug}`);
const variantB = detailB.data.product.variants.find((v) => v.stock > 2);
const merged = await api('POST', '/api/cart/merge', {
  items: [{ productId: detailB.data.product._id, variantId: variantB._id, quantity: 2 }],
}, { auth: true });
check('guest cart merges into server cart', merged.data.cart.items.length === 2 && merged.data.cart.totalQuantity === 3);

console.log('\n── Checkout ──');
const methods = await api('GET', '/api/orders/payment-methods');
check('payment methods listed', methods.data.methods.length === 2);
check('online payment is off when PhonePe is not configured', methods.data.methods[1].enabled === false && methods.data.methods[1].provider === null);

const addr = await api('POST', '/api/users/me/addresses', {
  name: 'Test Shopper',
  phone: '9876543210',
  addressLine1: '12 Beach Road',
  city: 'Visakhapatnam',
  state: 'Andhra Pradesh',
  postalCode: '530017',
  country: 'India',
}, { auth: true });
check('create address', addr.success === true && addr.data.address.isDefault === true);

const badAddr = await api('POST', '/api/users/me/addresses', {
  name: 'X', phone: '123', addressLine1: 'a', city: 'b', state: 'c', postalCode: '1',
}, { auth: true, raw: true });
check('address validation rejects bad input', badAddr.status === 422);

const stockBefore = (await api('GET', `/api/products/${productA.slug}`)).data.product.variants
  .find((v) => v._id === inStockVariant._id).stock;

const order = await api('POST', '/api/orders', {
  addressId: addr.data.address._id,
  paymentMethod: 'COD',
}, { auth: true });
check('place COD order', order.success === true && order.data.order.orderStatus === 'CONFIRMED');
check('order has an order number', /^HV-/.test(order.data.order.orderNumber));
check('order snapshots product name', Boolean(order.data.order.items[0].name));
check('order totals computed', order.data.order.total === order.data.order.subtotal + order.data.order.shippingFee);

const cartAfter = await api('GET', '/api/cart', null, { auth: true });
check('cart is emptied after checkout', cartAfter.data.cart.items.length === 0);

const stockAfter = (await api('GET', `/api/products/${productA.slug}`)).data.product.variants
  .find((v) => v._id === inStockVariant._id).stock;
check('stock decremented on checkout', stockAfter === stockBefore - 1, `(${stockBefore} -> ${stockAfter})`);

const emptyOrder = await api('POST', '/api/orders', {
  addressId: addr.data.address._id,
  paymentMethod: 'COD',
}, { auth: true, raw: true });
check('cannot order with an empty bag', emptyOrder.status === 400);

const onlineOff = await api('POST', '/api/orders', { addressId: addr.data.address._id, paymentMethod: 'ONLINE' }, { auth: true, raw: true });
check('online checkout is refused while PhonePe is off', onlineOff.status === 400 && /online payment is not available/i.test(onlineOff.json.message));

// Regression: the checkout page prefills the delivery contact email from the
// signed-in account. An account on another domain — seeded before the
// Gmail-only rule, or simply never migrated — must never be blocked from
// placing an order by its own email. Uses its own token so the shopper.test
// session above is untouched.
const demoLogin = await api('POST', '/api/auth/login', { email: 'demo@humovare.com', password: 'Humovare@2025' }, { raw: true });
const demoHeaders = { Authorization: `Bearer ${demoLogin.json.data.accessToken}`, 'Content-Type': 'application/json' };
// A different product/variant than productA, whose stock the checks above
// and below track precisely.
const demoProductSlug = saleList.data.products.find((p) => p._id !== productA._id)?.slug ?? saleList.data.products[0].slug;
const demoProduct = (await api('GET', `/api/products/${demoProductSlug}`)).data.product;
const demoVariant = demoProduct.variants.find((v) => v.stock > 0);
await fetch(`${BASE}/api/cart/items`, {
  method: 'POST', headers: demoHeaders,
  body: JSON.stringify({ productId: demoProduct._id, variantId: demoVariant._id, quantity: 1 }),
});
const demoOrder = await fetch(`${BASE}/api/orders`, {
  method: 'POST', headers: demoHeaders,
  body: JSON.stringify({
    shippingAddress: {
      name: 'Demo Shopper', phone: '9876543210', email: 'demo@humovare.com',
      addressLine1: '1 Legacy Lane', city: 'Visakhapatnam', state: 'Andhra Pradesh', postalCode: '530016', country: 'India',
    },
    paymentMethod: 'COD',
  }),
}).then((res) => res.json());
check('a legacy non-Gmail account can place an order (place order is never blocked by its own email)', demoOrder.success === true, JSON.stringify(demoOrder.error ?? ''));

console.log('\n── Orders ──');
const orders = await api('GET', '/api/orders', null, { auth: true });
check('order history lists the order', orders.data.orders.length === 1);

const orderDetail = await api('GET', `/api/orders/${order.data.order._id}`, null, { auth: true });
check('order detail fetch', orderDetail.data.order.orderNumber === order.data.order.orderNumber);

const cancelled = await api('POST', `/api/orders/${order.data.order._id}/cancel`, { reason: 'Changed my mind' }, { auth: true });
check('cancel order', cancelled.data.order.orderStatus === 'CANCELLED');

const stockRestored = (await api('GET', `/api/products/${productA.slug}`)).data.product.variants
  .find((v) => v._id === inStockVariant._id).stock;
check('stock restored after cancel', stockRestored === stockBefore, `(${stockRestored} vs ${stockBefore})`);

const cancelAgain = await api('POST', `/api/orders/${order.data.order._id}/cancel`, {}, { auth: true, raw: true });
check('cannot cancel twice', cancelAgain.status === 409);

console.log('\n── Security ──');
const injection = await api('POST', '/api/auth/login', { email: { $ne: null }, password: { $ne: null } }, { raw: true });
check('NoSQL operator injection blocked', injection.status === 422 || injection.status === 401);

const adminAttempt = await api('POST', '/api/products', { name: 'Hack' }, { auth: true, raw: true });
check('customers cannot create products', [403, 404].includes(adminAttempt.status));

// No customer account — even one whose record says "admin" — reaches catalogue
// or order management: that lives only behind /api/admin.
{
  const { User } = await import('../src/models/User.js');
  const legacyEmail = `legacy.admin.${Date.now()}@gmail.com`;
  const legacy = new User({ name: 'Legacy Admin', email: legacyEmail, role: 'admin' });
  await legacy.setPassword('Humovare@2025');
  await legacy.save();
  const legacyLogin = await api('POST', '/api/auth/login', { email: legacyEmail, password: 'Humovare@2025' });
  const legacyToken = legacyLogin.data.accessToken;
  const asLegacy = (method, path, body) => fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${legacyToken}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  check('a customer "admin" cannot create products', [401, 403, 404].includes((await asLegacy('POST', '/api/products', { name: 'Hack' })).status));
  check('…cannot create categories', [401, 403, 404].includes((await asLegacy('POST', '/api/categories', { name: 'Hack' })).status));
  check('…cannot change an order status', [401, 403, 404].includes((await asLegacy('PATCH', `/api/orders/${'a'.repeat(24)}/status`, { status: 'DELIVERED' })).status));
  check('…and cannot reach the admin API', [401, 403].includes((await asLegacy('GET', '/api/admin/orders')).status));
}

const otherUser = await api('POST', '/api/auth/register', {
  name: 'Other Person', email: 'other.test@gmail.com', password: 'Humovare@2025',
});
const otherToken = otherUser.data.accessToken;
const crossRead = await fetch(`${BASE}/api/orders/${order.data.order._id}`, {
  headers: { Authorization: `Bearer ${otherToken}` },
});
check('cannot read another user\'s order', crossRead.status === 404);

const notFound = await api('GET', '/api/does-not-exist', null, { raw: true });
check('unknown route 404s with envelope', notFound.status === 404 && notFound.json.success === false);

// ── Sign in with Google ──────────────────────────────────────────────────────
// There are no Google keys to sign test tokens with, so the verifier is
// swapped for one that reads the identity from the middle segment and accepts
// only the signature "valid". Everything after verification is the real code.
console.log('\n── Sign in with Google ──');
const { setGoogleVerifier } = await import('../src/services/googleAuth.js');
const { User } = await import('../src/models/User.js');
const { memoryTransport: { outbox } } = await import('../src/services/email/transport.js');
setGoogleVerifier(async (credential) => {
  const [, body, signature] = credential.split('.');
  if (signature !== 'valid') throw new Error('Invalid token signature');
  return JSON.parse(Buffer.from(body, 'base64url').toString());
});

const googleToken = (identity, signature = 'valid') =>
  `header.${Buffer.from(JSON.stringify({ emailVerified: true, name: 'Google Shopper', hostedDomain: null, ...identity })).toString('base64url')}.${signature}`;

// Its own requests, so the shopper session above is untouched.
async function google(credential) {
  const res = await fetch(`${BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})), cookie: res.headers.get('set-cookie') || '' };
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const providersRes = await api('GET', '/api/auth/providers');
check('providers exposes the public Google client ID', providersRes.data?.google?.clientId === 'smoke-test.apps.googleusercontent.com');

const malformed = await google('not-a-jwt');
check('a malformed credential is rejected by validation', malformed.status === 422);

const forged = await google(googleToken({ sub: 'g-forged', email: 'forged.user@gmail.com' }, 'tampered'));
check('a credential that fails verification is refused', forged.status === 401);
check('a forged credential creates no account', (await User.countDocuments({ email: 'forged.user@gmail.com' })) === 0);

const unverified = await google(googleToken({ sub: 'g-unverified', email: 'unverified.user@gmail.com', emailVerified: false }));
check('an unverified Google email is refused', unverified.status === 401);

const firstGoogle = await google(googleToken({ sub: 'g-new-1', email: 'google.shopper@gmail.com' }));
check('first Google sign-in creates an account (201)', firstGoogle.status === 201 && firstGoogle.json.data?.created === true, `(got ${firstGoogle.status} ${firstGoogle.json.message ?? ''})`);
check('Google sign-in returns an access token', Boolean(firstGoogle.json.data?.accessToken));
check('Google sign-in sets the HTTP-only refresh cookie', /HttpOnly/i.test(firstGoogle.cookie));
check('Google account takes the name from Google', firstGoogle.json.data?.user?.name === 'Google Shopper');
check('response leaks neither googleId nor passwordHash', !/googleId|passwordHash/.test(JSON.stringify(firstGoogle.json)));

const googleMe = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${firstGoogle.json.data?.accessToken}` } }).then((r) => r.json());
check('the Google session works on /auth/me', googleMe.data?.user?.email === 'google.shopper@gmail.com');

await new Promise((resolve) => setTimeout(resolve, 300));
check('a new Google account gets the welcome email', outbox.some((mail) => JSON.stringify(mail.to).includes('google.shopper@gmail.com')));

const againGoogle = await google(googleToken({ sub: 'g-new-1', email: 'google.shopper@gmail.com' }));
check('second Google sign-in signs in the same account (200)', againGoogle.status === 200 && againGoogle.json.data?.created === false
  && againGoogle.json.data?.user?.id === firstGoogle.json.data?.user?.id);
check('only one account exists for that Google user', (await User.countDocuments({ email: 'google.shopper@gmail.com' })) === 1);

const workspace = await google(googleToken({ sub: 'g-workspace', email: 'someone@company.com', hostedDomain: 'company.com' }));
check('a new non-Gmail Google account is refused (Gmail-only rule)', workspace.status === 400 && /gmail/i.test(workspace.json.message));

// shopper.test@gmail.com registered with a password earlier.
const linked = await google(googleToken({ sub: 'g-shopper', email: 'shopper.test@gmail.com' }));
check('Google links to an existing Gmail password account', linked.status === 200 && linked.json.data?.user?.id === reg.data.user.id);
// Registration never proved who owned the address, so a password (or a
// session) set before Google linked it may be a squatter's: both stop working.
// The owner can set a password again through "Forgot password".
const oldPassword = await post('/api/auth/login', { email: 'shopper.test@gmail.com', password: 'Humovare@2025' });
check('linking Google retires a password set before the address was proven', oldPassword.status === 401);

const otherGoogle = await google(googleToken({ sub: 'g-someone-else', email: 'shopper.test@gmail.com' }));
check('a different Google account cannot take over a linked email', otherGoogle.status === 409);

// demo@humovare.com: Google is not the authority for that domain.
const notAuthority = await google(googleToken({ sub: 'g-demo', email: 'demo@humovare.com' }));
check('Google cannot claim an account on a domain it does not host', notAuthority.status === 409);

const googleOnlyPassword = await post('/api/auth/login', { email: 'google.shopper@gmail.com', password: 'anything-at-all1' });
check('a Google-only account has no password to guess', googleOnlyPassword.status === 401);

const setPasswordAttempt = await post(
  '/api/auth/change-password',
  { currentPassword: 'x', newPassword: 'Humovare@2026' },
  againGoogle.json.data?.accessToken,
);
check('change-password explains Google-only accounts', setPasswordAttempt.status === 400 && /forgot password/i.test(setPasswordAttempt.json.message));

await User.updateOne({ email: 'google.shopper@gmail.com' }, { isActive: false });
const deactivatedGoogle = await google(googleToken({ sub: 'g-new-1', email: 'google.shopper@gmail.com' }));
check('a deactivated account cannot sign in with Google', deactivatedGoogle.status === 403);

setGoogleVerifier(null);

// ── Summary ──────────────────────────────────────────────────────────────────
// ── Signing out ends the session even after the access token has expired ──
{
  const signUp = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Leaving Soon', email: 'leaving.soon@gmail.com', password: 'Humovare@2025' }),
  });
  const refreshCookie = (signUp.headers.get('set-cookie') || '').split(';')[0];
  // No access token: exactly what a sign-out after 15 idle minutes looks like.
  const out = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: refreshCookie } });
  const after = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { Cookie: refreshCookie } });
  check('sign-out with only the refresh cookie revokes it', out.status === 200 && after.status === 401, `refresh ${after.status}`);
}

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
