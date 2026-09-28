import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { ApiError } from '../utils/ApiError.js';
import { uniqueSlug } from '../utils/slugify.js';
import { VIRTUAL_COLLECTIONS, SHOP_MENU_LIMIT } from '../constants/index.js';

export async function listCategories({ type, nav, manage } = {}) {
  // The admin Categories screen lists what it can manage — product types and
  // styles — hidden ones included, so hiding a category never makes it look
  // deleted. Everything else sees active categories only.
  if (manage === 'true') {
    return Category.find({ type: { $in: MANAGED_TYPES } }).sort({ displayOrder: 1, name: 1 }).lean();
  }

  const filter = { isActive: true };
  if (type) filter.type = type;
  if (nav === 'true') filter.showInNav = true;

  return Category.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
}

/**
 * What the admin may do to each kind of category:
 *  - product types are fully editable (create, rename, hide, delete);
 *  - styles are a fixed set whose only editable part is the image;
 *  - collections (new drops, sale…) and genders are driven by product flags
 *    and are not edited from the admin at all.
 */
const MANAGED_TYPES = ['product-type', 'style'];
const PRODUCT_TYPE_FIELDS = ['name', 'description', 'image', 'showInNav', 'displayOrder', 'isActive', 'slug', 'parent'];
const STYLE_FIELDS = ['image'];

/**
 * The Shop menu shows at most SHOP_MENU_LIMIT product types. Refuse any write
 * that would leave a product type active *and* in the menu once it is full —
 * that covers ticking "Show in menu" as well as un-hiding one already ticked.
 */
async function assertMenuHasRoom(category) {
  if (category.type !== 'product-type' || !category.showInNav || !category.isActive) return;

  const others = await Category.countDocuments({
    _id: { $ne: category._id },
    type: 'product-type',
    showInNav: true,
    isActive: true,
  });

  if (others >= SHOP_MENU_LIMIT) {
    throw ApiError.conflict(
      `The Shop menu shows up to ${SHOP_MENU_LIMIT} product types. Take one out of the menu first.`,
    );
  }
}

function editableFields(category) {
  if (category.type === 'product-type') return PRODUCT_TYPE_FIELDS;
  if (category.type === 'style') return STYLE_FIELDS;
  return [];
}

/**
 * Navigation is data, not markup: the header, footer and mobile drawer all
 * render from this one grouped payload.
 */
export async function getNavigationTree() {
  const categories = await Category.find({ isActive: true, showInNav: true })
    .sort({ displayOrder: 1, name: 1 })
    .select('name slug type displayOrder image')
    .lean();

  const byType = (type) => categories.filter((category) => category.type === type);

  return {
    gender: byType('gender'),
    // Writes already enforce the cap; slicing keeps the menu right regardless.
    productTypes: byType('product-type').slice(0, SHOP_MENU_LIMIT),
    collections: byType('collection'),
    styles: byType('style'),
    all: categories,
  };
}

export async function getCategoryBySlug(slug) {
  // Virtual collections have no document but must still render a real page.
  if (VIRTUAL_COLLECTIONS[slug]) {
    const fallbackTitles = {
      'new-drops': 'New Drops',
      bestsellers: 'Bestsellers',
      sale: 'Sale',
      featured: 'Featured',
    };
    const existing = await Category.findOne({ slug, isActive: true }).lean();
    if (existing) return existing;

    return {
      _id: null,
      name: fallbackTitles[slug] || slug,
      slug,
      type: 'collection',
      isVirtual: true,
      description: '',
      image: null,
      seo: { title: '', description: '' },
    };
  }

  const category = await Category.findOne({ slug, isActive: true }).lean();
  if (!category) throw ApiError.notFound('Collection not found');
  return category;
}

export async function createCategory(payload) {
  // Only product types are created from the admin.
  const data = { ...payload, type: 'product-type', isVirtual: false };
  data.slug = await uniqueSlug(Category, data.slug || data.name);
  const category = new Category(data);
  await assertMenuHasRoom(category);
  await category.save();
  return category.toObject();
}

export async function updateCategory(id, payload) {
  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');

  const allowed = editableFields(category);
  if (allowed.length === 0) {
    throw ApiError.forbidden('This category is managed automatically and cannot be edited.');
  }

  const blocked = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (category.type === 'style' && blocked.length > 0) {
    throw ApiError.badRequest('Only the image of a style can be changed.');
  }

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'slug' || !allowed.includes(key)) continue;
    category[key] = value;
  }

  if (allowed.includes('slug') && payload.slug && payload.slug !== category.slug) {
    category.slug = await uniqueSlug(Category, payload.slug, category._id);
  }

  if (category.isModified('showInNav') || category.isModified('isActive')) {
    await assertMenuHasRoom(category);
  }

  await category.save();
  return category.toObject();
}

/**
 * Categories are never hard-deleted while products point at them; that would
 * orphan the catalogue. Deactivate instead and say why.
 */
export async function deleteCategory(id) {
  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');

  if (category.type !== 'product-type') {
    throw ApiError.forbidden('Only product types can be deleted.');
  }

  const inUse = await Product.countDocuments({ category: category._id });
  if (inUse > 0) {
    throw ApiError.conflict(
      `${inUse} product(s) still belong to this category. Move them first or deactivate the category.`,
    );
  }

  await category.deleteOne();
  return { deleted: true };
}

export default {
  listCategories,
  getNavigationTree,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
};
