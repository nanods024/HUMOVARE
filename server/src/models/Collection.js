import mongoose from 'mongoose';
import { imageSchema } from './shared/image.schema.js';
import { CONTENT_STATUSES } from './HomepageSection.js';

/**
 * A curated product grouping with explicit ordering.
 *
 * Distinct from `Category` (the taxonomy the catalogue hangs off): a
 * collection is a merchandising decision — "Summer Drop", "Under 1500" — and
 * the order of its products is chosen, not derived.
 */
const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    image: { type: imageSchema, default: null },

    /** Ordering is the point of a collection, so position is stored per line. */
    products: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        sortOrder: { type: Number, default: 0 },
        _id: false,
      },
    ],

    status: { type: String, enum: CONTENT_STATUSES, default: 'draft', index: true },
    showInNav: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },

    seo: {
      title: { type: String, trim: true, default: '' },
      description: { type: String, trim: true, default: '' },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

collectionSchema.index({ status: 1, sortOrder: 1 });

export const Collection = mongoose.model('Collection', collectionSchema);
export default Collection;
