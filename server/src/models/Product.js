import mongoose from 'mongoose';
import { GENDERS, FITS, LOW_STOCK_THRESHOLD } from '../constants/index.js';
import { imageSchema } from './shared/image.schema.js';

const colorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    hex: { type: String, required: true, trim: true, match: /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/ },
  },
  { _id: false },
);

/**
 * A variant is the unit that is actually sold and reserved. Stock lives here,
 * never on the product, so two sizes of the same tee cannot oversell one
 * another.
 */
const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    size: { type: String, required: true, trim: true, uppercase: true },
    color: { type: String, required: true, trim: true },
    colorSlug: { type: String, required: true, lowercase: true, trim: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
    /** Optional per-variant override; falls back to the product price. */
    price: { type: Number, min: 0, default: null },
  },
  { _id: true },
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    shortDescription: { type: String, trim: true, maxlength: 300, default: '' },
    brand: { type: String, trim: true, default: 'HUMOVARE' },

    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    /** Secondary categories (e.g. a men's tee also lives under "oversized"). */
    collections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    gender: { type: String, enum: GENDERS, required: true, index: true },

    price: { type: Number, required: true, min: 0, index: true },
    mrp: { type: Number, required: true, min: 0 },
    discountPercentage: { type: Number, min: 0, max: 95, default: 0, index: true },
    taxIncluded: { type: Boolean, default: true },

    sizes: [{ type: String, trim: true, uppercase: true }],
    colors: { type: [colorSchema], default: [] },
    variants: { type: [variantSchema], default: [] },

    fit: { type: String, enum: FITS, default: 'regular', index: true },
    careInstructions: [{ type: String, trim: true }],
    highlights: [{ type: String, trim: true }],

    images: { type: [imageSchema], default: [] },
    thumbnail: { type: imageSchema, default: null },

    tags: [{ type: String, trim: true, lowercase: true }],

    /** Aggregate of variant stock, recomputed on save for cheap filtering. */
    stock: { type: Number, min: 0, default: 0, index: true },
    soldCount: { type: Number, min: 0, default: 0 },

    rating: {
      average: { type: Number, min: 0, max: 5, default: 0 },
      count: { type: Number, min: 0, default: 0 },
    },

    isFeatured: { type: Boolean, default: false, index: true },
    isBestSeller: { type: Boolean, default: false, index: true },
    isNewDrop: { type: Boolean, default: false, index: true },
    isDesignerExclusive: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },

    seo: {
      title: { type: String, trim: true, default: '' },
      description: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// ── Indexes ──────────────────────────────────────────────────────────────────
// Every storefront listing filters on isActive first, then narrows by facet and
// sorts. These compound indexes mirror those query shapes.
productSchema.index({ isActive: 1, category: 1, createdAt: -1 });
productSchema.index({ isActive: 1, gender: 1, createdAt: -1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ isActive: 1, isNewDrop: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isBestSeller: 1, soldCount: -1 });
productSchema.index({ isActive: 1, isFeatured: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isDesignerExclusive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, discountPercentage: -1 });
// Storefront sorts (see PRODUCT_SORTS): each needs a matching key order, or
// MongoDB sorts every matching product in memory.
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isFeatured: -1, createdAt: -1 });
productSchema.index({ isActive: 1, soldCount: -1, createdAt: -1 });
// Category pages match `category` OR `collections`; an $or can only use
// indexes when every branch has one.
productSchema.index({ collections: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ 'variants.size': 1 });
productSchema.index({ 'variants.colorSlug': 1 });
// Weighted text index powers /api/products?search= and the search overlay.
productSchema.index(
  { name: 'text', tags: 'text', shortDescription: 'text', description: 'text' },
  { weights: { name: 10, tags: 6, shortDescription: 3, description: 1 }, name: 'product_search' },
);

// ── Virtuals ─────────────────────────────────────────────────────────────────
productSchema.virtual('inStock').get(function inStock() {
  return this.stock > 0;
});

productSchema.virtual('isLowStock').get(function isLowStock() {
  return this.stock > 0 && this.stock <= LOW_STOCK_THRESHOLD;
});

productSchema.virtual('savings').get(function savings() {
  return Math.max(0, (this.mrp || 0) - (this.price || 0));
});

// ── Hooks ────────────────────────────────────────────────────────────────────
productSchema.pre('save', function syncDerivedFields(next) {
  if (this.mrp < this.price) this.mrp = this.price;

  this.discountPercentage = this.mrp > this.price
    ? Math.round(((this.mrp - this.price) / this.mrp) * 100)
    : 0;

  if (this.variants?.length) {
    this.stock = this.variants.reduce((total, variant) => total + (variant.stock || 0), 0);
    this.sizes = [...new Set(this.variants.map((variant) => variant.size))];
  }

  if (!this.thumbnail && this.images?.length) {
    this.thumbnail = this.images[0];
  }

  next();
});

export const Product = mongoose.model('Product', productSchema);
export default Product;
