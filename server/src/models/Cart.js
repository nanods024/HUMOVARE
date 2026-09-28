import mongoose from 'mongoose';

/**
 * Cart lines snapshot the price at the time of adding so a price change does
 * not silently rewrite what the customer thought they were paying. The
 * service layer re-validates against the live product before checkout.
 */
const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true, trim: true },
    size: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1, max: 10, default: 1 },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
  },
  { _id: true, timestamps: true },
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: { type: [cartItemSchema], default: [] },
    /**
     * Held for the few seconds checkout takes, so two "Place order" requests
     * for the same bag (a double click, a retried request) cannot both turn it
     * into an order. Stale locks expire on their own.
     */
    checkoutLockedAt: { type: Date, default: null },
    totalQuantity: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

/**
 * Lookup by product within carts. Not unique: cart.service merges repeat
 * adds into one line, the index only speeds the lookup.
 */
cartSchema.index({ user: 1, 'items.product': 1, 'items.variantId': 1 });

export const Cart = mongoose.model('Cart', cartSchema);
export default Cart;
