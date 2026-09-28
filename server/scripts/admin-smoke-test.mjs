/**
 * End-to-end smoke test for the HUMOVARE admin API.
 *
 *   npm run test:admin --workspace server
 *
 * Boots the real Express app against an in-memory MongoDB and exercises the
 * security model as hard as the happy path: unauthenticated access, customer
 * tokens on admin routes, permission denial, CSRF, lockout, audit logging and
 * the storefront CMS endpoints.
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

Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGODB_URI: mongo.getUri('humovare'),
  JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
  // Never the network: server/.env may hold a live Resend key.
  EMAIL_TRANSPORT: 'memory',
  EMAIL_RETRY_WORKER: 'false',
  // Never the real gateway, even if server/.env holds PhonePe credentials.
  PHONEPE_ENV: '',
  PHONEPE_CLIENT_ID: '',
  PHONEPE_CLIENT_SECRET: '',
  PAYMENT_RECONCILER: 'false',
  CLIENT_URL: 'http://localhost:5173',
  ADMIN_URL: 'http://localhost:5174',
  DISABLE_RATE_LIMIT: 'true',
  // Lets the security tests act as different client IPs via X-Forwarded-For.
  TRUST_PROXY: 'true',
  LOG_LEVEL: 'error',
  SEED_SUPER_ADMIN_EMAIL: 'owner@humovare.test',
  SEED_SUPER_ADMIN_PASSWORD: 'Humovare@Admin2025',
});

console.log('── Seeding ──');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
await connectDB({ autoIndex: false });

const { seedDatabase } = await import('../src/seed/seed.js');
const seedResult = await seedDatabase({ fresh: true });
check('catalogue seeded', seedResult.products === 18);

const { createApp } = await import('../src/app.js');
const server = await new Promise((resolve) => {
  const s = createApp().listen(5299, () => resolve(s));
});
const BASE = 'http://127.0.0.1:5299';

// ── Request helpers ──────────────────────────────────────────────────────────
let adminCookies = '';
let csrfToken = '';

function mergeCookies(existing, setCookie) {
  if (!setCookie) return existing;
  const jar = new Map(
    existing
      .split('; ')
      .filter(Boolean)
      .map((pair) => [pair.split('=')[0], pair]),
  );
  // `getSetCookie` keeps multiple Set-Cookie headers separate.
  for (const raw of setCookie) {
    const pair = raw.split(';')[0];
    jar.set(pair.split('=')[0], pair);
  }
  return [...jar.values()].join('; ');
}

async function adminApi(method, path, body, { useCookies = true, cookies, csrf } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const jar = cookies ?? adminCookies;
  if (useCookies && jar) headers.Cookie = jar;

  const token = csrf ?? csrfToken;
  if (useCookies && token) headers['X-CSRF-Token'] = token;

  const res = await fetch(`${BASE}/api/admin${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (useCookies && setCookie.length && !cookies) {
    adminCookies = mergeCookies(adminCookies, setCookie);
  }

  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, setCookie };
}

async function publicApi(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

// ── 1. Unauthenticated access ────────────────────────────────────────────────
console.log('\n── Admin auth ──');

const noAuth = await adminApi('GET', '/dashboard', null, { useCookies: false });
check('admin dashboard rejects anonymous', noAuth.status === 401);

const noAuthProducts = await adminApi('GET', '/products', null, { useCookies: false });
check('admin products rejects anonymous', noAuthProducts.status === 401);

const badLogin = await adminApi('POST', '/auth/login', {
  email: 'owner@humovare.test',
  password: 'wrong-password',
}, { useCookies: false });
check('wrong admin password 401s', badLogin.status === 401);
check('admin login error does not name the field', /incorrect/i.test(badLogin.json.message));

// ── 2. A customer token must never work on admin routes ──────────────────────
const customerLogin = await publicApi('POST', '/api/auth/login', {
  email: 'demo@humovare.com',
  password: 'Humovare@2025',
});
check('customer can still sign in', customerLogin.status === 200);
const customerToken = customerLogin.json.data.accessToken;

const escalation = await fetch(`${BASE}/api/admin/dashboard`, {
  headers: { Authorization: `Bearer ${customerToken}` },
});
check('customer token rejected on admin route', escalation.status === 401);

const escalationProducts = await fetch(`${BASE}/api/admin/products`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${customerToken}` },
});
check('customer token cannot reach admin writes', [401, 404].includes(escalationProducts.status));


/** Test admins start with a password someone else set; clear that flag so the rest of the run can use them. */
const clearMustChange = async (email) => {
  const { AdminUser: Model } = await import('../src/models/AdminUser.js');
  await Model.updateOne({ email }, { $set: { mustChangePassword: false } });
};

// ── 3. Super admin login ─────────────────────────────────────────────────────
const login = await adminApi('POST', '/auth/login', {
  email: 'owner@humovare.test',
  password: 'Humovare@Admin2025',
}, { useCookies: false });

check('super admin signs in', login.status === 200);
adminCookies = mergeCookies('', login.setCookie);
csrfToken = login.json.data.csrfToken;

check('login sets HTTP-only admin cookies', login.setCookie.some((c) => c.includes('hv_admin_at') && c.includes('HttpOnly')));
check('refresh cookie is HTTP-only', login.setCookie.some((c) => c.includes('hv_admin_rt') && c.includes('HttpOnly')));
check('CSRF cookie is readable by JS', login.setCookie.some((c) => c.includes('hv_admin_csrf') && !c.includes('HttpOnly')));
check('login never returns a password hash', !JSON.stringify(login.json).includes('passwordHash'));
check('super admin has every permission', login.json.data.permissions.length >= 30);

const me = await adminApi('GET', '/auth/me');
check('GET /auth/me returns the admin', me.json.data.user.email === 'owner@humovare.test');
check('mustChangePassword flagged on seeded account', me.json.data.user.mustChangePassword === true);

// Enforced by the server, not just the UI.
const beforeOwnPassword = await adminApi('GET', '/products');
check('a password someone else set opens nothing but the change-password flow', beforeOwnPassword.status === 403 && beforeOwnPassword.json.code === 'PASSWORD_CHANGE_REQUIRED');
check('…while /auth/me still answers', (await adminApi('GET', '/auth/me')).status === 200);
await clearMustChange('owner@humovare.test');
check('once replaced, the panel opens', (await adminApi('GET', '/products')).status === 200);

// ── 4. CSRF ──────────────────────────────────────────────────────────────────
console.log('\n── CSRF ──');

const noCsrf = await adminApi('POST', '/collections', { name: 'CSRF Test' }, { csrf: '' });
check('cookie-auth mutation without CSRF is rejected', noCsrf.status === 403);

const wrongCsrf = await adminApi('POST', '/collections', { name: 'CSRF Test' }, { csrf: 'not-the-token' });
check('mismatched CSRF token is rejected', wrongCsrf.status === 403);

const getWithoutCsrf = await adminApi('GET', '/products', null, { csrf: '' });
check('reads do not require CSRF', getWithoutCsrf.status === 200);

// ── 5. Dashboard ─────────────────────────────────────────────────────────────
console.log('\n── Dashboard ──');

const dashboard = await adminApi('GET', '/dashboard?range=last-30-days');
check('dashboard returns real totals', dashboard.status === 200 && typeof dashboard.json.data.totals.revenue === 'number');
check('dashboard counts products', dashboard.json.data.products.total === 18);
check('dashboard has chart series', Array.isArray(dashboard.json.data.charts.trend));

// ── 6. Products ──────────────────────────────────────────────────────────────
console.log('\n── Catalogue ──');

const products = await adminApi('GET', '/products?limit=5');
check('admin product list paginates', products.json.data.products.length === 5);
check('admin list includes inactive flag', 'isActive' in products.json.data.products[0]);

const firstProduct = products.json.data.products[0];
const priceUpdate = await adminApi('PUT', `/products/${firstProduct._id}`, { price: 1234 });
check('admin can update a product price', priceUpdate.status === 200 && priceUpdate.json.data.product.price === 1234);

// Editing stock rows must keep each variant's id: orders and carts point at it.
{
  const before = priceUpdate.json.data.product.variants;
  const edited = before.map((v) => ({ _id: v._id, size: v.size, color: v.color, stock: v.stock + 1 }));
  const saved = await adminApi('PUT', `/products/${firstProduct._id}`, { variants: edited });
  const after = saved.json.data.product.variants;
  check('saving variants keeps their ids', saved.status === 200 && after.length === before.length
    && after.every((v, i) => String(v._id) === String(before[i]._id)));
  const noIds = before.map((v) => ({ size: v.size, color: v.color, stock: v.stock }));
  const resaved = await adminApi('PUT', `/products/${firstProduct._id}`, { variants: noIds });
  check('…even when the client leaves ids out (matched by colour and size)', resaved.json.data.product.variants
    .every((v, i) => String(v._id) === String(before[i]._id)));
}

const bulk = await adminApi('POST', '/products/bulk', {
  ids: products.json.data.products.map((p) => p._id),
  updates: { isFeatured: true },
});
check('bulk update applies', bulk.json.data.modified === 5);

const bulkRejected = await adminApi('POST', '/products/bulk', {
  ids: [firstProduct._id],
  updates: { price: 1 },
});
check('bulk update refuses non-allowlisted fields', bulkRejected.status === 422 || bulkRejected.status === 400);

// ── Category rules: product types are fully managed, styles only take a new
// image, collections are off-limits, and hiding never makes one vanish.
const managed = await adminApi('GET', '/categories?manage=true');
const managedRows = managed.json.data.categories;
check('manage list holds only product types and styles', managedRows.length > 0 && managedRows.every((c) => ['product-type', 'style'].includes(c.type)));
const aStyle = managedRows.find((c) => c.type === 'style');
const aCollection = (await adminApi('GET', '/categories')).json.data.categories.find((c) => c.type === 'collection');

// The Shop menu holds four product types, and the seed fills it.
const menuTypes = managedRows.filter((c) => c.type === 'product-type' && c.showInNav && c.isActive);
check('seeded Shop menu is at its limit of 4', menuTypes.length === 4);
const overMenu = await adminApi('POST', '/categories', { name: 'Smoke Overflow' });
check('a 5th product type cannot join a full Shop menu', overMenu.status === 409);

const newType = await adminApi('POST', '/categories', { name: 'Smoke Jackets', type: 'style', isVirtual: true, showInNav: false });
check('new categories are always product types', newType.status === 201 && newType.json.data.category.type === 'product-type' && !newType.json.data.category.isVirtual);
const newTypeId = newType.json.data.category._id;

const hidden = await adminApi('PUT', `/categories/${newTypeId}`, { name: 'Smoke Jackets & Coats', isActive: false, type: 'style' });
check('product type can be renamed and hidden', hidden.status === 200 && hidden.json.data.category.name === 'Smoke Jackets & Coats' && hidden.json.data.category.isActive === false);
check('…but its type cannot be changed', hidden.json.data.category.type === 'product-type');
const afterHide = (await adminApi('GET', '/categories?manage=true')).json.data.categories;
check('a hidden product type still appears in the admin list', afterHide.some((c) => c._id === newTypeId));
const publicCats = await publicApi('GET', '/api/categories?manage=true');
check('public category list never includes hidden ones', !publicCats.json.data.categories.some((c) => c._id === newTypeId));

const unhideIntoFullMenu = await adminApi('PUT', `/categories/${newTypeId}`, { isActive: true, showInNav: true });
check('ticking "Show in menu" on a full menu is refused', unhideIntoFullMenu.status === 409);
const freed = await adminApi('PUT', `/categories/${menuTypes[3]._id}`, { showInNav: false });
const swappedIn = await adminApi('PUT', `/categories/${newTypeId}`, { isActive: true, showInNav: true });
check('after freeing a slot, another product type can take it', freed.status === 200 && swappedIn.status === 200);
const navAfterSwap = (await publicApi('GET', '/api/categories/navigation')).json.data.productTypes;
check('storefront Shop menu shows the chosen 4', navAfterSwap.length === 4 && navAfterSwap.some((c) => c._id === newTypeId) && !navAfterSwap.some((c) => c._id === menuTypes[3]._id));
await adminApi('PUT', `/categories/${newTypeId}`, { showInNav: false });
await adminApi('PUT', `/categories/${menuTypes[3]._id}`, { showInNav: true });

const styleImage = await adminApi('PUT', `/categories/${aStyle._id}`, { image: { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' } });
check('style image can be changed', styleImage.status === 200 && styleImage.json.data.category.image?.url.endsWith('sample.jpg'));
const styleRename = await adminApi('PUT', `/categories/${aStyle._id}`, { name: 'Renamed Style' });
check('style name cannot be changed', styleRename.status === 400);
const styleDelete = await adminApi('DELETE', `/categories/${aStyle._id}`);
check('style cannot be deleted', styleDelete.status === 403);
const collectionEdit = await adminApi('PUT', `/categories/${aCollection._id}`, { image: null });
check('collection categories cannot be edited', collectionEdit.status === 403);

const typeDelete = await adminApi('DELETE', `/categories/${newTypeId}`);
check('an unused product type can be deleted', typeDelete.status === 200);

// The exact payload the "New product" screen sends. If this drifts, the admin
// can fill the form in and still be refused, which is the bug this catches.
const categoriesForCreate = await adminApi('GET', '/categories?limit=50');
const realCategory = categoriesForCreate.json.data.categories.find((category) => !category.isVirtual);

const created = await adminApi('POST', '/products', {
  name: 'HUMOVARE Smoke Overshirt',
  shortDescription: 'Created by the smoke test',
  description: 'A product created through the admin create path to prove the form can be submitted.',
  category: realCategory._id,
  gender: 'men',
  fit: 'regular',
  price: 1499,
  mrp: 1999,
  colors: [{ name: 'Oxblood', hex: '#7B1E22' }, { name: 'Black', hex: '#111111' }],
  variants: [
    { size: 'M', color: 'Oxblood', stock: 5, price: null },
    { size: 'L', color: 'Oxblood', stock: 3, price: null },
    { size: 'M', color: 'Black', stock: 7, price: null },
    { size: 'L', color: 'Black', stock: 0, price: null },
  ],
  images: [],
  isActive: true,
  isNewDrop: true,
});
check('admin can create a product', created.status === 201, `status ${created.status}`);

const newProduct = created.json?.data?.product;
check('new product derives its slug', newProduct?.slug === 'humovare-smoke-overshirt');
check('new product totals its variant stock', newProduct?.stock === 15);
check('new product derives its sizes', JSON.stringify(newProduct?.sizes) === JSON.stringify(['M', 'L']));
check('new product generates a SKU per variant', newProduct?.variants?.every((variant) => Boolean(variant.sku)));

// Category is always a product type; a style rides along in `collections`.
const pickerCats = (await adminApi('GET', '/categories')).json.data.categories;
const styleCat = pickerCats.find((c) => c.type === 'style');
const typeCat = pickerCats.find((c) => c.type === 'product-type' && c._id !== String(realCategory._id));
const styleAsCategory = await adminApi('PUT', `/products/${newProduct._id}`, { category: styleCat._id });
check('a style cannot be a product category', styleAsCategory.status === 400);
const typeAsStyle = await adminApi('PUT', `/products/${newProduct._id}`, { collections: [typeCat._id] });
check('a product type cannot be used as a style', typeAsStyle.status === 400);
const styled = await adminApi('PUT', `/products/${newProduct._id}`, { collections: [styleCat._id] });
check('a product can be given a style', styled.status === 200);
const onStylePage = await publicApi('GET', `/api/products?category=${styleCat.slug}&limit=60`);
check('…and then appears on that style page', onStylePage.json.data.products.some((p) => p._id === newProduct._id));
await adminApi('PUT', `/products/${newProduct._id}`, { collections: [] });

// A colour just added in the editor arrives with an empty slug — the exact
// payload that used to fail with "colors.1.slug: String must contain…".
const addColour = await adminApi('PUT', `/products/${newProduct._id}`, {
  colors: [{ name: 'Oxblood', slug: 'oxblood', hex: '#7B1E22' }, { name: 'Red', slug: '', hex: '#ff0000' }],
  variants: [
    { size: 'M', color: 'Oxblood', stock: 1 },
    { size: 'M', color: 'Red', stock: 2 },
  ],
});
check('a newly added colour with an empty slug saves', addColour.status === 200, `status ${addColour.status} ${addColour.json?.message}`);
check('…and gets its slug from its name', addColour.json?.data?.product?.colors?.some((c) => c.name === 'Red' && c.slug === 'red'));
const dupColour = await adminApi('PUT', `/products/${newProduct._id}`, {
  colors: [{ name: 'Red', hex: '#ff0000' }, { name: 'red', hex: '#ee0000' }],
  variants: [{ size: 'M', color: 'Red', stock: 1 }],
});
check('two colours with the same name are refused in words', dupColour.status === 400 && /used twice/.test(dupColour.json?.message ?? ''));

const newOnStorefront = await publicApi('GET', `/api/products/${newProduct.slug}`);
check('a newly created product is visible to customers', newOnStorefront.status === 200);

// Editing the range from the product editor replaces colours and variants.
const rangeEdit = await adminApi('PUT', `/products/${newProduct._id}`, {
  colors: [{ name: 'Sand', hex: '#D8CCB4' }],
  variants: [
    { size: 'S', color: 'Sand', stock: 2, price: null },
    { size: 'M', color: 'Sand', stock: 4, price: null },
  ],
});
check('the variant grid can replace a range', rangeEdit.json?.data?.product?.variants?.length === 2);
check('replacing the range recomputes total stock', rangeEdit.json?.data?.product?.stock === 6);

const missingRequired = await adminApi('POST', '/products', { name: 'Nope' });
check('creating without the required fields is refused', missingRequired.status === 422 || missingRequired.status === 400);

// ── 7. Inventory ─────────────────────────────────────────────────────────────
console.log('\n── Inventory ──');

const inventory = await adminApi('GET', '/inventory?limit=5');
check('inventory pages by product', inventory.json.data.products.length === 5);
check('…each with every one of its variants', inventory.json.data.products.every((p) => p.variants.length === p.variantCount));
check('…and its real total', inventory.json.data.products.every((p) => p.totalStock === p.variants.reduce((n, v) => n + Math.max(v.stock, 0), 0)));
check('inventory reports catalogue totals', typeof inventory.json.data.summary.units === 'number' && inventory.json.data.summary.products >= 18);
check('inventory rows carry a status', ['in', 'low', 'out'].includes(inventory.json.data.items[0].status));

const row = inventory.json.data.items[0];

// Filter by product type. Aggregations do not cast ids, so this also guards
// against the filter silently matching nothing.
const allRows = await adminApi('GET', '/inventory?limit=60');
const typeId = String(allRows.json.data.items[0].category);
const byType = await adminApi('GET', `/inventory?limit=60&category=${typeId}`);
const typeRows = byType.json.data.items;
check('stock can be filtered by product type', typeRows.length > 0);
check('…returning only that type', typeRows.every((item) => String(item.category) === typeId));
check('…and fewer rows than the whole catalogue', byType.json.data.pagination.totalItems < allRows.json.data.pagination.totalItems);
const badType = await adminApi('GET', '/inventory?category=not-an-id');
check('an invalid product type is refused', badType.status === 400);
const stock = await adminApi('PUT', '/inventory', {
  productId: row.productId,
  variantId: row.variantId,
  quantity: 42,
  reason: 'Smoke test restock',
});
check('stock adjustment applies', stock.status === 200 && stock.json.data.stock === 42);
{
  const { Product: ProductModel } = await import('../src/models/Product.js');
  const doc = await ProductModel.findById(row.productId).lean();
  check('…and the product total follows', doc.stock === doc.variants.reduce((n, v) => n + v.stock, 0));
}

const negative = await adminApi('PUT', '/inventory', {
  productId: row.productId,
  variantId: row.variantId,
  quantity: -5,
});
check('negative stock is rejected', negative.status === 422);

// The stock screen batches every edit into one call.
const twoRows = inventory.json.data.items.slice(0, 2);
const bulkStock = await adminApi('PUT', '/inventory/bulk', {
  adjustments: twoRows.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    quantity: 11,
    reason: 'Smoke test stock count',
  })),
});
check('stock edits save in one batch', bulkStock.status === 200 && bulkStock.json.data.updated === 2);
check('a batch reports its failures rather than throwing', bulkStock.json.data.failed === 0);

const history = await adminApi('GET', `/inventory/${row.productId}/history`);
check('stock change is recorded in the ledger', history.json.data.history.length >= 1);

// ── 8. Homepage CMS ──────────────────────────────────────────────────────────
console.log('\n── Homepage CMS ──');

const sections = await adminApi('GET', '/homepage');
check('homepage seeded with sections', sections.json.data.sections.length === 10);

const hero = sections.json.data.sections.find((s) => s.key === 'hero');
check('hero section seeded from the live storefront', hero?.title === 'Built for your' && hero?.highlight === 'movement');

const story = sections.json.data.sections.find((s) => s.key === 'brand-story');
check(
  'brand story seeded with the storefront copy',
  story?.title === 'Not just clothes.' && story?.highlight === 'A way to move.',
);

// Every seeded type must have a renderer in shop/src/pages/Home/HomePage.tsx.
// A type with no renderer would be editable in the admin but invisible to
// customers, which is exactly the fake integration this suite exists to catch.
const RENDERED_TYPES = [
  'hero', 'categories', 'collections', 'productRail', 'brandStory',
  'styleRail', 'quality', 'community', 'trust',
];
check(
  'every seeded section type has a storefront renderer',
  sections.json.data.sections.every((s) => RENDERED_TYPES.includes(s.type)),
  sections.json.data.sections.map((s) => s.type).filter((t) => !RENDERED_TYPES.includes(t)).join(','),
);

const heroUpdate = await adminApi('PUT', `/homepage/sections/${hero._id}`, { title: 'Move different' });
check('hero copy is editable', heroUpdate.json.data.section.title === 'Move different');

const draft = await adminApi('POST', '/homepage/sections', {
  type: 'productRail',
  key: 'smoke-rail',
  name: 'Smoke rail',
  title: 'Draft rail',
  source: 'featured',
  status: 'draft',
});
check('new section can be created', draft.status === 201);

const publicHome = await publicApi('GET', '/api/homepage');
check('public homepage returns published sections', publicHome.json.data.sections.length === 10);
check('draft section is hidden from customers', !publicHome.json.data.sections.some((s) => s.key === 'smoke-rail'));
check('public hero reflects the admin edit', publicHome.json.data.sections[0].title === 'Move different');

const railSection = publicHome.json.data.sections.find((s) => s.key === 'new-drops-rail');
check('product rail is hydrated with products', (railSection?.products?.length ?? 0) > 0);

const categoriesSection = publicHome.json.data.sections.find((s) => s.key === 'categories');
check('categories section is hydrated', (categoriesSection?.categories?.length ?? 0) === 4);

const reorder = await adminApi('PUT', '/homepage/reorder', {
  order: sections.json.data.sections.map((s) => s._id).reverse(),
});
check('sections can be reordered', reorder.status === 200);

// Put the order back so later assertions are not surprised.
await adminApi('PUT', '/homepage/reorder', { order: sections.json.data.sections.map((s) => s._id) });

// ── 9. Shop config ───────────────────────────────────────────────────────────
console.log('\n── Shop config ──');

const shopConfig = await adminApi('GET', '/shop');
check('shop config seeded', shopConfig.json.data.config.filters.length === 6);

const shopUpdate = await adminApi('PUT', '/shop', {
  pageSize: 12,
  defaultSort: 'newest',
  filters: shopConfig.json.data.config.filters.map((f) =>
    f.key === 'fit' ? { ...f, enabled: false } : { key: f.key, label: f.label, enabled: f.enabled, defaultOpen: f.defaultOpen, sortOrder: f.sortOrder },
  ),
});
check('shop config saves', shopUpdate.status === 200);

const publicShop = await publicApi('GET', '/api/shop-config');
check('public shop config drops disabled filters', !publicShop.json.data.config.filters.some((f) => f.key === 'fit'));
check('public shop config honours page size', publicShop.json.data.config.pageSize === 12);
check('public shop config honours default sort', publicShop.json.data.config.defaultSort === 'newest');

// The sidebar only has code for these keys; anything else would render blank.
const SIDEBAR_KEYS = ['availability', 'size', 'colour', 'price', 'fit', 'collection'];
check(
  'public shop filters are all renderable by the sidebar',
  publicShop.json.data.config.filters.every((f) => SIDEBAR_KEYS.includes(f.key)),
);

// ── 10. Collections ──────────────────────────────────────────────────────────
console.log('\n── Collections ──');

const collection = await adminApi('POST', '/collections', {
  name: 'Smoke Collection',
  description: 'Created by the smoke test',
  products: products.json.data.products.slice(0, 3).map((p) => p._id),
  status: 'published',
});
check('collection created', collection.status === 201);

const publicCollections = await publicApi('GET', '/api/collections');
check('published collection is public', publicCollections.json.data.collections.some((c) => c.slug === 'smoke-collection'));

const publicCollection = await publicApi('GET', '/api/collections/smoke-collection');
check('collection keeps its curated order', publicCollection.json.data.collection.products.length === 3);

// ── 11. Orders ───────────────────────────────────────────────────────────────
console.log('\n── Orders ──');

const orders = await adminApi('GET', '/orders');
check('order list responds', orders.status === 200 && Array.isArray(orders.json.data.orders));

// ── 12. RBAC ─────────────────────────────────────────────────────────────────
console.log('\n── RBAC ──');

const contentAdmin = await adminApi('POST', '/admin-users', {
  name: 'Content Person',
  email: 'content@humovare.test',
  password: 'Kestrel#Orbit92',
  role: 'CONTENT_MANAGER',
});
check('super admin can create an admin', contentAdmin.status === 201);
check('created admin must change password', contentAdmin.json.data.admin.mustChangePassword === true);
await clearMustChange('content@humovare.test');

const contentLogin = await adminApi('POST', '/auth/login', {
  email: 'content@humovare.test',
  password: 'Kestrel#Orbit92',
}, { useCookies: false });
const contentCookies = mergeCookies('', contentLogin.setCookie);
const contentCsrf = contentLogin.json.data.csrfToken;

check('content manager signs in', contentLogin.status === 200);
check('content manager has scoped permissions', contentLogin.json.data.permissions.includes('homepage.manage'));
check('content manager lacks order permissions', !contentLogin.json.data.permissions.includes('orders.update'));

const contentOrders = await adminApi('GET', '/orders', null, { cookies: contentCookies, csrf: contentCsrf });
check('content manager blocked from orders', contentOrders.status === 403);

const contentDelete = await adminApi('DELETE', `/products/${firstProduct._id}`, null, {
  cookies: contentCookies,
  csrf: contentCsrf,
});
check('content manager cannot delete products', contentDelete.status === 403);

const contentHomepage = await adminApi('GET', '/homepage', null, { cookies: contentCookies, csrf: contentCsrf });
check('content manager can read the homepage CMS', contentHomepage.status === 200);

const contentAdmins = await adminApi('GET', '/admin-users', null, { cookies: contentCookies, csrf: contentCsrf });
check('content manager cannot list admins', contentAdmins.status === 403);

const contentAudit = await adminApi('GET', '/audit-logs', null, { cookies: contentCookies, csrf: contentCsrf });
check('only super admins read audit logs', contentAudit.status === 403);

const selfElevate = await adminApi('POST', '/admin-users', {
  name: 'Sneaky', email: 'sneaky@humovare.test', password: 'Kestrel#Orbit92', role: 'SUPER_ADMIN',
}, { cookies: contentCookies, csrf: contentCsrf });
check('non-super-admin cannot create a super admin', [403].includes(selfElevate.status));

const contentDeleteAttempt = await adminApi('DELETE', `/admin-users/${contentAdmin.json.data.admin.id}`, null, {
  cookies: contentCookies,
  csrf: contentCsrf,
});
check('non-super-admin cannot delete admins', contentDeleteAttempt.status === 403);

// ── Super-admin-only permanent deletes: orders and customers ─────────────────
{
  const email = `delete.me.${Date.now()}@gmail.com`;
  const reg = await publicApi('POST', '/api/auth/register', { name: 'Delete Me', email, password: 'Humovare@2025' });
  const token = reg.json?.data?.accessToken;
  check('a throwaway customer can register', Boolean(token), `status ${reg.status}`);
  const customerId = reg.json?.data?.user?._id ?? reg.json?.data?.user?.id;

  const catalogue = (await publicApi('GET', '/api/products?limit=60')).json.data.products;
  const detail = (await publicApi('GET', `/api/products/${catalogue[0].slug}`)).json.data.product;
  const variant = detail.variants.find((v) => v.stock > 2);
  await publicApi('POST', '/api/cart/items', { productId: detail._id, variantId: variant._id, quantity: 2 }, token);
  const address = await publicApi('POST', '/api/users/me/addresses', {
    name: 'Delete Me', phone: '9876543210', addressLine1: '1 Test Street',
    city: 'Visakhapatnam', state: 'Andhra Pradesh', postalCode: '530016', country: 'India',
  }, token);
  const placed = await publicApi('POST', '/api/orders', { addressId: address.json.data.address._id, paymentMethod: 'COD' }, token);
  const orderId = placed.json?.data?.order?._id;
  check('the throwaway customer can place an order', Boolean(orderId), `status ${placed.status}`);

  // Team notes stay with the team.
  const noted = await adminApi('POST', `/orders/${orderId}/notes`, { note: 'Team only: fragile, call first' });
  check('admin can add a team note', noted.status === 200 || noted.status === 201, `status ${noted.status}`);
  const customerView = await publicApi('GET', `/api/orders/${orderId}`, null, token);
  const customerJson = JSON.stringify(customerView.json?.data?.order ?? {});
  check('the customer never sees team notes', customerView.status === 200 && !customerJson.includes('Team only'));
  check('…but still gets the status timeline', customerView.json.data.order.statusHistory.every((e) => e.status && e.at && !('note' in e)));
  check('…and no payment internals', !('needsReview' in (customerView.json.data.order.payment ?? {})));

  const stockOf = async () => (await publicApi('GET', `/api/products/${detail.slug}`)).json.data.product
    .variants.find((v) => v._id === variant._id).stock;
  const stockWhileOrdered = await stockOf();

  const orderByContent = await adminApi('DELETE', `/orders/${orderId}`, null, { cookies: contentCookies, csrf: contentCsrf });
  check('non-super-admin cannot delete an order', orderByContent.status === 403);
  const customerByContent = await adminApi('DELETE', `/customers/${customerId}`, null, { cookies: contentCookies, csrf: contentCsrf });
  check('non-super-admin cannot delete a customer', customerByContent.status === 403);

  const orderGone = await adminApi('DELETE', `/orders/${orderId}`);
  check('super admin can delete an order', orderGone.status === 200 && orderGone.json.data.restocked === true);
  check('…its stock goes back on the shelf', (await stockOf()) === stockWhileOrdered + 2);
  check('…it is gone for the admin', (await adminApi('GET', `/orders/${orderId}`)).status === 404);
  const mine = await publicApi('GET', '/api/orders', null, token);
  check('…and gone from the customer\'s account', !(mine.json?.data?.orders ?? []).some((o) => o._id === orderId));

  const customerGone = await adminApi('DELETE', `/customers/${customerId}`);
  check('super admin can delete a customer', customerGone.status === 200);
  check('…the customer is gone for the admin', (await adminApi('GET', `/customers/${customerId}`)).status === 404);
  check('…their session stops working', (await publicApi('GET', '/api/users/me/addresses', null, token)).status === 401);
  const relogin = await publicApi('POST', '/api/auth/login', { email, password: 'Humovare@2025' });
  check('…and they cannot sign in again', relogin.status === 401);

  const audit = await adminApi('GET', '/audit-logs?limit=20');
  const actions = (audit.json?.data?.logs ?? audit.json?.data?.items ?? []).map((l) => l.action);
  check('both deletes are in the audit log', actions.includes('ORDER_DELETED') && actions.includes('CUSTOMER_DELETED'));
}

// ── 13. Disable takes effect immediately ─────────────────────────────────────
console.log('\n── Session revocation ──');

const disable = await adminApi('PUT', `/admin-users/${contentAdmin.json.data.admin.id}/status`, { isActive: false });
check('admin can be disabled', disable.status === 200);

const afterDisable = await adminApi('GET', '/homepage', null, { cookies: contentCookies, csrf: contentCsrf });
check('disabled admin loses access at once', [401, 403].includes(afterDisable.status));

// ── 13b. Permanent deletion ───────────────────────────────────────────────────
console.log('\n── Admin deletion ──');

const { AdminUser } = await import('../src/models/AdminUser.js');
const { AdminSession } = await import('../src/models/AdminSession.js');

const ownerId = (await AdminUser.findOne({ email: 'owner@humovare.test' }))._id.toString();
const ownerSelfDelete = await adminApi('DELETE', `/admin-users/${ownerId}`);
check('a super admin cannot delete their own account', ownerSelfDelete.status === 400);

const sessionsBefore = await AdminSession.countDocuments({ adminUser: contentAdmin.json.data.admin.id });
check('the deleted-to-be admin still has session history', sessionsBefore > 0);

const deleteContent = await adminApi('DELETE', `/admin-users/${contentAdmin.json.data.admin.id}`);
check('super admin deletes the admin', deleteContent.status === 200 && deleteContent.json.data.deleted === true);

const goneFromDb = await AdminUser.findById(contentAdmin.json.data.admin.id);
check('the account is removed from the database', goneFromDb === null);

const sessionsAfter = await AdminSession.countDocuments({ adminUser: contentAdmin.json.data.admin.id });
check('every session for that admin is removed too', sessionsAfter === 0);

const goneFromApi = await adminApi('GET', `/admin-users/${contentAdmin.json.data.admin.id}`);
check('the deleted admin 404s from the API', goneFromApi.status === 404);

const deleteAgain = await adminApi('DELETE', `/admin-users/${contentAdmin.json.data.admin.id}`);
check('deleting it again 404s rather than silently succeeding', deleteAgain.status === 404);

const deleteAuditEntry = (await adminApi('GET', '/audit-logs?limit=60')).json.data.logs
  .find((l) => l.action === 'ADMIN_DELETED');
check('the deletion itself is audited', Boolean(deleteAuditEntry));
check('the audit entry records who was deleted', deleteAuditEntry?.description?.includes('content@humovare.test'));

// ── 14. Security: lockout, sessions, step-up, escalation, reset ────────────
console.log('\n── Security ──');
{
  const { AdminLoginThrottle } = await import('../src/models/AdminLoginThrottle.js');
  const { EmailEvent } = await import('../src/models/EmailEvent.js');
  const { memoryTransport } = await import('../src/services/email/transport.js');
  const { clearFailures, PANEL_KEY } = await import('../src/services/adminLoginGuard.service.js');
  const { AuditLog } = await import('../src/models/AuditLog.js');

  // The per-email and per-network checks below run in 'network' scope; the
  // panel-wide lock (the default) gets its own section further down.
  process.env.ADMIN_LOCKOUT_SCOPE = 'network';

  let ipCounter = 10;
  const nextIp = () => `198.51.100.${ipCounter++}`;
  const rawLogin = (email, password, headers = {}) => fetch(`${BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp(), ...headers },
    body: JSON.stringify({ email, password }),
  }).then(async (res) => ({ status: res.status, headers: res.headers, json: await res.json().catch(() => ({})), setCookie: res.headers.getSetCookie?.() ?? [] }));

  const makeAdmin = async (email, password, extra = {}) => {
    const res = await adminApi('POST', '/admin-users', { name: 'Guard Test', email, password, role: 'ADMIN', ...extra });
    if (res.json?.data?.admin) await clearMustChange(email);
    return res.json?.data?.admin;
  };

  // ── Three strikes, then a 30-minute lock ──
  const target = 'lock.target@humovare.test';
  const targetPass = 'Falcon!River73';
  const targetAdmin = await makeAdmin(target, targetPass);
  check('a test admin is created', Boolean(targetAdmin?.id));

  const first = await rawLogin(target, 'wrong-1');
  check('1st wrong password → 401', first.status === 401 && first.json.code === 'INVALID_CREDENTIALS');
  check('…and says 2 attempts are left', first.json.details?.attemptsRemaining === 2 && /2 attempts left/.test(first.json.message));
  const second = await rawLogin(target, 'wrong-2');
  check('2nd wrong password → 401 with 1 attempt left', second.status === 401 && second.json.details?.attemptsRemaining === 1);
  const third = await rawLogin(target, 'wrong-3');
  check('3rd wrong password locks sign-in immediately (423)', third.status === 423 && third.json.code === 'ACCOUNT_LOCKED');
  check('…for 30 minutes', third.json.details?.retryAfterSeconds > 29 * 60 && third.json.details?.retryAfterSeconds <= 30 * 60);
  check('…with a Retry-After header', Number(third.headers.get('retry-after')) > 29 * 60);
  check('…and a clear message with the time left', /locked for 30 more minutes/.test(third.json.message));

  const rightButLocked = await rawLogin(target, targetPass);
  check('the right password is refused while locked (lock checked first)', rightButLocked.status === 423);
  const otherDevice = await rawLogin(target, targetPass, { 'User-Agent': 'Different-Device/1.0', 'X-Forwarded-For': '203.0.113.9' });
  check('another device / browser cannot bypass the lock', otherDevice.status === 423);
  const stillLocked = await rawLogin(target, targetPass);
  check('retrying (like a page refresh) stays locked', stillLocked.status === 423);

  const lockAudit = (await adminApi('GET', '/audit-logs?limit=60')).json.data.logs.map((l) => l.action);
  check('the lockout is in the audit log', lockAudit.includes('ADMIN_ACCOUNT_LOCKED'));
  const alert = await EmailEvent.findOne({ type: 'ADMIN_SECURITY_ALERT' }).lean();
  check('a lockout alert email is sent for a real admin account', Boolean(alert));

  // ── Unknown emails behave identically (no account enumeration) ──
  const ghost = 'nobody.here@humovare.test';
  const g1 = await rawLogin(ghost, 'wrong-1');
  check('unknown email: same 401 and message as a real account', g1.status === 401 && g1.json.message === first.json.message);
  await rawLogin(ghost, 'wrong-2');
  const g3 = await rawLogin(ghost, 'wrong-3');
  check('unknown email: locks after 3 too, with the same response', g3.status === 423 && g3.json.code === 'ACCOUNT_LOCKED');
  const ghostAlerts = await EmailEvent.countDocuments({ type: 'ADMIN_SECURITY_ALERT', recipient: ghost });
  check('…but no alert email is sent for a made-up address', ghostAlerts === 0);
  const throttleRow = await AdminLoginThrottle.findOne({ kind: 'email' }).lean();
  check('the throttle stores a hash, never the email address', throttleRow && !JSON.stringify(throttleRow).includes('@'));

  // ── Concurrent requests cannot beat the three-attempt limit ──
  const racer = 'race.target@humovare.test';
  const racerPass = 'Heron$Maple58';
  await makeAdmin(racer, racerPass);
  const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => rawLogin(racer, `wrong-${i}`)));
  const burst401 = burst.filter((r) => r.status === 401).length;
  const burst423 = burst.filter((r) => r.status === 423).length;
  check('10 simultaneous wrong attempts: at most 2 are judged, the rest are locked', burst401 <= 2 && burst423 >= 8, `401=${burst401} 423=${burst423}`);
  check('…and the right password is then refused', (await rawLogin(racer, racerPass)).status === 423);

  // ── Lock expiry, and a success resets the count ──
  await AdminLoginThrottle.updateMany({}, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
  const afterExpiry = await rawLogin(target, targetPass);
  check('after the lock expires the right password works', afterExpiry.status === 200);
  await rawLogin(target, 'wrong-a');
  await rawLogin(target, 'wrong-b');
  check('two misses then success…', (await rawLogin(target, targetPass)).status === 200);
  const fresh = await rawLogin(target, 'wrong-c');
  check('…resets the counter (3 attempts again)', fresh.status === 401 && fresh.json.details?.attemptsRemaining === 2);
  await AdminLoginThrottle.deleteMany({});

  // ── Unlock by an administrator ──
  for (let i = 0; i < 3; i += 1) await rawLogin(target, `wrong-${i}`);
  const listed = (await adminApi('GET', '/admin-users?limit=50')).json.data.admins.find((a) => a.email === target);
  check('the admin list shows who is locked out', Boolean(listed?.lockedUntil));
  const unlock = await adminApi('POST', `/admin-users/${targetAdmin.id}/unlock`);
  check('a super admin can lift the lock early', unlock.status === 200);
  check('…and the admin can sign in again', (await rawLogin(target, targetPass)).status === 200);

  // ── Sessions: logout, idle timeout, absolute limit ──
  const s1 = await rawLogin(target, targetPass);
  const s1Cookies = mergeCookies('', s1.setCookie);
  const s1Csrf = s1.json.data.csrfToken;
  check('the session policy is sent to the admin app', s1.json.data.security?.idleMinutes === 30 && s1.json.data.security?.maxLoginAttempts === 3);
  check('a signed-in session works', (await adminApi('GET', '/auth/me', null, { cookies: s1Cookies, csrf: s1Csrf })).status === 200);
  await adminApi('POST', '/auth/logout', null, { cookies: s1Cookies, csrf: s1Csrf });
  const afterLogout = await adminApi('GET', '/auth/me', null, { cookies: s1Cookies, csrf: s1Csrf });
  check('after logout the old access cookie is dead at once', afterLogout.status === 401);

  const s2 = await rawLogin(target, targetPass);
  const s2Cookies = mergeCookies('', s2.setCookie);
  await AdminSession.updateMany({ adminUser: targetAdmin.id, revokedAt: null }, { $set: { lastUsedAt: new Date(Date.now() - 31 * 60 * 1000) } });
  const idle = await adminApi('GET', '/auth/me', null, { cookies: s2Cookies });
  check('31 minutes idle → signed out (SESSION_IDLE)', idle.status === 401 && idle.json.code === 'SESSION_IDLE');
  const idleRefresh = await adminApi('POST', '/auth/refresh', null, { cookies: s2Cookies });
  check('…and the refresh cookie cannot revive it', idleRefresh.status === 401);

  const s3 = await rawLogin(target, targetPass);
  const s3Cookies = mergeCookies('', s3.setCookie);
  await AdminSession.updateMany({ adminUser: targetAdmin.id, revokedAt: null }, { $set: { familyStartedAt: new Date(Date.now() - 13 * 60 * 60 * 1000) } });
  const tooOld = await adminApi('GET', '/auth/me', null, { cookies: s3Cookies });
  check('a session older than 12 hours ends (SESSION_EXPIRED)', tooOld.status === 401 && tooOld.json.code === 'SESSION_EXPIRED');

  // ── Step-up: sensitive actions need a recent password ──
  const ownerDoc = await AdminUser.findOne({ email: 'owner@humovare.test' });
  await AdminSession.updateMany({ adminUser: ownerDoc._id, revokedAt: null }, { $set: { authenticatedAt: new Date(Date.now() - 11 * 60 * 1000) } });
  const stale = await adminApi('PUT', '/settings', { phone: '+91 90000 22222' });
  check('changing settings after 10+ minutes asks for the password again', stale.status === 403 && stale.json.code === 'REAUTH_REQUIRED');
  const staleAdmin = await adminApi('POST', '/admin-users', { name: 'Blocked', email: 'blocked@humovare.test', password: 'Lynx&Cedar4419', role: 'ADMIN' });
  check('…so does creating an admin', staleAdmin.status === 403 && staleAdmin.json.code === 'REAUTH_REQUIRED');
  const badReauth = await adminApi('POST', '/auth/reauth', { password: 'not-it' });
  check('a wrong password does not confirm', badReauth.status === 403 && badReauth.json.code === 'REAUTH_FAILED');
  const goodReauth = await adminApi('POST', '/auth/reauth', { password: 'Humovare@Admin2025' });
  check('the right password confirms', goodReauth.status === 200);
  check('…and the sensitive action then goes through', (await adminApi('PUT', '/settings', { phone: '+91 90000 22222' })).status === 200);

  // ── Privilege escalation ──
  const managerEmail = 'manager@humovare.test';
  const managerPass = 'Otter%Birch662';
  const manager = await makeAdmin(managerEmail, managerPass, {
    grantedPermissions: ['admins.read', 'admins.create', 'admins.update', 'admins.disable'],
  });
  const mLogin = await rawLogin(managerEmail, managerPass);
  const mOpts = { cookies: mergeCookies('', mLogin.setCookie), csrf: mLogin.json.data.csrfToken };
  check('an admin with admin-management rights signs in', mLogin.status === 200);

  const selfGrant = await adminApi('PUT', `/admin-users/${manager.id}`, { grantedPermissions: ['admins.read', 'roles.manage', 'auditlogs.read'] }, mOpts);
  check('an admin cannot grant themselves more permissions', selfGrant.status === 403);
  const resetOwner = await adminApi('PUT', `/admin-users/${ownerDoc._id}/password`, { password: 'Takeover#Owner91' }, mOpts);
  check('an admin cannot reset a super admin\'s password', resetOwner.status === 403);
  const disableOwner = await adminApi('PUT', `/admin-users/${ownerDoc._id}/status`, { isActive: false }, mOpts);
  check('an admin cannot disable a super admin', disableOwner.status === 403);
  const demoteOwner = await adminApi('PUT', `/admin-users/${ownerDoc._id}`, { role: 'ADMIN' }, mOpts);
  check('an admin cannot demote a super admin', demoteOwner.status === 403);

  // A reset password is a taken-over account: only for admins you fully outrank.
  const senior = await makeAdmin('senior@humovare.test', 'Heron#Maple5521', { grantedPermissions: ['auditlogs.read'] });
  const resetSenior = await adminApi('PUT', `/admin-users/${senior.id}/password`, { password: 'Takeover#Senior77' }, mOpts);
  check('an admin cannot reset the password of an admin with more access', resetSenior.status === 403);
  const unlockSenior = await adminApi('POST', `/admin-users/${senior.id}/unlock`, null, mOpts);
  check('…nor unlock them', unlockSenior.status === 403);
  const disableSenior = await adminApi('PUT', `/admin-users/${senior.id}/status`, { isActive: false }, mOpts);
  check('…nor disable them', disableSenior.status === 403);
  const peer = await makeAdmin('peer@humovare.test', 'Plover#Aspen3317');
  const resetPeer = await adminApi('PUT', `/admin-users/${peer.id}/password`, { password: 'Plover#Aspen3318' }, mOpts);
  check('…but can for an admin whose access they hold in full', resetPeer.status === 200, `status ${resetPeer.status}`);

  // Irreversible deletes are for the owner.
  const hardDelete = await adminApi('DELETE', `/products/${firstProduct._id}?hard=true`, null, mOpts);
  check('permanently deleting a product needs a super admin', hardDelete.status === 403);
  const forceMedia = await adminApi('DELETE', `/media/000000000000000000000000?force=true`, null, mOpts);
  check('force-deleting media in use needs a super admin', forceMedia.status === 403);
  const overGrant = await adminApi('POST', '/admin-users', {
    name: 'Over', email: 'over@humovare.test', password: 'Puffin*Stone38', role: 'CONTENT_MANAGER', grantedPermissions: ['auditlogs.read'],
  }, mOpts);
  check('an admin cannot create someone with access they lack', overGrant.status === 403);
  const ownReset = await adminApi('PUT', `/admin-users/${manager.id}/password`, { password: 'Otter%Birch663' }, mOpts);
  check('the admin reset tool cannot be used on your own account', ownReset.status === 400);
  const denied = (await adminApi('GET', '/audit-logs?limit=80')).json.data.logs.filter((l) => l.action === 'ADMIN_ACCESS_DENIED');
  check('refused requests are recorded in the audit log', denied.length > 0);

  // ── Password policy ──
  const weak = await adminApi('POST', '/admin-users', { name: 'Weak', email: 'weak@humovare.test', password: 'short1!', role: 'ADMIN' });
  check('a short admin password is rejected', weak.status === 422);
  const guessable = await adminApi('POST', '/admin-users', { name: 'Guess', email: 'guess@humovare.test', password: 'Humovare@Store2026', role: 'ADMIN' });
  check('a password containing the store name is rejected', guessable.status === 400 && guessable.json.code === 'WEAK_PASSWORD');
  const personal = await adminApi('POST', '/admin-users', { name: 'Priya Raman', email: 'priya@humovare.test', password: 'Priya#Summer2026', role: 'ADMIN' });
  check('a password containing the admin\'s own name is rejected', personal.status === 400);

  // ── Forgot / reset password ──
  memoryTransport.reset();
  const forgotUnknown = await adminApi('POST', '/auth/forgot-password', { email: 'nobody.here@humovare.test' }, { useCookies: false });
  const forgotKnown = await adminApi('POST', '/auth/forgot-password', { email: target }, { useCookies: false });
  check('forgot password answers the same for known and unknown emails', forgotUnknown.status === 200 && forgotKnown.json.message === forgotUnknown.json.message);
  await new Promise((resolve) => { setTimeout(resolve, 300); });
  const resetMail = memoryTransport.outbox.find((m) => m.to === target);
  check('a reset email goes only to the real admin', Boolean(resetMail) && memoryTransport.outbox.every((m) => m.to !== 'nobody.here@humovare.test'));
  const token = resetMail?.text?.match(/token=([a-f0-9]{64})/)?.[1];
  check('the email carries a one-time link', Boolean(token));
  const stored = await AdminUser.findOne({ email: target }).select('+resetTokenHash').lean();
  check('only a hash of the token is stored', stored?.resetTokenHash && stored.resetTokenHash !== token);

  const liveBefore = await rawLogin(target, targetPass);
  const liveCookies = mergeCookies('', liveBefore.setCookie);
  for (let i = 0; i < 3; i += 1) await rawLogin(target, `wrong-${i}`);
  const weakReset = await adminApi('POST', '/auth/reset-password', { token, password: 'weakpass' }, { useCookies: false });
  check('a weak new password is refused on reset', weakReset.status === 422);
  const newPass = 'Condor^Willow85';
  const didReset = await adminApi('POST', '/auth/reset-password', { token, password: newPass }, { useCookies: false });
  check('the link resets the password', didReset.status === 200);
  const reuse = await adminApi('POST', '/auth/reset-password', { token, password: 'Another^Pass777' }, { useCookies: false });
  check('the same link cannot be used twice', reuse.status === 400 && reuse.json.code === 'RESET_TOKEN_INVALID');
  check('existing sessions are signed out by a reset', (await adminApi('GET', '/auth/me', null, { cookies: liveCookies })).status === 401);
  check('a reset lifts the sign-in lock; the new password works', (await rawLogin(target, newPass)).status === 200);
  check('the old password no longer works', (await rawLogin(target, targetPass)).status === 401);
  const bogus = await adminApi('POST', '/auth/reset-password', { token: 'f'.repeat(64), password: newPass }, { useCookies: false });
  check('an invented token is refused', bogus.status === 400);

  // ── Whole admin panel blocked for a network after 3 wrong passwords ──
  const attackerIp = '192.0.2.50';
  const fromIp = (ip) => ({ 'X-Forwarded-For': ip });
  const n1 = await rawLogin('first.guess@humovare.test', 'x1', fromIp(attackerIp));
  check('same network, 1st wrong password → 401 with 2 left', n1.status === 401 && n1.json.details?.attemptsRemaining === 2);
  const n2 = await rawLogin('second.guess@humovare.test', 'x2', fromIp(attackerIp));
  check('switching to another email does not reset the network count', n2.status === 401 && n2.json.details?.attemptsRemaining === 1);
  const n3 = await rawLogin('third.guess@humovare.test', 'x3', fromIp(attackerIp));
  check('3rd wrong password from one network blocks the whole panel (IP_BLOCKED)', n3.status === 423 && n3.json.code === 'IP_BLOCKED');
  check('…for 30 minutes', n3.json.details?.retryAfterSeconds > 29 * 60 && n3.json.details?.retryAfterSeconds <= 30 * 60);

  const statusAfterRefresh = await fetch(`${BASE}/api/admin/auth/status`, { headers: fromIp(attackerIp) });
  check('reloading the admin panel from that network still shows it blocked', statusAfterRefresh.status === 423);
  const ownerFromBlocked = await rawLogin('owner@humovare.test', 'Humovare@Admin2025', fromIp(attackerIp));
  check('even the correct password is refused from that network', ownerFromBlocked.status === 423 && ownerFromBlocked.json.code === 'IP_BLOCKED');
  const forgotFromBlocked = await fetch(`${BASE}/api/admin/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...fromIp(attackerIp) }, body: JSON.stringify({ email: target }),
  });
  check('password reset is refused from that network', forgotFromBlocked.status === 423);
  const sessionFromBlocked = await fetch(`${BASE}/api/admin/auth/me`, { headers: { Cookie: adminCookies, ...fromIp(attackerIp) } });
  check('an already signed-in session on that network is refused too', sessionFromBlocked.status === 423);
  const newBrowser = await fetch(`${BASE}/api/admin/auth/status`, { headers: { 'User-Agent': 'Another-Browser/2.0', ...fromIp(attackerIp) } });
  check('a different browser on the same network is still blocked', newBrowser.status === 423);
  const otherNetwork = await fetch(`${BASE}/api/admin/auth/status`, { headers: fromIp('192.0.2.51') });
  check('other networks are not affected', otherNetwork.status === 200);
  const shopFromBlocked = await fetch(`${BASE}/api/products?limit=1`, { headers: fromIp(attackerIp) });
  check('the storefront keeps working for the blocked network', shopFromBlocked.status === 200);
  check('the block is in the audit log', await (async () => ((await adminApi('GET', '/audit-logs?action=ADMIN_IP_BLOCKED&limit=1')).json?.data?.logs?.length ?? 0) > 0)());

  const managerSees = await adminApi('GET', '/security/blocked-ips', null, mOpts);
  check('only super admins can see blocked networks', managerSees.status === 403);
  const blocks = (await adminApi('GET', '/security/blocked-ips')).json?.data?.blocks ?? [];
  const block = blocks.find((b) => b.ip === attackerIp);
  check('a super admin sees the blocked network', Boolean(block));
  const lift = await adminApi('DELETE', `/security/blocked-ips/${block?.id}`);
  check('…and can lift the block early', lift.status === 200);
  check('the network can sign in again once lifted', (await rawLogin('owner@humovare.test', 'Humovare@Admin2025', fromIp(attackerIp))).status === 200);

  const burstIp = '192.0.2.77';
  const ipBurst = await Promise.all(Array.from({ length: 10 }, (_, i) => rawLogin(`burst${i}@humovare.test`, 'nope', fromIp(burstIp))));
  const ipBurst401 = ipBurst.filter((r) => r.status === 401).length;
  check('10 simultaneous guesses at different emails from one network: at most 2 judged', ipBurst401 <= 2 && ipBurst.filter((r) => r.status === 423).length >= 8, `401=${ipBurst401}`);
  await AdminLoginThrottle.deleteMany({});

  // ── Default scope: 3 wrong passwords lock the WHOLE panel for everyone ──
  process.env.ADMIN_LOCKOUT_SCOPE = 'panel';
  await AdminLoginThrottle.deleteMany({});
  memoryTransport.reset();

  const p1 = await rawLogin('guess.one@humovare.test', 'x1', fromIp('203.0.113.10'));
  check('panel scope: 1st wrong password → 401 with 2 left', p1.status === 401 && p1.json.details?.attemptsRemaining === 2);
  const p2 = await rawLogin('guess.two@humovare.test', 'x2', fromIp('203.0.113.11'));
  check('…a different email from a different network still counts (1 left)', p2.status === 401 && p2.json.details?.attemptsRemaining === 1);
  const p3 = await rawLogin('guess.three@humovare.test', 'x3', fromIp('203.0.113.12'));
  check('3rd wrong password anywhere locks the whole admin panel (PANEL_LOCKED)', p3.status === 423 && p3.json.code === 'PANEL_LOCKED' && p3.json.details?.scope === 'panel');
  check('…for 30 minutes', p3.json.details?.retryAfterSeconds > 29 * 60 && p3.json.details?.retryAfterSeconds <= 30 * 60);

  const ownerDuringLock = await adminApi('GET', '/auth/me');
  check('a super admin already signed in is locked out too', ownerDuringLock.status === 423 && ownerDuringLock.json.code === 'PANEL_LOCKED');
  const cleanNetwork = await fetch(`${BASE}/api/admin/auth/status`, { headers: fromIp('198.18.0.1') });
  check('a completely different network is locked out too', cleanNetwork.status === 423);
  const rightPasswordDuringLock = await rawLogin('owner@humovare.test', 'Humovare@Admin2025', fromIp('198.18.0.2'));
  check('even the correct owner password is refused during the lock', rightPasswordDuringLock.status === 423);
  const forgotDuringLock = await fetch(`${BASE}/api/admin/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...fromIp('198.18.0.3') }, body: JSON.stringify({ email: target }),
  });
  check('password reset is refused during the lock', forgotDuringLock.status === 423);
  const shopDuringLock = await fetch(`${BASE}/api/products?limit=1`, { headers: fromIp('198.18.0.4') });
  check('the storefront keeps working during the lock', shopDuringLock.status === 200);
  check('the panel lock is in the audit log', Boolean(await AuditLog.findOne({ action: 'ADMIN_PANEL_LOCKED' }).lean()));
  await new Promise((resolve) => { setTimeout(resolve, 300); });
  check('super admins are emailed that the panel locked', memoryTransport.outbox.some((m) => m.to === 'owner@humovare.test' && /locked for everyone/i.test(m.subject)));

  // Lifting it is a server-side action (npm run security:unblock does this).
  await clearFailures(PANEL_KEY);
  check('once lifted, the panel works again', (await adminApi('GET', '/auth/me')).status === 200);

  await rawLogin('miss.a@humovare.test', 'x', fromIp('203.0.113.20'));
  await rawLogin('miss.b@humovare.test', 'x', fromIp('203.0.113.21'));
  check('two misses, then a correct sign-in…', (await rawLogin('owner@humovare.test', 'Humovare@Admin2025', fromIp('203.0.113.22'))).status === 200);
  const afterSuccess = await rawLogin('miss.c@humovare.test', 'x', fromIp('203.0.113.23'));
  check('…resets the panel count to 3 again', afterSuccess.status === 401 && afterSuccess.json.details?.attemptsRemaining === 2);

  await AdminLoginThrottle.deleteMany({});
  const panelBurst = await Promise.all(Array.from({ length: 10 }, (_, i) => rawLogin(`wave${i}@humovare.test`, 'nope', fromIp(`203.0.113.${40 + i}`))));
  const panelBurst401 = panelBurst.filter((r) => r.status === 401).length;
  check('10 simultaneous guesses from 10 networks: at most 2 judged, then locked', panelBurst401 <= 2 && panelBurst.filter((r) => r.status === 423).length >= 8, `401=${panelBurst401}`);
  await clearFailures(PANEL_KEY);
  await AdminLoginThrottle.deleteMany({});
  delete process.env.ADMIN_LOCKOUT_SCOPE;

  // ── Headers, tampering, leaks ──
  const headerCheck = await fetch(`${BASE}/api/admin/auth/me`, { headers: { Cookie: adminCookies } });
  check('admin responses are never cached', /no-store/.test(headerCheck.headers.get('cache-control') ?? ''));
  check('admin responses cannot be framed', (headerCheck.headers.get('x-frame-options') ?? '').toUpperCase() === 'DENY');
  const [h, pl, sig] = (s1.json.data.accessToken ?? '').split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(pl, 'base64url').toString()), role: 'SUPER_ADMIN' })).toString('base64url');
  const forged = await fetch(`${BASE}/api/admin/auth/me`, { headers: { Authorization: `Bearer ${h}.${forgedPayload}.${sig}` } });
  check('a tampered token is rejected', forged.status === 401);
  const badId = await adminApi('GET', '/orders/not-an-id');
  check('errors never include stack traces', !JSON.stringify(badId.json).includes('at ') || !/\.js:\d+/.test(JSON.stringify(badId.json)));
  const loginBody = JSON.stringify(s1.json);
  check('the login response never echoes the password', !loginBody.includes(targetPass));
}

// ── 15. Audit trail ──────────────────────────────────────────────────────────
console.log('\n── Audit log ──');

const audit = await adminApi('GET', '/audit-logs?limit=60');
check('audit log is readable by super admin', audit.status === 200);

// Looked up per action: the security tests above add enough entries that the
// latest page no longer reaches back to the catalogue edits.
const hasAction = async (action) => ((await adminApi('GET', `/audit-logs?action=${action}&limit=1`)).json?.data?.logs?.length ?? 0) > 0;
const actions = [];
for (const action of ['ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED', 'PRICE_CHANGED', 'STOCK_CHANGED', 'HOMEPAGE_SECTION_UPDATED', 'SHOP_CONFIG_UPDATED', 'ADMIN_CREATED']) {
  if (await hasAction(action)) actions.push(action);
}
check('login is audited', actions.includes('ADMIN_LOGIN'));
check('failed login is audited', actions.includes('ADMIN_LOGIN_FAILED'));
check('price change is audited', actions.includes('PRICE_CHANGED'));
check('stock change is audited', actions.includes('STOCK_CHANGED'));
check('homepage edit is audited', actions.includes('HOMEPAGE_SECTION_UPDATED'));
check('shop config change is audited', actions.includes('SHOP_CONFIG_UPDATED'));
check('admin creation is audited', actions.includes('ADMIN_CREATED'));
check('audit entries never contain a password', !JSON.stringify(audit.json).includes('Kestrel#Orbit92') && !JSON.stringify(audit.json).includes('Humovare@Admin2025'));

const auditWrite = await adminApi('DELETE', '/audit-logs');
check('audit log has no delete route', auditWrite.status === 404);

// ── 15b. Retention ────────────────────────────────────────────────────────────
console.log('\n── Audit log retention ──');

check('the API reports the retention window', audit.json.data.retentionDays === 3);
check('the page copy would read "3 days" from the same value', audit.json.data.retentionDays > 0);

const { AuditLog } = await import('../src/models/AuditLog.js');
const { env } = await import('../src/config/env.js');
const { ensureAuditLogRetention } = await import('../src/services/audit.service.js');

const recentEntry = await AuditLog.findOne({ action: 'ADMIN_CREATED' }).sort({ createdAt: -1 }).lean();
check('a new entry gets an expiry at write time', recentEntry?.expiresAt instanceof Date);
const expectedExpiry = new Date(recentEntry.createdAt).getTime() + env.auditLog.retentionDays * 86400000;
check('…set to createdAt plus the retention window', Math.abs(new Date(recentEntry.expiresAt).getTime() - expectedExpiry) < 5000);

check('the TTL index exists on expiresAt', (await AuditLog.collection.indexes())
  .some((i) => i.key?.expiresAt === 1 && i.expireAfterSeconds === 0));

// A "legacy" entry from before this feature existed: no expiresAt yet, and
// already well past what the current retention window would allow.
const legacy = await AuditLog.create({
  action: 'ADMIN_LOGIN', description: 'pre-retention entry', status: 'success',
  createdAt: new Date(Date.now() - 10 * 86400000), expiresAt: null,
});
await AuditLog.collection.updateOne({ _id: legacy._id }, { $set: { createdAt: new Date(Date.now() - 10 * 86400000) } });

// A legacy entry that is NOT yet overdue — it should survive, just get an expiry.
const legacyRecent = await AuditLog.create({
  action: 'ADMIN_LOGIN', description: 'pre-retention entry, still fresh', status: 'success', expiresAt: null,
});

await ensureAuditLogRetention();

check('an overdue legacy entry is purged immediately, not left for Mongo\'s background sweep', (await AuditLog.findById(legacy._id)) === null);
const stillHere = await AuditLog.findById(legacyRecent._id).lean();
check('a legacy entry that is not yet overdue survives and is backfilled', stillHere !== null && stillHere.expiresAt instanceof Date);
check('running retention again is a no-op (nothing left without an expiry)', (await AuditLog.countDocuments({ expiresAt: null })) === 0);

// ── 16. Settings ─────────────────────────────────────────────────────────────
console.log('\n── Settings ──');

const settings = await adminApi('GET', '/settings');
check('store settings seeded', settings.json.data.settings.storeName === 'HUMOVARE');

const settingsUpdate = await adminApi('PUT', '/settings', { shipping: { freeShippingThreshold: 1499 } });
check('settings update saves', settingsUpdate.json.data.settings.shipping.freeShippingThreshold === 1499);

const badSettings = await adminApi('PUT', '/settings', { notAField: true });
check('unknown settings fields are rejected', badSettings.status === 422);

// ── 17. Storefront untouched ─────────────────────────────────────────────────
console.log('\n── Storefront still works ──');

// ── 12. Collections on the storefront ────────────────────────────────────────
console.log('\n── Collections ──');

const collectionsSection = sections.json.data.sections.find((s) => s.type === 'collections');
check('home page has a collections section', Boolean(collectionsSection));

const beforeCollections = await publicApi('GET', '/api/homepage');
const gridBefore = beforeCollections.json.data.sections.find((s) => s.type === 'collections');
const countBefore = gridBefore?.collections?.length ?? 0;

const curated = await adminApi('POST', '/collections', {
  name: 'Smoke Edit',
  description: 'Three pieces chosen by hand.',
  status: 'published',
  products: products.json.data.products.slice(0, 3).map((p) => p._id),
});
check('a collection can be published', curated.status === 201);
const curatedSlug = curated.json.data.collection.slug;

const afterCollections = await publicApi('GET', '/api/homepage');
const grid = afterCollections.json.data.sections.find((s) => s.type === 'collections');
check('a published collection appears on the home page', (grid?.collections?.length ?? 0) === countBefore + 1);
check('the grid carries a product count', grid?.collections?.every((c) => c.productCount > 0));
check(
  'the grid names the collection just published',
  grid?.collections?.some((c) => c.slug === curatedSlug),
);

const listedCollections = await publicApi('GET', '/api/collections');
check(
  'collections are listed publicly',
  listedCollections.json.data.collections.some((c) => c.slug === curatedSlug),
);

const filtered = await publicApi('GET', `/api/products?collections=${curatedSlug}`);
check('the shop can be filtered to a collection', filtered.json.data.products.length === 3);

const filterKeys = publicShop.json.data.config.filters.map((f) => f.key);
check('the shop config offers a collection filter', filterKeys.includes('collection'));

const unknownCollection = await publicApi('GET', '/api/products?collections=not-a-collection');
check('an unknown collection is refused, not silently ignored', unknownCollection.status === 404);

// ── 13. Feedback ─────────────────────────────────────────────────────────────
console.log('\n── Feedback ──');

const sentFeedback = await publicApi('POST', '/api/feedback', {
  name: 'Smoke Tester',
  email: 'smoke.tester@gmail.com',
  topic: 'order',
  subject: 'Where is my parcel',
  message: 'It has been a week and the tracking has not moved at all.',
});
check('anyone can send a message from the contact form', sentFeedback.status === 201);
check('the contact form does not echo the message back', !JSON.stringify(sentFeedback.json.data).includes('tracking'));

const outlookFeedback = await publicApi('POST', '/api/feedback', {
  name: 'Outlook Person', email: 'someone@outlook.com', message: 'Trying the contact form from Outlook.',
});
check('the contact form only accepts Gmail addresses', outlookFeedback.status === 422 || outlookFeedback.status === 400);

const badFeedback = await publicApi('POST', '/api/feedback', { name: 'X', email: 'nope', message: 'hi' });
check('an invalid contact message is refused', badFeedback.status === 422 || badFeedback.status === 400);

const inbox = await adminApi('GET', '/feedback');
check('the message lands in the admin inbox', inbox.json.data.messages.length === 1);
check('the inbox counts what is unread', inbox.json.data.unread === 1);
const feedbackId = inbox.json.data.messages[0]._id;

const readFeedback = await adminApi('PUT', `/feedback/${feedbackId}`, { status: 'replied', note: 'Chased the courier' });
check('a message can be marked replied', readFeedback.json.data.message.status === 'replied');

const customerInbox = await fetch(`${BASE}/api/admin/feedback`, {
  headers: { Authorization: `Bearer ${customerToken}` },
});
check('a customer token cannot read the inbox', customerInbox.status === 401);

const feedbackAudited = await adminApi('GET', '/audit-logs?limit=100');
const auditActions = feedbackAudited.json.data.logs.map((log) => log.action);
check('inbox changes are audited', auditActions.includes('FEEDBACK_UPDATED'));
check('a customer message is never copied into the audit log',
  !JSON.stringify(feedbackAudited.json.data.logs).includes('tracking has not moved'));

const storefrontProducts = await publicApi('GET', '/api/products?limit=4');
check('customer product listing still works', storefrontProducts.json.data.products.length === 4);

const storefrontNav = await publicApi('GET', '/api/categories/navigation');
check('customer navigation still works', storefrontNav.json.data.productTypes.length === 4);

// ── Instagram wall ───────────────────────────────────────────────────────────
// The wall is the community section, edited from its own admin screen. What
// matters is that a link saved there survives the round trip to the
// storefront, because the embed is built from that permalink alone.
console.log('\n── Instagram wall ──');

const wall = sections.json.data.sections.find((s) => s.type === 'community');
check('the home page has a community section to hold the wall', Boolean(wall));

const savedWall = await adminApi('PUT', `/homepage/sections/${wall._id}`, {
  title: 'Community',
  description: 'As seen on Instagram',
  items: [
    { id: 'p1', url: 'https://www.instagram.com/p/CwxK9zFtpJO/', caption: 'Studio shot' },
    { id: 'p2', url: 'https://www.instagram.com/reel/Cy8vCYfgU3K/', caption: 'Behind the print' },
  ],
});
check('Instagram posts can be saved to the wall', savedWall.status === 200);

const publicWall = await publicApi('GET', '/api/homepage');
const liveWall = publicWall.json.data.sections.find((s) => s.type === 'community');
check('the wall reaches the storefront', liveWall?.items?.length === 2);
check(
  'each post keeps the permalink the embed is built from',
  liveWall.items.every((item) => /instagram\.com\/(p|reel)\//.test(item.url)),
);
check('a caption rides along for when the embed cannot load', liveWall.items[0].caption === 'Studio shot');
check('the wall heading is editable', liveWall.description === 'As seen on Instagram');

// ── 14. Upgrading an older database ──────────────────────────────────────────
// A database seeded by an earlier version of this code must come back in step
// when the seed is re-run — without that, an upgrade leaves a filter panel
// that renders nothing and a section that never appears, and the only fix
// anyone finds is wiping the data.
console.log('\n── Upgrade path ──');

const { ShopConfig } = await import('../src/models/ShopConfig.js');
const { HomepageSection } = await import('../src/models/HomepageSection.js');
const { seedAdmin } = await import('../src/seed/seedAdmin.js');

// Wind the database back to how an older install looks.
await ShopConfig.updateOne(
  { key: 'default' },
  { $push: { filters: { key: 'fit', label: 'Fabric', enabled: true, defaultOpen: false, sortOrder: 9 } } },
);
await ShopConfig.collection.updateOne(
  { key: 'default' },
  { $set: { 'filters.$[last].key': 'fabric' } },
  { arrayFilters: [{ 'last.label': 'Fabric' }] },
);
await HomepageSection.deleteOne({ key: 'collections' });

const staleConfig = await ShopConfig.findOne({ key: 'default' }).lean();
check('the old shape was restored for the test', staleConfig.filters.some((f) => f.key === 'fabric'));

await seedAdmin({});

const healed = await ShopConfig.findOne({ key: 'default' }).lean();
check('re-seeding retires a filter the storefront dropped', !healed.filters.some((f) => f.key === 'fabric'));
check('re-seeding keeps the filters that still exist', healed.filters.some((f) => f.key === 'size'));

const restored = await HomepageSection.findOne({ key: 'collections' }).lean();
check('re-seeding restores a section added by a newer version', Boolean(restored));

const siblings = await HomepageSection.find({ sortOrder: restored.sortOrder }).lean();
check('the restored section does not collide with an existing position', siblings.length === 1);

const publicAfterUpgrade = await publicApi('GET', '/api/shop-config');
check(
  'the storefront no longer offers the retired filter',
  !publicAfterUpgrade.json.data.config.filters.some((f) => f.key === 'fabric'),
);

// Re-running must be a no-op, not a second set of changes.
const before = await HomepageSection.countDocuments({});
await seedAdmin({});
const after = await HomepageSection.countDocuments({});
check('re-seeding twice changes nothing the second time', before === after);

// ── Settings reach the storefront and checkout ──────────────────────────────
{
  const original = (await adminApi('GET', '/settings')).json.data.settings;

  const saved = await adminApi('PUT', '/settings', {
    phone: '+91 90000 11111',
    whatsapp: 'https://wa.me/919000011111',
    shipping: { ...original.shipping, shippingFee: 49, freeShippingThreshold: 5000, codEnabled: true, codMaxOrderValue: 100 },
    returns: { ...original.returns, windowDays: 10 },
  });
  check('admin can save settings', saved.status === 200, `status ${saved.status}`);

  const pub = (await publicApi('GET', '/api/settings')).json?.data?.settings;
  check('the storefront sees the new phone at once', pub?.phone === '+91 90000 11111');
  check('…the new WhatsApp link', pub?.whatsapp === 'https://wa.me/919000011111');
  check('…the new shipping fee and free-shipping threshold', pub?.shipping?.shippingFee === 49 && pub?.shipping?.freeShippingThreshold === 5000);
  check('…and the new return window', pub?.returns?.windowDays === 10);
  check('the public settings expose nothing internal', !('updatedBy' in (pub ?? {})) && !('_id' in (pub ?? {})));

  // The fee is charged, not just displayed.
  const bag = await publicApi('GET', '/api/cart', null, customerToken);
  const summary = bag.json?.data?.cart?.summary;
  if (summary && summary.subtotal > 0 && summary.subtotal < 5000) {
    check('the bag charges the new shipping fee', summary.shippingFee === 49, `fee ${summary.shippingFee}`);
  }
  check('the bag reports the new free-shipping threshold', summary?.freeShippingThreshold === 5000);

  const methods = (await publicApi('GET', '/api/orders/payment-methods')).json.data.methods;
  const cod = methods.find((m) => m.method === 'COD');
  check('checkout is told the COD limit', cod?.enabled === true && cod?.maxOrderValue === 100);

  // A COD order above the limit is refused by the server, whatever the page shows.
  const email = `cod.limit.${Date.now()}@gmail.com`;
  const reg = await publicApi('POST', '/api/auth/register', { name: 'Cod Limit', email, password: 'Humovare@2025' });
  const token = reg.json?.data?.accessToken;
  const catalogue = (await publicApi('GET', '/api/products?limit=60')).json.data.products;
  const detail = (await publicApi('GET', `/api/products/${catalogue[0].slug}`)).json.data.product;
  const variant = detail.variants.find((v) => v.stock > 1);
  await publicApi('POST', '/api/cart/items', { productId: detail._id, variantId: variant._id, quantity: 1 }, token);
  const addAddress = (city, state, postalCode = '530016') => publicApi('POST', '/api/users/me/addresses', {
    name: 'Cod Limit', phone: '9876543210', addressLine1: '1 Test Street',
    city, state, postalCode, country: 'India',
  }, token).then((res) => res.json.data.address._id);
  const codOrder = (addressId) => publicApi('POST', '/api/orders', { addressId, paymentMethod: 'COD' }, token);

  const inCity = await addAddress('Visakhapatnam', 'Andhra Pradesh');
  const overLimit = await codOrder(inCity);
  check('a COD order over the limit is refused', overLimit.status === 400 && /up to/.test(overLimit.json?.message ?? ''), `status ${overLimit.status}`);

  // ── COD only for Visakhapatnam (on by default) ──
  check('checkout is told COD is for Visakhapatnam only', cod?.area?.city === 'Visakhapatnam' && cod?.area?.state === 'Andhra Pradesh');
  check('…and so is the storefront', pub?.cod?.area?.city === 'Visakhapatnam');

  const bengaluru = await addAddress('Bengaluru', 'Karnataka', '560025');
  const mismatched = await publicApi('POST', '/api/users/me/addresses', {
    name: 'Cod Limit', phone: '9876543210', addressLine1: '1 Test Street',
    city: 'Visakhapatnam', state: 'Andhra Pradesh', postalCode: '110001', country: 'India',
  }, token);
  check('a "Visakhapatnam" address with a Delhi PIN cannot be saved', mismatched.status === 422 && /not a Visakhapatnam PIN/.test(mismatched.json?.message ?? ''));
  const typedMismatch = await publicApi('POST', '/api/orders', {
    paymentMethod: 'COD',
    shippingAddress: { name: 'Cod Limit', phone: '9876543210', addressLine1: '1 Test Street', city: 'Vizag', state: 'Andhra Pradesh', postalCode: '520013', country: 'India' },
  }, token);
  check('…nor typed in at checkout', typedMismatch.status === 422);
  check('checkout gets the Visakhapatnam PIN list with areas', cod?.area?.pinAreas?.length === 20
    && cod.area.pinAreas.some((a) => a.pin === '530017' && a.area === 'MVP Colony'));
  const unlisted = await codOrder(await addAddress('Visakhapatnam', 'Andhra Pradesh', '530099').catch(() => null));
  check('a 530 PIN that is not on the list is refused', unlisted.status >= 400);
  const outside = await codOrder(bengaluru);
  check('a COD order outside Visakhapatnam is refused by the server', outside.status === 400 && outside.json?.code === 'COD_NOT_AVAILABLE_FOR_ADDRESS', `status ${outside.status} ${outside.json?.code}`);
  const vizag = await codOrder(await addAddress('Vizag', 'Andhra Pradesh'));
  check('"Vizag" counts as Visakhapatnam (reaches the order-value check instead)', vizag.status === 400 && /up to/.test(vizag.json?.message ?? ''));
  const wrongState = await codOrder(await addAddress('Visakhapatnam', 'Telangana'));
  check('the right city in the wrong state is refused', wrongState.json?.code === 'COD_NOT_AVAILABLE_FOR_ADDRESS');
  const typedOutside = await publicApi('POST', '/api/orders', {
    paymentMethod: 'COD',
    shippingAddress: { name: 'Cod Limit', phone: '9876543210', addressLine1: '1 Test Street', city: 'Chennai', state: 'Tamil Nadu', postalCode: '600001', country: 'India' },
  }, token);
  check('a typed-in address outside Visakhapatnam is refused too', typedOutside.json?.code === 'COD_NOT_AVAILABLE_FOR_ADDRESS');

  await adminApi('PUT', '/settings', { shipping: { ...original.shipping, codEnabled: true, codMaxOrderValue: 100, codCityOnly: false } });
  const openMethods = (await publicApi('GET', '/api/orders/payment-methods')).json.data.methods.find((m) => m.method === 'COD');
  check('switching the city rule off reaches checkout', openMethods?.enabled === true && openMethods?.area === null);
  const anywhere = await codOrder(bengaluru);
  check('…and COD is no longer tied to the city', anywhere.status === 400 && /up to/.test(anywhere.json?.message ?? ''));

  await adminApi('PUT', '/settings', { shipping: { ...original.shipping, codEnabled: false } });
  const codOff = (await publicApi('GET', '/api/orders/payment-methods')).json.data.methods.find((m) => m.method === 'COD');
  check('switching COD off reaches checkout', codOff?.enabled === false);
  const refused = await codOrder(inCity);
  check('…and a COD order is refused', refused.status === 400 && /not available/.test(refused.json?.message ?? ''));

  // Put everything back for the rest of the run.
  await adminApi('PUT', '/settings', {
    phone: original.phone, whatsapp: original.whatsapp, shipping: original.shipping, returns: original.returns,
  });
}

// ── Media folders: Collections includes the older /banners uploads ──────────
{
  const { MediaAsset } = await import('../src/models/MediaAsset.js');
  const { env: appEnv } = await import('../src/config/env.js');
  const base = appEnv.cloudinary.folder;
  const legacy = await MediaAsset.create({
    publicId: `${base}/banners/legacy-collection-shot`, secureUrl: 'https://res.cloudinary.com/demo/image/upload/legacy.jpg',
    folder: `${base}/banners`, width: 1800, height: 1200, format: 'jpg', bytes: 1000,
  });
  const fresh = await MediaAsset.create({
    publicId: `${base}/collections/new-collection-shot`, secureUrl: 'https://res.cloudinary.com/demo/image/upload/new.jpg',
    folder: `${base}/collections`, width: 1800, height: 1200, format: 'jpg', bytes: 1000,
  });

  const listed = (await adminApi('GET', '/media?folder=collections&limit=60')).json?.data?.assets ?? [];
  const ids = listed.map((a) => String(a._id));
  check('Collections folder lists new collection uploads', ids.includes(String(fresh._id)));
  check('…and the older ones kept in /banners', ids.includes(String(legacy._id)));
  check('…but nothing from other folders', listed.every((a) => /\/(collections|banners)$/.test(a.folder)));
  const bogus = await adminApi('GET', `/media?folder=${encodeURIComponent('.*')}`);
  check('an unknown media folder is refused', bogus.status === 400);
  const collectionSig = await adminApi('POST', '/media/signature', { folder: 'collections' });
  check('uploads into the collections folder are allowed', collectionSig.status !== 400 && collectionSig.status !== 422, `status ${collectionSig.status}`);

  // A collection saved by URL alone still counts as using the image.
  const inUse = await adminApi('POST', '/collections', {
    name: 'Media Usage Check', status: 'draft', image: { url: legacy.secureUrl },
  });
  const blocked = await adminApi('DELETE', `/media/${legacy._id}`);
  check('an image used by a collection is not deleted silently', blocked.status === 409);
  await adminApi('DELETE', `/collections/${inUse.json?.data?.collection?._id}`);
  await MediaAsset.deleteMany({ _id: { $in: [legacy._id, fresh._id] } });
}

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
