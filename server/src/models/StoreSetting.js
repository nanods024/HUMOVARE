import mongoose from 'mongoose';
import { imageSchema } from './shared/image.schema.js';
import { DEFAULT_COD_PIN_AREAS } from '../constants/codAreas.js';

/**
 * Singleton holding business configuration that must never require a code
 * change: store identity, contact details, shipping thresholds, the returns
 * window and SEO defaults.
 */
const storeSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, immutable: true },

    storeName: { type: String, trim: true, default: 'HUMOVARE' },
    tagline: { type: String, trim: true, default: 'Not just clothing. A movement.' },
    logo: { type: imageSchema, default: null },

    contactEmail: { type: String, trim: true, lowercase: true, default: '' },
    supportEmail: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    whatsapp: { type: String, trim: true, default: '' },
    instagram: { type: String, trim: true, default: '' },

    address: {
      line1: { type: String, trim: true, default: '' },
      line2: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      postalCode: { type: String, trim: true, default: '' },
      country: { type: String, trim: true, default: 'India' },
    },

    currency: { type: String, trim: true, default: 'INR' },
    timezone: { type: String, trim: true, default: 'Asia/Kolkata' },

    shipping: {
      freeShippingThreshold: { type: Number, min: 0, default: 999 },
      shippingFee: { type: Number, min: 0, default: 79 },
      dispatchDays: { type: Number, min: 0, default: 2 },
      deliveryEstimateDays: { type: Number, min: 1, default: 6 },
      codEnabled: { type: Boolean, default: true },
      codMaxOrderValue: { type: Number, min: 0, default: 10000 },
      // Cash on Delivery only for deliveries to one city (Visakhapatnam by
      // default); everywhere else pays online.
      codCityOnly: { type: Boolean, default: true },
      codCity: { type: String, trim: true, default: 'Visakhapatnam' },
      codState: { type: String, trim: true, default: 'Andhra Pradesh' },
      // The typed city is only a claim; the PIN code has to agree with it.
      codPinCheck: { type: Boolean, default: true },
      codPinPrefixes: { type: [String], default: ['530', '531'] },
      // The exact PINs (with area names) that count, shown to customers as a
      // dropdown. When the list is empty the prefixes above are used instead.
      codPinAreas: {
        type: [{ _id: false, pin: { type: String, trim: true }, area: { type: String, trim: true } }],
        default: () => DEFAULT_COD_PIN_AREAS.map((entry) => ({ ...entry })),
      },
    },

    returns: {
      windowDays: { type: Number, min: 0, default: 7 },
      freePickup: { type: Boolean, default: true },
    },

    seo: {
      defaultTitle: { type: String, trim: true, default: '' },
      defaultDescription: { type: String, trim: true, default: '' },
      ogImage: { type: imageSchema, default: null },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

export const StoreSetting = mongoose.model('StoreSetting', storeSettingSchema);
export default StoreSetting;
