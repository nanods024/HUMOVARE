import { Order } from '../models/Order.js';
import { toDotPaths } from '../utils/dotPaths.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { StoreSetting } from '../models/StoreSetting.js';
import { readSettingsDocument, setStoreSettings, DEFAULTS as SETTINGS_DEFAULTS } from './storeSettings.service.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHODS } from '../constants/index.js';
import { notifyOrderStatus, awaitEmail } from './email/notifications.js';
import { releaseOrderStock } from './stock.js';
import { PaymentAttempt } from '../models/PaymentAttempt.js';
import { PaymentEvent } from '../models/PaymentEvent.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { Address } from '../models/Address.js';
import { Cart } from '../models/Cart.js';
import { Wishlist } from '../models/Wishlist.js';
import { Feedback } from '../models/Feedback.js';
import { closeOpenAttempts } from './payments/onlinePayment.service.js';

/**
 * Admin-side order, customer and settings operations.
 */

// ── Orders ───────────────────────────────────────────────────────────────────

/**
 * Legal status transitions.
 *
 * Orders only move forwards, and may skip steps once confirmed: a small shop
 * often packs and hands over to the courier the same day, so Confirmed to
 * Shipped is normal. A PENDING order (online payment not yet verified) can
 * only be confirmed or cancelled, so nothing unpaid is ever shipped, and
 * nothing can be cancelled once it is with the courier.
 */
export const ORDER_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]: [
    ORDER_STATUS.PROCESSING,
    ORDER_STATUS.SHIPPED,
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.PROCESSING]: [
    ORDER_STATUS.SHIPPED,
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.OUT_FOR_DELIVERY]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [],
  [ORDER_STATUS.CANCELLED]: [],
});

export async function listOrders(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.status) filter.orderStatus = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;

  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(safe, 'i');
    filter.$or = [
      { orderNumber: pattern },
      { 'shippingAddress.name': pattern },
      { 'shippingAddress.phone': pattern },
    ];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return { orders, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getOrder(id) {
  const order = await Order.findById(id).populate('user', 'name email phone createdAt').lean();
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

const IN_TRANSIT = [ORDER_STATUS.SHIPPED, ORDER_STATUS.OUT_FOR_DELIVERY];

function applyShipment(order, shipment) {
  for (const field of ['carrier', 'trackingNumber', 'trackingUrl']) {
    if (shipment[field] !== undefined) order.shipment[field] = shipment[field] || '';
  }
  if (shipment.estimatedDelivery !== undefined) {
    order.shipment.estimatedDelivery = shipment.estimatedDelivery ? new Date(shipment.estimatedDelivery) : null;
  }
}

/**
 * Corrects or adds courier details on an order that is already on its way:
 * a typo in the tracking number, or a link the courier sent later. The
 * customer sees the change on their order page. No email is sent, because
 * nothing about the order's progress changed.
 */
export async function updateShipment(id, shipment) {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  if (![...IN_TRANSIT, ORDER_STATUS.DELIVERED].includes(order.orderStatus)) {
    throw ApiError.conflict('Courier details can be edited once the order has shipped. Move it to Shipped first.');
  }

  const before = {
    carrier: order.shipment?.carrier ?? '',
    trackingNumber: order.shipment?.trackingNumber ?? '',
    trackingUrl: order.shipment?.trackingUrl ?? '',
  };
  applyShipment(order, shipment);
  await order.save();

  return { order: order.toObject(), before };
}

/**
 * Validates the transition, applies it with its side effects, and emails the
 * customer.
 *
 * The transition graph already refuses a same-status update, so "admin clicks
 * Shipped twice" is a 409 before any email is considered — and the per-status
 * idempotency key would stop a second send even if it were not.
 */
export async function updateOrderStatus(id, status, note = '', shipment = null) {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  // The save below only lands if nobody else moved the order in between — a
  // PhonePe webhook confirming payment, the customer cancelling, a second
  // admin. Otherwise a cancel could overwrite a fresh payment, or stock could
  // be put back twice.
  const seen = { orderStatus: order.orderStatus, paymentStatus: order.paymentStatus };

  const allowed = ORDER_TRANSITIONS[order.orderStatus] ?? [];
  if (!allowed.includes(status)) {
    throw ApiError.conflict(
      `Cannot move an order from ${order.orderStatus} to ${status}. Allowed: ${allowed.join(', ') || 'none'}.`,
    );
  }

  // An online order is confirmed by a verified payment, never by hand —
  // otherwise an unpaid order could be shipped.
  if (
    status === ORDER_STATUS.CONFIRMED
    && order.paymentMethod === PAYMENT_METHODS.ONLINE
    && order.paymentStatus !== PAYMENT_STATUS.PAID
  ) {
    throw ApiError.conflict('Online orders are confirmed automatically once PhonePe confirms the payment. Use "Check with PhonePe" if the customer says they paid.');
  }

  // Delivering a COD order is the moment the money is actually collected.
  if (status === ORDER_STATUS.DELIVERED && order.paymentMethod === PAYMENT_METHODS.COD) {
    order.paymentStatus = PAYMENT_STATUS.PAID;
    order.payment.paidAt = new Date();
  }

  // Courier details ride along with the move into transit, so the email that
  // goes out with that status can carry them.
  if (shipment && IN_TRANSIT.includes(status)) applyShipment(order, shipment);

  // Skipping straight past Shipped still records when the parcel left.
  const leavesWarehouse = [...IN_TRANSIT, ORDER_STATUS.DELIVERED].includes(status);
  if (status === ORDER_STATUS.SHIPPED || (leavesWarehouse && !order.shipment.shippedAt)) {
    order.shipment.shippedAt = new Date();
  }

  const before = order.orderStatus;
  order.pushStatus(status, note);
  if (status === ORDER_STATUS.CANCELLED && order.paymentMethod === PAYMENT_METHODS.ONLINE && order.paymentStatus !== PAYMENT_STATUS.PAID) {
    order.paymentStatus = PAYMENT_STATUS.CANCELLED;
  }
  order.$where = seen;
  try {
    await order.save();
  } catch (error) {
    if (error?.name === 'DocumentNotFoundError') {
      throw ApiError.conflict('This order changed while you were updating it. Refresh and try again.');
    }
    throw error;
  }

  if (status === ORDER_STATUS.CANCELLED) {
    // The items go back on the shelf, and nothing on the order stays payable.
    await releaseOrderStock(order);
    await closeOpenAttempts(order._id, 'admin');
  }

  const email = await awaitEmail(notifyOrderStatus(order, status));

  return { order: order.toObject(), before, after: status, email };
}

export async function addOrderNote(id, note) {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  order.statusHistory.push({ status: order.orderStatus, note, at: new Date() });
  await order.save();

  return order.toObject();
}

/** Statuses where the items are still in the warehouse, holding stock. */
const HOLDS_STOCK = [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, ORDER_STATUS.PROCESSING];

/**
 * Permanently removes an order: the order itself, its payment attempts and
 * events, and its email log. The customer no longer sees it in their account.
 *
 * Stock is put back only when the items never left — a cancelled order has
 * already released it, and a shipped or delivered parcel is gone. Any payment
 * still open is closed first so nothing on the order stays payable.
 */
export async function deleteOrder(id) {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  const restocked = HOLDS_STOCK.includes(order.orderStatus);

  await closeOpenAttempts(order._id, 'admin');
  if (restocked) await releaseOrderStock(order);

  await Promise.all([
    PaymentAttempt.deleteMany({ order: order._id }),
    PaymentEvent.deleteMany({ order: order._id }),
    EmailEvent.deleteMany({ order: order._id }),
  ]);
  await order.deleteOne();

  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    total: order.total,
    items: order.items?.length ?? 0,
    restocked,
  };
}

// ── Customers ────────────────────────────────────────────────────────────────

export async function listCustomers(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(safe, 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
  }

  const [customers, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  // One aggregate for the whole page rather than a query per customer.
  const ids = customers.map((customer) => customer._id);
  const stats = await Order.aggregate([
    { $match: { user: { $in: ids }, orderStatus: { $ne: ORDER_STATUS.CANCELLED } } },
    { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$total' } } },
  ]);
  const byUser = new Map(stats.map((row) => [row._id.toString(), row]));

  return {
    customers: customers.map((customer) => ({
      ...customer.toPublicJSON(),
      isActive: customer.isActive,
      lastLoginAt: customer.lastLoginAt,
      orderCount: byUser.get(customer._id.toString())?.orders ?? 0,
      totalSpent: byUser.get(customer._id.toString())?.spent ?? 0,
    })),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function getCustomer(id) {
  const customer = await User.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');

  const [orders, [totals]] = await Promise.all([
    Order.find({ user: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('orderNumber total orderStatus paymentStatus createdAt')
      .lean(),
    // Over every order, not just the 20 shown — same rule as the list view.
    Order.aggregate([
      { $match: { user: customer._id, orderStatus: { $ne: ORDER_STATUS.CANCELLED } } },
      { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: '$total' } } },
    ]),
  ]);

  return {
    // Only the customer's own public shape — no hashes, no reset tokens.
    ...customer.toPublicJSON(),
    isActive: customer.isActive,
    lastLoginAt: customer.lastLoginAt,
    orders,
    stats: { orderCount: totals?.orders ?? 0, totalSpent: totals?.spent ?? 0 },
  };
}

export async function setCustomerActive(id, isActive) {
  const customer = await User.findById(id).select('+tokenVersion');
  if (!customer) throw ApiError.notFound('Customer not found');

  customer.isActive = isActive;
  // Disabling has to end live sessions, not just block the next sign-in.
  if (!isActive) customer.tokenVersion = (customer.tokenVersion ?? 0) + 1;
  await customer.save();

  return { ...customer.toPublicJSON(), isActive: customer.isActive };
}

// ── Store settings ───────────────────────────────────────────────────────────

/**
 * Permanently deletes a customer account and the personal data hanging off
 * it: addresses, cart, wishlist, contact-form messages and account emails.
 * Their sessions end on the next request, because every request re-reads the
 * user.
 *
 * Orders are business records, so they are kept by default (the order still
 * carries its own shipping name and address). Pass `deleteOrders` to remove
 * those too, through the same path as deleting a single order.
 */
export async function deleteCustomer(id, { deleteOrders = false } = {}) {
  const customer = await User.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');

  const orderIds = await Order.find({ user: customer._id }).distinct('_id');
  if (deleteOrders) {
    for (const orderId of orderIds) await deleteOrder(orderId);
  }

  await Promise.all([
    Address.deleteMany({ user: customer._id }),
    Cart.deleteMany({ user: customer._id }),
    Wishlist.deleteMany({ user: customer._id }),
    Feedback.deleteMany({ user: customer._id }),
    // Order emails stay with a kept order; everything else about the account goes.
    EmailEvent.deleteMany({ user: customer._id, order: null }),
  ]);
  await customer.deleteOne();

  return {
    id: String(customer._id),
    email: customer.email,
    name: customer.name,
    ordersDeleted: deleteOrders ? orderIds.length : 0,
    ordersKept: deleteOrders ? 0 : orderIds.length,
  };
}

/** Nested settings groups: saving one field must not wipe the rest of its group. */
const SETTINGS_GROUPS = ['address', 'shipping', 'returns', 'seo'];

export async function getSettings() {
  const doc = await readSettingsDocument();
  return { ...doc, shipping: { ...SETTINGS_DEFAULTS.shipping, ...(doc?.shipping ?? {}) } };
}

export async function updateSettings(payload, adminId) {
  const before = await getSettings();

  const after = await StoreSetting.findOneAndUpdate(
    { key: 'default' },
    { $set: { ...toDotPaths(payload, SETTINGS_GROUPS), updatedBy: adminId } },
    { new: true, upsert: true, runValidators: true },
  ).lean();

  // Live immediately: the next cart, checkout or storefront load sees it.
  setStoreSettings(after);
  return { before, after };
}

// ── Catalogue bulk operations ────────────────────────────────────────────────

const BULK_FIELDS = new Set(['isActive', 'isFeatured', 'isNewDrop', 'isBestSeller', 'isDesignerExclusive', 'category']);

/**
 * Applies one field change across many products.
 * The field allow-list stops a bulk call being used to rewrite prices.
 */
export async function bulkUpdateProducts(ids = [], updates = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(updates)) {
    if (BULK_FIELDS.has(key)) safe[key] = value;
  }

  if (!Object.keys(safe).length) {
    throw ApiError.badRequest('No permitted fields to update in bulk');
  }

  const result = await Product.updateMany({ _id: { $in: ids } }, { $set: safe });
  return { matched: result.matchedCount, modified: result.modifiedCount, updates: safe };
}

export default {
  listOrders,
  getOrder,
  updateOrderStatus,
  addOrderNote,
  listCustomers,
  getCustomer,
  setCustomerActive,
  getSettings,
  updateSettings,
  bulkUpdateProducts,
  ORDER_TRANSITIONS,
  updateShipment,
};
