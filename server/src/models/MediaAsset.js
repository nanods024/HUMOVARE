import mongoose from 'mongoose';

/**
 * Cloudinary metadata mirrored into MongoDB.
 *
 * Cloudinary stores the bytes; this collection makes them searchable, lets us
 * attach alt text, and tracks where an asset is used so the library can refuse
 * to delete something a published product still references.
 */
const mediaAssetSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true, index: true },
    secureUrl: { type: String, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    format: { type: String, default: '' },
    bytes: { type: Number, default: 0 },
    resourceType: { type: String, default: 'image' },
    folder: { type: String, default: '', index: true },
    altText: { type: String, trim: true, default: '' },
    tags: [{ type: String, trim: true, lowercase: true }],
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

mediaAssetSchema.index({ createdAt: -1 });
mediaAssetSchema.index({ folder: 1, createdAt: -1 });

export const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema);
export default MediaAsset;
