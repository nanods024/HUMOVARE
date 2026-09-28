import { Product } from '../models/Product.js';

/**
 * Atomically reserves stock for one line.
 *
 * The `$gte` guard inside the filter is what prevents overselling: two
 * concurrent checkouts for the last unit cannot both match, so the second one
 * comes back null and the caller unwinds. This holds without a replica set,
 * which `session.withTransaction` would have required.
 */
export async function reserveStock(productId, variantId, quantity) {
  return Product.findOneAndUpdate(
    {
      _id: productId,
      isActive: true,
      variants: { $elemMatch: { _id: variantId, stock: { $gte: quantity } } },
    },
    { $inc: { 'variants.$.stock': -quantity, stock: -quantity, soldCount: quantity } },
    { new: true },
  );
}

export async function releaseStock(productId, variantId, quantity) {
  await Product.updateOne(
    { _id: productId, 'variants._id': variantId },
    { $inc: { 'variants.$.stock': quantity, stock: quantity, soldCount: -quantity } },
  );
}

/** Puts every line of an order back on the shelf. Never throws. */
export async function releaseOrderStock(order) {
  await Promise.allSettled(
    (order.items ?? []).map((item) => releaseStock(item.product, item.variantId, item.quantity)),
  );
}
