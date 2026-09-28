import { Collection } from '../models/Collection.js';
import { Product } from '../models/Product.js';
import { ApiError } from '../utils/ApiError.js';
import { uniqueSlug } from '../utils/slugify.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';

const CARD_FIELDS =
  'name slug price mrp discountPercentage thumbnail images colors sizes gender fit stock soldCount isNewDrop isBestSeller rating category';

export async function listPublishedCollections() {
  return Collection.find({ status: 'published' })
    .select('name slug description image sortOrder seo')
    .sort({ sortOrder: 1, name: 1 })
    .lean();
}

/**
 * A published collection with its products in the curated order.
 * Deactivated products drop out silently — the collection stays valid.
 */
export async function getPublishedCollection(slug) {
  const collection = await Collection.findOne({ slug, status: 'published' }).lean();
  if (!collection) throw ApiError.notFound('Collection not found');

  const ordered = [...(collection.products ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = ordered.map((entry) => entry.product);

  const products = await Product.find({ _id: { $in: ids }, isActive: true })
    .select(CARD_FIELDS)
    .populate('category', 'name slug')
    .lean({ virtuals: true });

  const byId = new Map(products.map((product) => [product._id.toString(), product]));

  return {
    ...collection,
    products: ids.map((id) => byId.get(String(id))).filter(Boolean),
  };
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function listCollections(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.name = new RegExp(safe, 'i');
  }

  const [collections, total] = await Promise.all([
    Collection.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Collection.countDocuments(filter),
  ]);

  return {
    collections: collections.map((collection) => ({
      ...collection,
      productCount: collection.products?.length ?? 0,
    })),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function getCollection(id) {
  const collection = await Collection.findById(id)
    .populate('products.product', 'name slug thumbnail price stock isActive')
    .lean();

  if (!collection) throw ApiError.notFound('Collection not found');
  return collection;
}

/** Normalises a product id list into ordered `{ product, sortOrder }` lines. */
function normaliseProducts(products) {
  if (!products) return undefined;
  return products.map((entry, index) =>
    typeof entry === 'string'
      ? { product: entry, sortOrder: index }
      : { product: entry.product, sortOrder: entry.sortOrder ?? index },
  );
}

export async function createCollection(payload, adminId) {
  const data = { ...payload, updatedBy: adminId };
  data.slug = await uniqueSlug(Collection, data.slug || data.name);

  const products = normaliseProducts(payload.products);
  if (products) data.products = products;

  const collection = await Collection.create(data);
  return collection.toObject();
}

export async function updateCollection(id, payload, adminId) {
  const collection = await Collection.findById(id);
  if (!collection) throw ApiError.notFound('Collection not found');

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'slug' || key === 'products') continue;
    collection[key] = value;
  }

  const products = normaliseProducts(payload.products);
  if (products) collection.products = products;

  if (payload.slug && payload.slug !== collection.slug) {
    collection.slug = await uniqueSlug(Collection, payload.slug, collection._id);
  }

  collection.updatedBy = adminId;
  await collection.save();
  return collection.toObject();
}

export async function deleteCollection(id) {
  const collection = await Collection.findById(id);
  if (!collection) throw ApiError.notFound('Collection not found');

  await collection.deleteOne();
  return { deleted: true };
}

export default {
  listPublishedCollections,
  getPublishedCollection,
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
};
