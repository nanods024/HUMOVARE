import { env } from '../config/env.js';
import { storeSettings } from '../services/storeSettings.service.js';

/** Money is handled in whole rupees (integers) to avoid float drift. */
export const toMoney = (value) => Math.round(Number(value) || 0);

export function shippingFeeFor(payable) {
  if (payable <= 0) return 0;
  const { freeShippingThreshold, shippingFee } = storeSettings().shipping;
  return payable >= freeShippingThreshold ? 0 : shippingFee;
}

/**
 * Single source of truth for cart and order totals so the summary a customer
 * sees in the cart is the one the order is written with.
 */
export function summariseTotals({ subtotal, discount = 0, shippingFee }) {
  const safeSubtotal = toMoney(subtotal);
  const safeDiscount = Math.min(toMoney(discount), safeSubtotal);
  const payable = safeSubtotal - safeDiscount;
  const fee = shippingFee === undefined ? shippingFeeFor(payable) : toMoney(shippingFee);

  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    shippingFee: fee,
    total: payable + fee,
    currency: env.commerce.currency,
    freeShippingThreshold: storeSettings().shipping.freeShippingThreshold,
  };
}

export default { toMoney, shippingFeeFor, summariseTotals };
