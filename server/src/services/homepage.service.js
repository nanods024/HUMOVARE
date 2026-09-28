import { HomepageSection } from '../models/HomepageSection.js';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { Collection } from '../models/Collection.js';
import { ApiError } from '../utils/ApiError.js';

/** Card projection — a home rail never needs the full product document. */
const CARD_FIELDS =
  'name slug price mrp discountPercentage thumbnail images colors sizes gender fit stock soldCount isNewDrop isBestSeller isFeatured rating category createdAt';

const SOURCE_FILTERS = {
  newDrops: { isNewDrop: true },
  bestsellers: { isBestSeller: true },
  featured: { isFeatured: true },
  sale: { discountPercentage: { $gt: 0 } },
  designerExclusive: { isDesignerExclusive: true },
};

const SOURCE_SORTS = {
  newDrops: { createdAt: -1 },
  bestsellers: { soldCount: -1, createdAt: -1 },
  featured: { createdAt: -1 },
  sale: { discountPercentage: -1 },
  designerExclusive: { createdAt: -1 },
};

/**
 * Resolves the products for a rail.
 *
 * A manual pick always wins and preserves the admin's chosen order; otherwise
 * the section falls back to its flag-driven query. That way a merchandiser can
 * override a rail without losing the automatic behaviour when they clear it.
 */
async function resolveRailProducts(section) {
  if (section.products?.length) {
    const products = await Product.find({ _id: { $in: section.products }, isActive: true })
      .select(CARD_FIELDS)
      .populate('category', 'name slug')
      .lean({ virtuals: true });

    const byId = new Map(products.map((product) => [product._id.toString(), product]));
    return section.products.map((id) => byId.get(String(id))).filter(Boolean);
  }

  const filter = SOURCE_FILTERS[section.source];
  if (!filter) return [];

  return Product.find({ isActive: true, ...filter })
    .select(CARD_FIELDS)
    .populate('category', 'name slug')
    .sort(SOURCE_SORTS[section.source] ?? { createdAt: -1 })
    .limit(section.limit ?? 8)
    .lean({ virtuals: true });
}

/** Explicit category picks, in the admin's order; otherwise the nav defaults. */
async function resolveCategories(section) {
  if (section.categories?.length) {
    const categories = await Category.find({ _id: { $in: section.categories }, isActive: true })
      .select('name slug description image type')
      .lean();

    const byId = new Map(categories.map((category) => [category._id.toString(), category]));
    return section.categories.map((id) => byId.get(String(id))).filter(Boolean);
  }

  // Unlike the header's mega menu (which stays curated to `showInNav`
  // categories on purpose), this grid is the storefront's full catalogue
  // index — every active product-type category belongs here, including ones
  // an admin hasn't (or doesn't want to) surface in the nav.
  return Category.find({ isActive: true, type: 'product-type' })
    .select('name slug description image type')
    .sort({ displayOrder: 1, name: 1 })
    .lean();
}

/**
 * Style rail tiles carry their own copy and link in `items`, but the image
 * always comes live from the matching Category — otherwise editing a style's
 * photo in Categories would silently do nothing, because `items` is a frozen
 * snapshot taken whenever the section was last saved.
 */
async function resolveStyleTiles(section) {
  const items = section.items ?? [];
  const slugs = items.map((item) => item.slug).filter(Boolean);
  if (slugs.length === 0) return items;

  const categories = await Category.find({ slug: { $in: slugs }, isActive: true })
    .select('slug image')
    .lean();
  const imageBySlug = new Map(categories.map((category) => [category.slug, category.image]));

  return items.map((item) => {
    const categoryImage = item.slug && imageBySlug.get(item.slug);
    return categoryImage?.url ? { ...item, image: categoryImage.url } : item;
  });
}

/**
 * Published collections for the home page grid.
 *
 * An explicit pick wins and keeps the admin's order; otherwise every published
 * collection appears, newest arrangement first. A collection with no products
 * is skipped — a tile that leads to an empty page is worse than no tile.
 */
async function resolveCollections(section) {
  const base = { status: 'published' };
  const query = section.collectionRefs?.length
    ? { ...base, _id: { $in: section.collectionRefs } }
    : base;

  const collections = await Collection.find(query)
    .select('name slug description image products sortOrder')
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  const withProducts = collections
    .filter((collection) => collection.products?.length)
    .map(({ products, ...rest }) => ({ ...rest, productCount: products.length }));

  if (!section.collectionRefs?.length) return withProducts;

  const byId = new Map(withProducts.map((collection) => [collection._id.toString(), collection]));
  return section.collectionRefs.map((id) => byId.get(String(id))).filter(Boolean);
}

/**
 * The published home page, ready for the storefront to render.
 *
 * Only live sections are returned, so an unpublished or expired section is
 * invisible to customers regardless of what the admin UI shows.
 */
export async function getPublishedHomepage() {
  const sections = await HomepageSection.find(HomepageSection.liveFilter())
    .sort({ sortOrder: 1 })
    .lean();

  return Promise.all(sections.map((section) => hydrate(section)));
}

/** Preview renders drafts too, so an admin can check work before publishing. */
export async function getHomepagePreview() {
  const sections = await HomepageSection.find({ status: { $ne: 'archived' } })
    .sort({ sortOrder: 1 })
    .lean();

  return Promise.all(sections.map((section) => hydrate(section)));
}

async function hydrate(section) {
  const base = {
    id: section._id.toString(),
    type: section.type,
    key: section.key,
    name: section.name,
    eyebrow: section.eyebrow,
    title: section.title,
    highlight: section.highlight,
    subtitle: section.subtitle,
    description: section.description,
    image: section.image,
    mobileImage: section.mobileImage,
    primaryCta: section.primaryCta,
    secondaryCta: section.secondaryCta,
    link: section.link,
    items: section.items ?? [],
    background: section.background,
    sortOrder: section.sortOrder,
    status: section.status,
  };

  if (section.type === 'productRail') {
    base.products = await resolveRailProducts(section);
    base.source = section.source;
  }

  if (section.type === 'categories') {
    base.categories = await resolveCategories(section);
  }

  if (section.type === 'styleRail') {
    base.items = await resolveStyleTiles(section);
  }

  if (section.type === 'collections') {
    base.collections = await resolveCollections(section);
  }

  return base;
}

// ── Admin write paths ────────────────────────────────────────────────────────

export async function listSections() {
  return HomepageSection.find({}).sort({ sortOrder: 1 }).lean();
}

export async function getSection(id) {
  const section = await HomepageSection.findById(id).lean();
  if (!section) throw ApiError.notFound('Section not found');
  return section;
}

export async function createSection(payload, adminId) {
  const exists = await HomepageSection.exists({ key: payload.key });
  if (exists) throw ApiError.conflict(`A section with the key "${payload.key}" already exists`);

  // New sections land at the end rather than silently taking position 0.
  if (payload.sortOrder === undefined) {
    const last = await HomepageSection.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
    payload.sortOrder = (last?.sortOrder ?? 0) + 1;
  }

  const section = await HomepageSection.create({ ...payload, updatedBy: adminId });
  return section.toObject();
}

export async function updateSection(id, payload, adminId) {
  const section = await HomepageSection.findById(id);
  if (!section) throw ApiError.notFound('Section not found');

  if (payload.key && payload.key !== section.key) {
    const clash = await HomepageSection.exists({ key: payload.key, _id: { $ne: id } });
    if (clash) throw ApiError.conflict(`A section with the key "${payload.key}" already exists`);
  }

  for (const [key, value] of Object.entries(payload)) {
    section[key] = value;
  }
  section.updatedBy = adminId;

  await section.save();
  return section.toObject();
}

export async function deleteSection(id) {
  const section = await HomepageSection.findById(id);
  if (!section) throw ApiError.notFound('Section not found');

  await section.deleteOne();
  return { deleted: true };
}

/** Persists a drag-and-drop reorder in one pass. */
export async function reorderSections(order = [], adminId) {
  await Promise.all(
    order.map((id, index) =>
      HomepageSection.findByIdAndUpdate(id, { $set: { sortOrder: index, updatedBy: adminId } }),
    ),
  );

  return listSections();
}

export default {
  getPublishedHomepage,
  getHomepagePreview,
  listSections,
  getSection,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
};
