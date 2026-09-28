/** Shared domain enums. Mirrored on the client in client/src/constants. */

export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  ADMIN: 'admin',
});

/** HUMOVARE is a menswear label. Kept as an enum so the schema can grow. */
export const GENDERS = Object.freeze(['men']);


export const FITS = Object.freeze(['oversized', 'regular', 'relaxed', 'slim', 'boxy']);

export const CATEGORY_TYPES = Object.freeze(['gender', 'product-type', 'collection', 'style']);

/**
 * Email domains a customer may sign up or check out with. Mirrored in
 * shop/src/constants for the form hints — the server is the one that
 * enforces it. Existing accounts on other domains can still sign in and
 * reset their password; the rule only applies to addresses entered from now.
 */
export const CUSTOMER_EMAIL_DOMAINS = Object.freeze(['gmail.com']);

export const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
});

export const ORDER_STATUS_VALUES = Object.freeze(Object.values(ORDER_STATUS));

/**
 * Statuses a customer is still allowed to cancel from. Once a parcel is with
 * the courier, cancellation becomes a returns problem instead.
 */
export const CANCELLABLE_STATUSES = Object.freeze([
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PROCESSING,
]);

/**
 * The order's money, separate from where the parcel is (`ORDER_STATUS`).
 * PAID is only ever set from a server-side verification with the gateway, or
 * — for Cash on Delivery — when an admin marks the parcel delivered.
 */
export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

/**
 * Stored on a few orders from before refunds were removed. Accepted so those
 * records still load and save; nothing in the application sets them.
 */
export const HISTORICAL_PAYMENT_STATUSES = Object.freeze(['REFUNDED']);

/** One trip to the gateway's checkout. An order can have several. */
export const PAYMENT_ATTEMPT_STATUS = Object.freeze({
  CREATED: 'CREATED',
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
});

export const PAYMENT_GATEWAYS = Object.freeze({ PHONEPE: 'PHONEPE' });

/** The payment audit trail. Never holds a secret, token or card detail. */
export const PAYMENT_EVENT_TYPES = Object.freeze({
  PAYMENT_CREATED: 'PAYMENT_CREATED',
  PAYMENT_CREATE_FAILED: 'PAYMENT_CREATE_FAILED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  PAYMENT_LATE_SUCCESS: 'PAYMENT_LATE_SUCCESS',
  ORDER_PAYMENT_EXPIRED: 'ORDER_PAYMENT_EXPIRED',
  WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',
  WEBHOOK_REJECTED: 'WEBHOOK_REJECTED',
});

export const PAYMENT_METHODS = Object.freeze({
  COD: 'COD',
  ONLINE: 'ONLINE',
});

export const PRODUCT_SORTS = Object.freeze({
  featured: { isFeatured: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  'best-selling': { soldCount: -1, createdAt: -1 },
  'price-asc': { price: 1, createdAt: -1 },
  'price-desc': { price: -1, createdAt: -1 },
  'discount-desc': { discountPercentage: -1, createdAt: -1 },
});

/** Virtual collections resolved from product flags rather than a category ref. */
export const VIRTUAL_COLLECTIONS = Object.freeze({
  'new-drops': { isNewDrop: true },
  bestsellers: { isBestSeller: true },
  sale: { discountPercentage: { $gt: 0 } },
  featured: { isFeatured: true },
  'designer-wear-exclusive': { isDesignerExclusive: true },
});

export const LOW_STOCK_THRESHOLD = 5;

/** Product types the storefront Shop menu shows at once (its card grid is four wide). */
export const SHOP_MENU_LIMIT = 4;
