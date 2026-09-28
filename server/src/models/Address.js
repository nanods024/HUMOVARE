import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, trim: true, enum: ['home', 'work', 'other'], default: 'home' },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, match: /^[0-9]{10}$/ },
    addressLine1: { type: String, required: true, trim: true, maxlength: 160 },
    addressLine2: { type: String, trim: true, maxlength: 160, default: '' },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    postalCode: { type: String, required: true, trim: true, match: /^[0-9]{6}$/ },
    country: { type: String, required: true, trim: true, default: 'India' },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

addressSchema.index({ user: 1, isDefault: -1, updatedAt: -1 });

/**
 * Exactly one default per user. Doing this in a hook keeps the invariant with
 * the data rather than relying on every caller to remember it.
 */
addressSchema.pre('save', async function enforceSingleDefault(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    await this.constructor.updateMany(
      { user: this.user, _id: { $ne: this._id } },
      { $set: { isDefault: false } },
    );
  }
  next();
});

export const Address = mongoose.model('Address', addressSchema);
export default Address;
