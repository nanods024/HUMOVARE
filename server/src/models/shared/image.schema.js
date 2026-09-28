import mongoose from 'mongoose';

/**
 * Cloudinary reference. We persist the `publicId` alongside the URL so the
 * asset can be transformed on the fly and destroyed when the product is
 * deleted. Binaries are never stored in MongoDB.
 */
export const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, trim: true, default: '' },
    alt: { type: String, trim: true, default: '' },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: false },
);

export default imageSchema;
