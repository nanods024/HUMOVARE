import { Product } from '../models/Product.js';
import { forgetPublicCache, productCacheKey } from '../utils/publicCache.js';

/**
 * A product page shows stock per size, so its cached copy goes the moment
 * stock moves. Listings keep their short cache; the cart and checkout
 * re-check stock regardless.
 */
function stockChanged(product) {
  if (!product?.slug) return;
  forgetPublicCache(productCacheKey(product.slug));
}

/**
 * Atomically reserves stock for one line.
 *
 * The `$gte` guard inside the filter is what prevents overselling: two
 * concurrent checkouts for the last unit cannot both match, so the second one
 * comes back null and the caller unwinds. This holds without a replica set,
 * which `session.withTransaction` would have required.
 */
export async function reserveStock(productId, variantId, quantity) {
  const product = await Product.findOneAndUpdate(
    {
      _id: productId,
      isActive: true,
      variants: { $elemMatch: { _id: variantId, stock: { $gte: quantity } } },
    },
    { $inc: { 'variants.$.stock': -quantity, stock: -quantity, soldCount: quantity } },
    { new: true },
  );
  stockChanged(product);
  return product;
}

export async function releaseStock(productId, variantId, quantity) {
  const product = await Product.findOneAndUpdate(
    { _id: productId, 'variants._id': variantId },
    { $inc: { 'variants.$.stock': quantity, stock: quantity, soldCount: -quantity } },
    { projection: { slug: 1 } },
  ).lean();
  stockChanged(product);
}

/** Puts every line of an order back on the shelf. Never throws. */
export async function releaseOrderStock(order) {
  await Promise.allSettled(
    (order.items ?? []).map((item) => releaseStock(item.product, item.variantId, item.quantity)),
  );
}
