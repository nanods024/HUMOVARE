import mongoose from 'mongoose';

/**
 * Append-only stock ledger.
 *
 * Stock lives on the product variant, but "why did this change?" cannot be
 * answered from a number. Every adjustment writes a row here with the delta,
 * the resulting balance, the reason and who did it.
 */
const inventoryTransactionSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sku: { type: String, default: '' },

    type: {
      type: String,
      enum: ['adjustment', 'sale', 'return', 'restock', 'correction', 'cancellation'],
      required: true,
    },
    /** Signed: negative removes stock. */
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },

    reason: { type: String, trim: true, maxlength: 240, default: '' },
    reference: { type: String, trim: true, default: '' },

    adminUser: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

inventoryTransactionSchema.index({ product: 1, createdAt: -1 });
inventoryTransactionSchema.index({ createdAt: -1 });

export const InventoryTransaction = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
export default InventoryTransaction;
