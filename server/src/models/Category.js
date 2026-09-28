import mongoose from 'mongoose';
import { CATEGORY_TYPES } from '../constants/index.js';
import { imageSchema } from './shared/image.schema.js';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 600, default: '' },
    type: { type: String, enum: CATEGORY_TYPES, default: 'product-type', index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    image: { type: imageSchema, default: null },
    /**
     * Collections such as new-drops or sale are not real categories: products
     * are matched by flag instead of by reference. Flagging them here keeps
     * navigation, SEO and filtering driven from one list.
     */
    isVirtual: { type: Boolean, default: false },
    showInNav: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    seo: {
      title: { type: String, trim: true, default: '' },
      description: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

categorySchema.index({ isActive: 1, showInNav: 1, displayOrder: 1 });
categorySchema.index({ type: 1, isActive: 1 });

export const Category = mongoose.model('Category', categorySchema);
export default Category;
