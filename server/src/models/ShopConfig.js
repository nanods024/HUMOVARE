import mongoose from 'mongoose';

/**
 * Filters the customer `FilterSidebar` actually implements.
 *
 * The admin curates this list — enabling, renaming and reordering — but cannot
 * add a key the sidebar has no code for. That makes it impossible to configure
 * the shop page into a broken state.
 */
export const SUPPORTED_FILTERS = Object.freeze([
  'availability',
  'size',
  'colour',
  'price',
  'fit',
  'collection',
]);

/** Sort keys the products service understands. Mirrors PRODUCT_SORTS. */
export const SUPPORTED_SORTS = Object.freeze([
  'featured',
  'newest',
  'best-selling',
  'price-asc',
  'price-desc',
  'discount-desc',
]);

const filterSchema = new mongoose.Schema(
  {
    key: { type: String, enum: SUPPORTED_FILTERS, required: true },
    label: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    defaultOpen: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false },
);

const sortOptionSchema = new mongoose.Schema(
  {
    value: { type: String, enum: SUPPORTED_SORTS, required: true },
    label: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * Singleton document holding everything the shop page reads.
 * `key` is fixed so `findOneAndUpdate({ key: 'default' }, …, { upsert })`
 * can never create a second copy.
 */
const shopConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, immutable: true },

    title: { type: String, trim: true, default: 'Shop all' },
    description: { type: String, trim: true, maxlength: 600, default: '' },

    filters: { type: [filterSchema], default: [] },
    sortOptions: { type: [sortOptionSchema], default: [] },
    defaultSort: { type: String, enum: SUPPORTED_SORTS, default: 'featured' },

    pageSize: { type: Number, min: 8, max: 60, default: 24 },

    emptyTitle: { type: String, trim: true, default: 'No products match those filters' },
    emptyDescription: {
      type: String,
      trim: true,
      default: 'Try widening your price range or clearing a filter.',
    },

    seo: {
      title: { type: String, trim: true, default: '' },
      description: { type: String, trim: true, default: '' },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

/** The shape used both as a seed and as the fallback if nothing is stored. */
shopConfigSchema.statics.defaults = function defaults() {
  return {
    key: 'default',
    title: 'Shop all',
    description: 'Every piece we make, in one place. Filter by size, colour and fit to narrow it down.',
    filters: [
      { key: 'availability', label: 'Availability', enabled: true, defaultOpen: true, sortOrder: 1 },
      { key: 'size', label: 'Size', enabled: true, defaultOpen: true, sortOrder: 2 },
      { key: 'colour', label: 'Colour', enabled: true, defaultOpen: true, sortOrder: 3 },
      { key: 'price', label: 'Price', enabled: true, defaultOpen: true, sortOrder: 4 },
      { key: 'fit', label: 'Fit', enabled: true, defaultOpen: false, sortOrder: 5 },
      { key: 'collection', label: 'Collection', enabled: true, defaultOpen: false, sortOrder: 6 },
    ],
    sortOptions: [
      { value: 'featured', label: 'Featured', enabled: true, sortOrder: 1 },
      { value: 'newest', label: 'Newest first', enabled: true, sortOrder: 2 },
      { value: 'best-selling', label: 'Best selling', enabled: true, sortOrder: 3 },
      { value: 'price-asc', label: 'Price: low to high', enabled: true, sortOrder: 4 },
      { value: 'price-desc', label: 'Price: high to low', enabled: true, sortOrder: 5 },
      { value: 'discount-desc', label: 'Biggest discount', enabled: true, sortOrder: 6 },
    ],
    defaultSort: 'featured',
    pageSize: 24,
  };
};

export const ShopConfig = mongoose.model('ShopConfig', shopConfigSchema);
export default ShopConfig;
