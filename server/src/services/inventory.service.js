import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { InventoryTransaction } from '../models/InventoryTransaction.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { LOW_STOCK_THRESHOLD } from '../constants/index.js';

/**
 * The stock screen, one product per entry with its variants underneath.
 *
 * Paged by product, never by variant: paging variants split a product across
 * pages, so its heading showed only the rows that happened to land on that
 * page — "1 variant · 0 in stock" for a shirt that actually had 6.
 * The level filter picks products with at least one matching variant, and
 * lists just those variants; the product's totals always cover all of them.
 */
export async function listInventory(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const threshold = Number(query.threshold) || LOW_STOCK_THRESHOLD;

  const match = {};
  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(safe, 'i');
    match.$or = [{ name: pattern }, { 'variants.sku': pattern }];
  }
  // An aggregation $match does not cast like find() does: a string id never
  // equals a stored ObjectId, so convert it (and refuse anything that is not
  // an id, rather than silently matching nothing).
  if (query.category) {
    if (!mongoose.Types.ObjectId.isValid(query.category)) throw ApiError.badRequest('Unknown category');
    match.category = new mongoose.Types.ObjectId(String(query.category));
  }
  if (query.isActive !== undefined) match.isActive = query.isActive === 'true';

  const levelOf = (stock) => (stock <= 0 ? 'out' : stock <= threshold ? 'low' : 'in');
  const wanted = ['out', 'low', 'in'].includes(query.status) ? query.status : null;
  const variantMatch = {
    out: { $lte: 0 },
    low: { $gt: 0, $lte: threshold },
    in: { $gt: 0 },
  }[wanted];
  if (variantMatch) match.variants = { $elemMatch: { stock: variantMatch } };

  // The header counts every variant, whatever level filter is picked.
  const { variants: _levelFilter, ...summaryMatch } = match;

  const [products, total, summaryRows] = await Promise.all([
    Product.find(match)
      .select('name slug thumbnail isActive category colors.name colors.slug colors.hex variants._id variants.colorSlug variants.sku variants.size variants.color variants.stock variants.price price')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(match),
    // Catalogue-wide figures for the header, under the same search/type filter.
    Product.aggregate([
      { $match: summaryMatch },
      { $project: { variants: 1 } },
      { $unwind: '$variants' },
      {
        $group: {
          _id: null,
          units: { $sum: { $max: ['$variants.stock', 0] } },
          variants: { $sum: 1 },
          out: { $sum: { $cond: [{ $lte: ['$variants.stock', 0] }, 1, 0] } },
          low: {
            $sum: {
              $cond: [{ $and: [{ $gt: ['$variants.stock', 0] }, { $lte: ['$variants.stock', threshold] }] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  const shaped = products.map((product) => {
    const all = (product.variants ?? []).map((variant) => ({
      productId: product._id,
      name: product.name,
      slug: product.slug,
      thumbnail: product.thumbnail ?? null,
      isActive: product.isActive,
      category: product.category,
      variantId: variant._id,
      sku: variant.sku,
      colorSlug: variant.colorSlug,
      size: variant.size,
      color: variant.color,
      stock: variant.stock ?? 0,
      price: variant.price ?? product.price,
      lowStockThreshold: threshold,
      status: levelOf(variant.stock ?? 0),
    }));
    const matching = wanted ? all.filter((variant) => variant.status === wanted || (wanted === 'in' && variant.status === 'low')) : all;
    return {
      productId: product._id,
      name: product.name,
      slug: product.slug,
      thumbnail: product.thumbnail ?? null,
      isActive: product.isActive,
      category: product.category,
      totalStock: all.reduce((sum, variant) => sum + Math.max(variant.stock, 0), 0),
      variantCount: all.length,
      outCount: all.filter((variant) => variant.status === 'out').length,
      lowCount: all.filter((variant) => variant.status === 'low').length,
      matchingCount: matching.length,
      // Every variant, so the colour × size grid is always complete; the
      // level filter only decides which products are listed.
      variants: all,
      colors: (product.colors ?? []).map(({ name, slug, hex }) => ({ name, slug, hex })),
    };
  });

  const summary = summaryRows[0] ?? { units: 0, variants: 0, out: 0, low: 0 };
  delete summary._id;

  return {
    products: shaped,
    // Flat rows for older callers.
    items: shaped.flatMap((product) => product.variants),
    summary: { ...summary, products: total, lowStockThreshold: threshold },
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

/**
 * Sets a variant's stock to an absolute value and records the movement.
 *
 * The write is a single guarded update so two admins adjusting the same
 * variant cannot interleave and lose one another's change, and stock can
 * never be driven negative.
 */
export async function adjustStock({ productId, variantId, quantity, reason, type = 'adjustment', adminId }) {
  if (quantity < 0) throw ApiError.badRequest('Stock cannot be negative');

  // One atomic write sets just this variant. Loading the product and saving
  // it back would overwrite any sale that reserved stock in between.
  const before = await Product.findOneAndUpdate(
    { _id: productId, 'variants._id': variantId },
    { $set: { 'variants.$.stock': quantity } },
    { projection: { variants: { $elemMatch: { _id: variantId } } } },
  ).lean();

  if (!before) {
    const exists = await Product.exists({ _id: productId });
    throw ApiError.notFound(exists ? 'Variant not found' : 'Product not found');
  }

  // Keep the product-level total in step, computed by the database.
  const after = await Product.findOneAndUpdate(
    { _id: productId },
    [{ $set: { stock: { $sum: '$variants.stock' } } }],
    { new: true, projection: { stock: 1 } },
  ).lean();

  const variant = before.variants[0];
  const previous = variant.stock ?? 0;
  const delta = quantity - previous;

  await InventoryTransaction.create({
    product: productId,
    variantId: variant._id,
    sku: variant.sku,
    type,
    delta,
    balanceAfter: quantity,
    reason: reason ?? '',
    adminUser: adminId ?? null,
  });

  return {
    productId,
    variantId: variant._id,
    sku: variant.sku,
    previous,
    stock: quantity,
    delta,
    productStock: after?.stock ?? null,
  };
}

/** Applies several adjustments, reporting per-row outcomes rather than failing all. */
export async function bulkAdjustStock(adjustments = [], adminId) {
  const results = [];

  for (const adjustment of adjustments) {
    try {
      results.push({ ok: true, ...(await adjustStock({ ...adjustment, adminId })) });
    } catch (error) {
      results.push({
        ok: false,
        productId: adjustment.productId,
        variantId: adjustment.variantId,
        error: error.message,
      });
    }
  }

  return { results, updated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

export async function getStockHistory(productId, { limit = 50 } = {}) {
  return InventoryTransaction.find({ product: productId })
    .populate('adminUser', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export default { listInventory, adjustStock, bulkAdjustStock, getStockHistory };
