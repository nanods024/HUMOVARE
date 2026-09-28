import mongoose from 'mongoose';
import { imageSchema } from './shared/image.schema.js';

/**
 * Section types the customer home page can actually render.
 *
 * This list is closed on purpose: the admin curates sections the storefront
 * already implements, and cannot invent a type that would render as nothing.
 * Adding a type here means adding a component on the customer side too.
 */
export const HOMEPAGE_SECTION_TYPES = Object.freeze([
  'hero',
  'categories',
  'collections',
  'productRail',
  'brandStory',
  'styleRail',
  'quality',
  'community',
  'trust',
]);

export const CONTENT_STATUSES = Object.freeze(['draft', 'published', 'scheduled', 'archived']);

const ctaSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
    variant: { type: String, enum: ['primary', 'secondary', 'outline', 'glass', 'link'], default: 'primary' },
  },
  { _id: false },
);

const homepageSectionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: HOMEPAGE_SECTION_TYPES, required: true, index: true },
    /** Stable identifier so the storefront can target a specific instance. */
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },

    eyebrow: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: '' },
    /** Rendered in brand red inside the heading, if the component supports it. */
    highlight: { type: String, trim: true, default: '' },
    subtitle: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, maxlength: 2000, default: '' },

    image: { type: imageSchema, default: null },
    mobileImage: { type: imageSchema, default: null },

    primaryCta: { type: ctaSchema, default: null },
    secondaryCta: { type: ctaSchema, default: null },
    link: { type: ctaSchema, default: null },

    /**
     * Type-specific structured content — style tiles, quality pillars, trust
     * items, community tiles, brand-story paragraphs. Structured fields only:
     * arbitrary HTML is never accepted or rendered.
     */
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },

    /** Manual overrides. Empty means "use the automatic query". */
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    /** For the collections grid: an explicit pick, in the admin's order. */
    collectionRefs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],

    /** For productRail: which flag drives the automatic query. */
    source: {
      type: String,
      enum: ['newDrops', 'bestsellers', 'featured', 'sale', 'designerExclusive', 'manual'],
      default: 'manual',
    },
    limit: { type: Number, min: 1, max: 24, default: 8 },

    background: { type: String, enum: ['canvas', 'surface', 'dark'], default: 'canvas' },

    sortOrder: { type: Number, default: 0, index: true },
    status: { type: String, enum: CONTENT_STATUSES, default: 'draft', index: true },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

homepageSectionSchema.index({ status: 1, sortOrder: 1 });

/**
 * Live means published (or a scheduled section whose window has opened) and
 * not yet expired. The customer endpoint filters on exactly this.
 */
homepageSectionSchema.statics.liveFilter = function liveFilter(now = new Date()) {
  return {
    status: { $in: ['published', 'scheduled'] },
    $and: [
      { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
    ],
  };
};

export const HomepageSection = mongoose.model('HomepageSection', homepageSectionSchema);
export default HomepageSection;
