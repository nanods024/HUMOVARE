import { Order } from '../models/Order.js';
import { storeSettings, codArea, isCodAddress, codCityPinError, pinRule } from './storeSettings.service.js';
import { Product } from '../models/Product.js';
import { env } from '../config/env.js';
import { Address } from '../models/Address.js';
import { Cart } from '../models/Cart.js';
import { ApiError } from '../utils/ApiError.js';
import { notifyOrderConfirmed, notifyOrderStatus, awaitEmail } from './email/notifications.js';
import { logger } from '../utils/logger.js';
import { summariseTotals } from '../utils/price.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import * as cartService from './cart.service.js';
import { reserveStock, releaseStock, releaseOrderStock } from './stock.js';
import {
  isOnlineCheckoutOpen,
  startAttempt,
  prepareCustomerCancel,
} from './payments/onlinePayment.service.js';
import {
  ORDER_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  CANCELLABLE_STATUSES,
} from '../constants/index.js';

/** HV-<base36 timestamp>-<4 random> — short, sortable, unambiguous to read. */
function generateOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `HV-${stamp}-${random}`;
}

async function resolveShippingAddress(userId, { addressId, shippingAddress }) {
  if (!addressId && shippingAddress) {
    const pinError = codCityPinError(shippingAddress);
    if (pinError) throw ApiError.unprocessable(pinError, { details: [{ field: 'postalCode', message: pinError }] });
  }
  if (addressId) {
    const saved = await Address.findOne({ _id: addressId, user: userId }).lean();
    if (!saved) throw ApiError.notFound('That delivery address could not be found');

    return {
      name: saved.name,
      phone: saved.phone,
      email: '',
      addressLine1: saved.addressLine1,
      addressLine2: saved.addressLine2 || '',
      city: saved.city,
      state: saved.state,
      postalCode: saved.postalCode,
      country: saved.country,
    };
  }

  return shippingAddress;
}

const MAX_SAVED_ADDRESSES = 10;

/** Says exactly why COD was refused, so the customer can fix a wrong PIN. */
function codAreaRefusal(address, area) {
  const cityOnly = isCodAddress(address, { shipping: { codCityOnly: true, codCity: area.city, codState: area.state, codPinCheck: false } });
  if (cityOnly && area.pinPrefixes.length) {
    return `PIN ${address.postalCode} is not on our ${area.city} Cash on Delivery list. ${pinRule(area)} Or pay online.`;
  }
  return `Cash on Delivery is only available for deliveries in ${area.city}. Please pay online.`;
}

/**
 * "Save this address for next time" — done after the order is placed, so a
 * failed or retried checkout never leaves duplicates behind. Skips an address
 * already saved and respects the address-book limit. Never fails the order.
 */
async function rememberAddress(userId, { addressId, shippingAddress, saveAddress }) {
  if (addressId || !saveAddress || !shippingAddress) return;
  try {
    const saved = await Address.find({ user: userId }).select('addressLine1 postalCode').lean();
    if (saved.length >= MAX_SAVED_ADDRESSES) return;
    const line = (value) => String(value ?? '').trim().toLowerCase();
    const duplicate = saved.some(
      (a) => line(a.addressLine1) === line(shippingAddress.addressLine1) && a.postalCode === shippingAddress.postalCode,
    );
    if (duplicate) return;
    await Address.create({ ...shippingAddress, user: userId, isDefault: saved.length === 0 });
  } catch (error) {
    logger.warn('Could not save the checkout address', { message: error.message });
  }
}

/**
 * Places an order from the signed-in user's cart.
 *
 * Order of operations matters: reconcile the cart first so the customer is
 * charged what they were shown, then reserve stock line by line, and unwind
 * every reservation if any line fails.
 */
export async function createOrder(userId, payload) {
  const isOnline = payload.paymentMethod === PAYMENT_METHODS.ONLINE;
  // Checked before anything is reserved: never take stock for a payment
  // this server cannot collect.
  if (isOnline && !isOnlineCheckoutOpen()) {
    throw ApiError.badRequest('Online payment is not available right now. Please choose Cash on Delivery.');
  }

  // One checkout per bag at a time.
  const lockedAt = new Date();
  const locked = await Cart.findOneAndUpdate(
    {
      user: userId,
      $or: [{ checkoutLockedAt: null }, { checkoutLockedAt: { $lt: new Date(lockedAt.getTime() - CHECKOUT_LOCK_MS) } }],
    },
    { $set: { checkoutLockedAt: lockedAt } },
  );
  if (!locked) {
    const exists = await Cart.exists({ user: userId });
    if (exists) throw ApiError.conflict('Your order is already being placed. Please wait a moment.');
    throw ApiError.badRequest('Your bag is empty');
  }

  try {
    return await placeOrder(userId, payload, isOnline);
  } finally {
    await Cart.updateOne({ user: userId, checkoutLockedAt: lockedAt }, { $set: { checkoutLockedAt: null } });
  }
}

const CHECKOUT_LOCK_MS = 60 * 1000;

async function placeOrder(userId, payload, isOnline) {
  const { cart, notices } = await cartService.loadAndReconcile(userId);

  if (!cart.items.length) {
    throw ApiError.badRequest('Your bag is empty');
  }
  if (notices.length) {
    // The cart changed underneath the customer; make them re-confirm instead
    // of quietly charging a different total.
    throw ApiError.conflict('Your bag changed since you opened checkout. Please review it.', {
      details: notices,
    });
  }

  const shippingAddress = await resolveShippingAddress(userId, payload);

  const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totals = summariseTotals({ subtotal, discount: 0 });

  // Cash on delivery follows the store settings: it can be switched off, and
  // it can be capped so large orders are paid for up front.
  if (payload.paymentMethod === PAYMENT_METHODS.COD) {
    const settings = storeSettings();
    const { codEnabled, codMaxOrderValue } = settings.shipping;
    if (!codEnabled) {
      throw ApiError.badRequest('Cash on Delivery is not available right now. Please pay online.');
    }
    // Checked against the address the order will actually ship to — a saved
    // address is read from the database, never taken from the page.
    if (!isCodAddress(shippingAddress, settings)) {
      throw ApiError.badRequest(
        codAreaRefusal(shippingAddress, codArea(settings)),
        { code: 'COD_NOT_AVAILABLE_FOR_ADDRESS' },
      );
    }
    if (codMaxOrderValue > 0 && totals.total > codMaxOrderValue) {
      throw ApiError.badRequest(
        `Cash on Delivery is available on orders up to ₹${codMaxOrderValue.toLocaleString('en-IN')}. Please pay online.`,
      );
    }
  }

  const reserved = [];
  try {
    for (const item of cart.items) {
      const productId = item.product?._id ?? item.product;
      const ok = await reserveStock(productId, item.variantId, item.quantity);

      if (!ok) {
        const product = item.product?._id ? item.product : await Product.findById(productId).lean();
        throw ApiError.conflict(
          `${product?.name ?? 'An item'} (${item.size}) sold out while you were checking out`,
        );
      }
      reserved.push({ productId, variantId: item.variantId, quantity: item.quantity });
    }

    const items = cart.items.map((item) => {
      const product = item.product?._id ? item.product : null;
      return {
        product: product?._id ?? item.product,
        variantId: item.variantId,
        name: product?.name ?? '',
        slug: product?.slug ?? '',
        sku: item.sku,
        image: product?.thumbnail?.url || product?.images?.[0]?.url || '',
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        price: item.price,
        mrp: item.mrp,
        lineTotal: item.price * item.quantity,
      };
    });

    const orderNumber = generateOrderNumber();

    // Every amount here comes from the reconciled cart — the database's own
    // prices — never from the request body, which carries no prices at all.
    const order = await Order.create({
      orderNumber,
      user: userId,
      items,
      shippingAddress,
      subtotal: totals.subtotal,
      discount: totals.discount,
      shippingFee: totals.shippingFee,
      total: totals.total,
      currency: totals.currency,
      paymentMethod: payload.paymentMethod,
      paymentStatus: PAYMENT_STATUS.PENDING,
      payment: isOnline
        ? {
          provider: 'phonepe',
          // An unpaid online order holds its stock only this long.
          expiresAt: new Date(Date.now() + env.payment.windowMinutes * 60 * 1000),
        }
        : { provider: 'cod', reference: `cod_${orderNumber}` },
      customerNote: payload.customerNote || '',
      // COD is confirmed immediately; online payment waits for verification.
      orderStatus:
        payload.paymentMethod === PAYMENT_METHODS.COD
          ? ORDER_STATUS.CONFIRMED
          : ORDER_STATUS.PENDING,
      statusHistory: [
        {
          status:
            payload.paymentMethod === PAYMENT_METHODS.COD
              ? ORDER_STATUS.CONFIRMED
              : ORDER_STATUS.PENDING,
          note: 'Order placed',
        },
      ],
    });

    // The bag has become an order; empty it.
    await Cart.findOneAndUpdate({ user: userId }, { $set: { items: [] } });
    await rememberAddress(userId, payload);

    // Online: open the first PhonePe attempt. If PhonePe cannot be reached the
    // order still exists (unpaid, stock held for the payment window) and the
    // customer can retry from the payment page — no second order is needed.
    if (isOnline) {
      let payment;
      try {
        payment = { status: 'redirect', ...(await startAttempt(order, { source: 'checkout' })) };
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        payment = { status: 'unavailable', message: error.message };
      }
      return { order: (await Order.findById(order._id)).toObject(), payment, notifications: summarise({ status: 'none' }) };
    }

    // A COD order is confirmed the moment it is placed. An online order is not
    // confirmed until the payment is verified, so its email waits for that.
    // The email can never undo the order: `notify*` never rejects, and a slow
    // provider only turns the answer into "queued".
    const email = order.orderStatus === ORDER_STATUS.CONFIRMED
      ? await awaitEmail(notifyOrderConfirmed(order))
      : { status: 'none' };

    return { order: order.toObject(), payment: { status: 'cod' }, notifications: summarise(email) };
  } catch (error) {
    // Unwind every reservation we already took, then rethrow untouched.
    await Promise.allSettled(
      reserved.map((entry) => releaseStock(entry.productId, entry.variantId, entry.quantity)),
    );
    if (reserved.length) {
      logger.warn('Checkout failed after reserving stock; reservations released', {
        userId: String(userId),
        released: reserved.length,
      });
    }
    throw error;
  }
}

export async function listOrders(userId, query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = { user: userId };
  if (query.status) filter.orderStatus = query.status;

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);

  return { orders, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getOrder(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

/** Customer-initiated cancellation; puts the reserved stock back. */
export async function cancelOrder(userId, orderId, reason = '') {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw ApiError.notFound('Order not found');

  if (!CANCELLABLE_STATUSES.includes(order.orderStatus)) {
    throw ApiError.conflict(
      `An order that is already ${order.orderStatus.toLowerCase().replace(/_/g, ' ')} cannot be cancelled here. Please start a return instead.`,
    );
  }

  // Online orders: a paid one is cancelled by support, never from here; an
  // unpaid one is checked with PhonePe first and its checkout closed.
  await prepareCustomerCancel(order);

  // Claim the cancellation atomically so a double click cannot release the
  // stock twice.
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, orderStatus: { $in: CANCELLABLE_STATUSES }, paymentStatus: { $ne: PAYMENT_STATUS.PAID } },
    { $set: { orderStatus: ORDER_STATUS.CANCELLED } },
  );
  if (!claimed) throw ApiError.conflict('This order has already changed. Please refresh and try again.');

  await releaseOrderStock(order);

  order.pushStatus(ORDER_STATUS.CANCELLED, reason || 'Cancelled by customer');
  if (order.paymentMethod === PAYMENT_METHODS.ONLINE) order.paymentStatus = PAYMENT_STATUS.CANCELLED;

  await order.save();

  const email = await awaitEmail(notifyOrderStatus(order, ORDER_STATUS.CANCELLED));
  return { order: order.toObject(), notifications: summarise(email) };
}

/**
 * What the storefront is told about the email, in words it can show.
 *
 * `failed` carries a friendly sentence and nothing from the provider: the
 * customer's order succeeded, and a Resend error message is neither theirs to
 * read nor safe to show.
 */
function summarise(primary, secondary) {
  const status = primary?.status ?? 'none';
  const failed = status === 'failed' || secondary?.status === 'failed';

  return {
    email: failed ? 'failed' : status,
    ...(failed
      ? {
          message:
            "Your order was placed successfully. We couldn't send the confirmation email right now, but you can view your order from your account.",
        }
      : {}),
  };
}

export default {
  createOrder,
  listOrders,
  getOrder,
  cancelOrder,
};
