import { Cart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { ApiError } from '../utils/ApiError.js';
import { summariseTotals } from '../utils/price.js';

const MAX_PER_LINE = 10;

/** Everything the cart UI renders for one line. */
const POPULATE = {
  path: 'items.product',
  select: 'name slug price mrp discountPercentage thumbnail images isActive stock variants colors',
};

async function getOrCreateCart(userId) {
  const cart = await Cart.findOne({ user: userId });
  if (cart) return cart;
  return Cart.create({ user: userId, items: [] });
}

/**
 * Resolves a product + variant and checks it can actually be sold right now.
 * Both "add" and "merge" go through here so guest carts cannot smuggle in a
 * price or a sold-out variant.
 */
async function resolveVariant(productId, variantId, quantity) {
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw ApiError.notFound('This product is no longer available');

  const variant = product.variants.id(variantId);
  if (!variant) throw ApiError.badRequest('Please choose a valid size and colour');

  if (variant.stock <= 0) {
    throw ApiError.conflict(`${product.name} (${variant.size}) is out of stock`);
  }
  if (quantity > variant.stock) {
    throw ApiError.conflict(`Only ${variant.stock} left in ${variant.size}`);
  }

  return { product, variant, price: variant.price ?? product.price };
}

/**
 * Re-prices every line against the live catalogue and drops anything that has
 * gone away. Returns the notices so the UI can tell the customer what changed
 * rather than silently altering their cart.
 */
async function reconcile(cart) {
  const notices = [];
  const surviving = [];

  for (const item of cart.items) {
    const product = item.product?._id ? item.product : await Product.findById(item.product);

    if (!product || !product.isActive) {
      notices.push({ type: 'removed', message: 'An item is no longer available and was removed' });
      continue;
    }

    const variant = product.variants?.id?.(item.variantId);
    if (!variant || variant.stock <= 0) {
      notices.push({ type: 'removed', message: `${product.name} (${item.size}) is out of stock` });
      continue;
    }

    if (item.quantity > variant.stock) {
      notices.push({
        type: 'quantity',
        message: `${product.name} (${item.size}) reduced to ${variant.stock} — that is all we have left`,
      });
      item.quantity = variant.stock;
    }

    const livePrice = variant.price ?? product.price;
    if (item.price !== livePrice) {
      notices.push({ type: 'price', message: `Price updated for ${product.name}` });
      item.price = livePrice;
      item.mrp = product.mrp;
    }

    surviving.push(item);
  }

  if (surviving.length !== cart.items.length) cart.items = surviving;
  return notices;
}

/** Shapes a cart document into the payload the storefront consumes. */
function serialise(cart, notices = []) {
  const items = cart.items.map((item) => {
    const product = item.product?._id ? item.product : null;
    return {
      id: item._id.toString(),
      productId: (product?._id ?? item.product).toString(),
      name: product?.name ?? '',
      slug: product?.slug ?? '',
      image: product?.thumbnail?.url || product?.images?.[0]?.url || '',
      variantId: item.variantId.toString(),
      sku: item.sku,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
      price: item.price,
      mrp: item.mrp,
      lineTotal: item.price * item.quantity,
      maxQuantity: Math.min(
        MAX_PER_LINE,
        product?.variants?.find?.((v) => v._id.toString() === item.variantId.toString())?.stock ??
          MAX_PER_LINE,
      ),
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const mrpTotal = items.reduce((sum, item) => sum + item.mrp * item.quantity, 0);

  return {
    id: cart._id.toString(),
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    summary: summariseTotals({ subtotal, discount: 0 }),
    savings: Math.max(0, mrpTotal - subtotal),
    notices,
  };
}

export async function loadAndReconcile(userId) {
  const cart = await getOrCreateCart(userId);
  await cart.populate(POPULATE);
  const notices = await reconcile(cart);
  if (notices.length) await cart.save();
  return { cart, notices };
}

export async function getCart(userId) {
  const { cart, notices } = await loadAndReconcile(userId);
  return serialise(cart, notices);
}

export async function addItem(userId, { productId, variantId, quantity = 1 }) {
  const cart = await getOrCreateCart(userId);

  const existing = cart.items.find(
    (item) =>
      item.product.toString() === String(productId) &&
      item.variantId.toString() === String(variantId),
  );

  const desired = Math.min((existing?.quantity ?? 0) + quantity, MAX_PER_LINE);
  const { product, variant, price } = await resolveVariant(productId, variantId, desired);

  if (existing) {
    existing.quantity = desired;
    existing.price = price;
    existing.mrp = product.mrp;
  } else {
    cart.items.push({
      product: product._id,
      variantId: variant._id,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      quantity: desired,
      price,
      mrp: product.mrp,
    });
  }

  await cart.save();
  await cart.populate(POPULATE);
  return serialise(cart);
}

export async function updateItem(userId, itemId, quantity) {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('That item is not in your bag');

  await resolveVariant(item.product, item.variantId, quantity);
  item.quantity = quantity;

  await cart.save();
  await cart.populate(POPULATE);
  return serialise(cart);
}

export async function removeItem(userId, itemId) {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('That item is not in your bag');

  item.deleteOne();
  await cart.save();
  await cart.populate(POPULATE);
  return serialise(cart);
}

export async function clearCart(userId) {
  const cart = await getOrCreateCart(userId);
  cart.items = [];
  await cart.save();
  return serialise(cart);
}

/**
 * Merges a guest cart (held in localStorage) into the server cart on sign-in.
 *
 * Quantities are combined rather than overwritten, and anything that fails
 * validation is skipped with a reason instead of failing the whole merge —
 * losing a whole cart at the login step is a terrible first impression.
 */
export async function mergeGuestCart(userId, guestItems = []) {
  const cart = await getOrCreateCart(userId);
  const skipped = [];

  for (const guestItem of guestItems) {
    try {
      const existing = cart.items.find(
        (item) =>
          item.product.toString() === String(guestItem.productId) &&
          item.variantId.toString() === String(guestItem.variantId),
      );

      const desired = Math.min(
        (existing?.quantity ?? 0) + (guestItem.quantity ?? 1),
        MAX_PER_LINE,
      );

      const { product, variant, price } = await resolveVariant(
        guestItem.productId,
        guestItem.variantId,
        desired,
      );

      if (existing) {
        existing.quantity = desired;
        existing.price = price;
      } else {
        cart.items.push({
          product: product._id,
          variantId: variant._id,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          quantity: desired,
          price,
          mrp: product.mrp,
        });
      }
    } catch (error) {
      skipped.push({ productId: guestItem.productId, reason: error.message });
    }
  }

  await cart.save();
  await cart.populate(POPULATE);

  const payload = serialise(cart);
  if (skipped.length) {
    payload.notices = [
      ...payload.notices,
      ...skipped.map((entry) => ({ type: 'skipped', message: entry.reason })),
    ];
  }
  return payload;
}

export default {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  mergeGuestCart,
  loadAndReconcile,
  serialiseCart: serialise,
};
