import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { Collection } from '../models/Collection.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { uniqueSlug, slugify } from '../utils/slugify.js';
import { destroyImage } from './cloudinary.service.js';
import { PRODUCT_SORTS, VIRTUAL_COLLECTIONS } from '../constants/index.js';

/** Fields the grid needs. Never ship the full description to a listing. */
const CARD_FIELDS =
  'name slug price mrp discountPercentage thumbnail images colors sizes gender fit stock soldCount isNewDrop isBestSeller isFeatured rating category createdAt';

/**
 * Translates a storefront query string into a Mongo filter.
 *
 * Every branch is built from validated input only — the filter object is
 * assembled field by field rather than spreading `req.query`, so a crafted
 * query can never inject an operator.
 */
/** Ids present in both lists, compared as strings. */
function intersect(a = [], b = []) {
  const set = new Set(b.map(String));
  return a.filter((id) => set.has(String(id)));
}

async function buildFilter(query = {}) {
  const filter = { isActive: true };

  // A slug may be a real category or one of the virtual collections.
  const slugs = [query.category, query.collection].filter(Boolean);
  const realSlugs = [];
  for (const value of slugs) {
    if (VIRTUAL_COLLECTIONS[value]) Object.assign(filter, VIRTUAL_COLLECTIONS[value]);
    else realSlugs.push(value);
  }

  // Both lookups at once rather than one after another.
  const [categories, curated] = await Promise.all([
    realSlugs.length
      ? Category.find({ slug: { $in: realSlugs }, isActive: true }).select('_id slug').lean()
      : [],
    query.collections?.length
      ? Collection.find({ slug: { $in: query.collections }, status: 'published' }).select('products').lean()
      : null,
  ]);

  const categoryIds = realSlugs.map((value) => {
    const category = categories.find((c) => c.slug === value);
    if (!category) throw ApiError.notFound(`Collection "${value}" was not found`);
    return category._id;
  });

  if (categoryIds.length === 1) {
    filter.$or = [{ category: categoryIds[0] }, { collections: categoryIds[0] }];
  } else if (categoryIds.length > 1) {
    filter.$and = categoryIds.map((id) => ({
      $or: [{ category: id }, { collections: id }],
    }));
  }

  // Curated collections are an explicit product list rather than a category,
  // so they narrow by id. Several collections intersect, matching how the
  // other multi-select facets behave.
  if (curated) {
    if (curated.length !== query.collections.length) {
      throw ApiError.notFound('One of those collections was not found');
    }

    for (const collection of curated) {
      const ids = (collection.products ?? []).map((entry) => entry.product);
      // An empty collection matches nothing, which is the honest answer.
      filter._id = filter._id ? { $in: intersect(filter._id.$in, ids) } : { $in: ids };
    }
  }

  if (query.gender) filter.gender = query.gender;
  if (query.fit?.length) filter.fit = { $in: query.fit };
  if (query.tag?.length) filter.tags = { $in: query.tag.map((tag) => tag.toLowerCase()) };

  if (query.size?.length) {
    filter['variants.size'] = { $in: query.size.map((size) => size.toUpperCase()) };
  }
  if (query.color?.length) {
    filter['variants.colorSlug'] = { $in: query.color.map((color) => slugify(color)) };
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {};
    if (query.minPrice !== undefined) filter.price.$gte = query.minPrice;
    if (query.maxPrice !== undefined) filter.price.$lte = query.maxPrice;
  }

  if (query.inStock === 'true') filter.stock = { $gt: 0 };
  if (query.onSale === 'true') filter.discountPercentage = { $gt: 0 };

  if (query.search) filter.$text = { $search: query.search };

  return filter;
}

/**
 * Paginated, server-filtered product listing. The client never receives more
 * than one page, and sorting happens in Mongo against an index.
 */
export async function listProducts(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = await buildFilter(query);

  let sort = PRODUCT_SORTS[query.sort] || PRODUCT_SORTS.featured;

  // Text relevance only makes sense while a text search is active, and an
  // explicit sort from the user always wins over it.
  const useRelevance = Boolean(query.search) && !query.sort;
  if (useRelevance) sort = { score: { $meta: 'textScore' } };

  const cursor = query.search
    ? Product.find(filter, { score: { $meta: 'textScore' } }).select(CARD_FIELDS)
    : Product.find(filter).select(CARD_FIELDS);

  const [products, total] = await Promise.all([
    cursor
      .populate('category', 'name slug')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Product.countDocuments(filter),
  ]);

  return { products, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function getProductBySlug(slug) {
  const product = await Product.findOne({ slug, isActive: true })
    .populate('category', 'name slug')
    .populate('collections', 'name slug')
    .lean({ virtuals: true });

  if (!product) throw ApiError.notFound('This product is no longer available');
  return product;
}

/** Same category or shared tags, excluding the product being viewed. */
export async function getRelatedProducts(product, limit = 8) {
  return Product.find({
    _id: { $ne: product._id },
    isActive: true,
    stock: { $gt: 0 },
    $or: [
      { category: product.category?._id || product.category },
      { tags: { $in: product.tags || [] } },
    ],
  })
    .select(CARD_FIELDS)
    .sort({ isBestSeller: -1, soldCount: -1 })
    .limit(limit)
    .lean({ virtuals: true });
}

/** Lightweight suggestions for the search overlay. */
export async function suggestProducts(term, limit = 8) {
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(safe, 'i');

  return Product.find({
    isActive: true,
    $or: [{ name: pattern }, { tags: pattern }],
  })
    .select('name slug price mrp discountPercentage thumbnail images category')
    .populate('category', 'name slug')
    .limit(limit)
    .lean({ virtuals: true });
}

/** Homepage rails — one query per rail, each hitting a dedicated index. */
export async function getHomeRails() {
  const pick = (filter, sort, limit = 8) =>
    Product.find({ isActive: true, ...filter })
      .select(CARD_FIELDS)
      .populate('category', 'name slug')
      .sort(sort)
      .limit(limit)
      .lean({ virtuals: true });

  const [newDrops, bestsellers, featured] = await Promise.all([
    pick({ isNewDrop: true }, { createdAt: -1 }),
    pick({ isBestSeller: true }, { soldCount: -1, createdAt: -1 }),
    pick({ isFeatured: true }, { createdAt: -1 }, 4),
  ]);

  return { newDrops, bestsellers, featured };
}

export async function getProductsByIds(ids = [], limit = 12) {
  if (!ids.length) return [];

  const products = await Product.find({ _id: { $in: ids.slice(0, limit) }, isActive: true })
    .select(CARD_FIELDS)
    .populate('category', 'name slug')
    .lean({ virtuals: true });

  // Preserve the caller's ordering (recently-viewed is ordered by recency).
  const byId = new Map(products.map((product) => [product._id.toString(), product]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

// ── Admin write paths ────────────────────────────────────────────────────────

function withGeneratedVariantMeta(payload) {
  const colors = (payload.colors || []).map((color) => ({
    ...color,
    slug: color.slug || slugify(color.name),
  }));

  const seen = new Set();
  for (const color of colors) {
    if (seen.has(color.slug)) {
      throw ApiError.badRequest(`Colour names must be different — "${color.name}" is used twice.`);
    }
    seen.add(color.slug);
  }

  const variants = (payload.variants || []).map((variant) => {
    const colorSlug = variant.colorSlug || slugify(variant.color);
    const sku =
      variant.sku ||
      `HV-${slugify(payload.name || 'item').slice(0, 14)}-${colorSlug}-${variant.size}`.toUpperCase();
    return { ...variant, colorSlug, sku };
  });

  return { ...payload, colors, variants };
}

/**
 * Carries each variant's existing `_id` over to its edited version. Open
 * orders, carts and the stock ledger all point at variant ids — a fresh id
 * would mean a cancelled order can no longer put its stock back. Matched by
 * id, then SKU, then colour + size; a genuinely new row gets a new id.
 */
function keepVariantIds(existing, incoming) {
  const byId = new Map(existing.map((v) => [String(v._id), v]));
  const bySku = new Map(existing.map((v) => [v.sku, v]));
  const byCombo = new Map(existing.map((v) => [`${v.colorSlug}|${v.size}`, v]));
  const claimed = new Set();

  return incoming.map(({ _id, ...variant }) => {
    const match = [byId.get(String(_id)), bySku.get(variant.sku), byCombo.get(`${variant.colorSlug}|${variant.size}`)]
      .find((candidate) => candidate && !claimed.has(String(candidate._id)));
    if (!match) return variant;
    claimed.add(String(match._id));
    return { ...variant, _id: match._id };
  });
}

/**
 * A product sits in exactly one product type; styles and other groupings go
 * in `collections`, which must never hold a product type.
 */
async function assertCategoryShape({ category, collections }) {
  if (category !== undefined) {
    const found = await Category.findById(category).select('type').lean();
    if (!found) throw ApiError.badRequest('The selected category does not exist');
    if (found.type !== 'product-type') {
      throw ApiError.badRequest('Choose a product type (T-Shirts, Hoodies…) as the category.');
    }
  }

  if (collections?.length) {
    const found = await Category.find({ _id: { $in: collections } }).select('type').lean();
    if (found.length !== new Set(collections.map(String)).size) {
      throw ApiError.badRequest('One of the selected styles does not exist');
    }
    if (found.some((entry) => entry.type === 'product-type')) {
      throw ApiError.badRequest('A product type cannot be used as a style.');
    }
  }
}

export async function createProduct(payload) {
  await assertCategoryShape(payload);

  const data = withGeneratedVariantMeta(payload);
  // A new product mints its own variant ids.
  data.variants = data.variants.map(({ _id, ...variant }) => variant);
  data.slug = await uniqueSlug(Product, data.slug || data.name);

  const product = await Product.create(data);
  return product.toObject({ virtuals: true });
}

export async function updateProduct(id, payload) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  await assertCategoryShape(payload);

  // Assign only the keys the caller actually sent, so a partial update never
  // blanks a field it did not mention.
  const normalised = withGeneratedVariantMeta({
    name: payload.name ?? product.name,
    colors: payload.colors ?? product.colors,
    variants: payload.variants ?? product.variants,
  });

  for (const [key, value] of Object.entries(payload)) {
    if (['slug', 'colors', 'variants'].includes(key)) continue;
    product[key] = value;
  }

  if (payload.colors) product.colors = normalised.colors;
  if (payload.variants) product.variants = keepVariantIds(product.variants, normalised.variants);
  if (payload.slug && payload.slug !== product.slug) {
    product.slug = await uniqueSlug(Product, payload.slug, product._id);
  }

  await product.save();
  return product.toObject({ virtuals: true });
}

/**
 * Soft delete by default: orders reference products, so hard-deleting one
 * would leave order history pointing at nothing.
 */
export async function deleteProduct(id, { hard = false } = {}) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  if (!hard) {
    product.isActive = false;
    await product.save();
    return { deleted: false, deactivated: true };
  }

  await Promise.all(
    [...(product.images || []), product.thumbnail]
      .filter((image) => image?.publicId)
      .map((image) => destroyImage(image.publicId)),
  );
  await product.deleteOne();
  return { deleted: true, deactivated: false };
}

/** Facet values for the filter sidebar, derived from what is actually live. */
export async function getFilterFacets(query = {}) {
  const filter = await buildFilter({ category: query.category, collection: query.collection });

  const [facets] = await Product.aggregate([
    { $match: filter },
    {
      $facet: {
        price: [{ $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }],
        sizes: [
          { $unwind: '$variants' },
          { $group: { _id: '$variants.size', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        colors: [
          { $unwind: '$colors' },
          {
            $group: {
              _id: '$colors.slug',
              name: { $first: '$colors.name' },
              hex: { $first: '$colors.hex' },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ],
        fits: [{ $group: { _id: '$fit', count: { $sum: 1 } } }],
        genders: [{ $group: { _id: '$gender', count: { $sum: 1 } } }],
      },
    },
  ]);

  const clean = (rows) =>
    (rows || []).filter((row) => row._id).map((row) => ({ value: row._id, ...row }));

  return {
    price: facets?.price?.[0]
      ? { min: facets.price[0].min, max: facets.price[0].max }
      : { min: 0, max: 0 },
    sizes: clean(facets?.sizes),
    colors: clean(facets?.colors),
    fits: clean(facets?.fits),
    genders: clean(facets?.genders),
  };
}

export default {
  listProducts,
  getProductBySlug,
  getRelatedProducts,
  suggestProducts,
  getHomeRails,
  getProductsByIds,
  createProduct,
  updateProduct,
  deleteProduct,
  getFilterFacets,
};
