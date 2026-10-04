/** Storefront constants. Domain enums mirror server/src/constants. */

export const BRAND = {
  name: 'HUMOVARE',
  tagline: 'Not just clothing. A movement.',
  email: 'hello@humovare.in',
  phone: '+91 79893 55385',
  phoneRaw: '917989355385',
  address: {
    line1: 'Door No. 43-18-41, P Savitri Enclave, 3F4',
    line2: 'TSN Colony, Venkat Raju Nagar, Dondaparthy',
    city: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    postalCode: '530016',
  },
  instagram: 'https://instagram.com/humovare',
  whatsapp: 'https://wa.me/917989355385',
} as const;

/**
 * Primary navigation. HUMOVARE is a menswear label, so the nav is organised
 * by product type rather than by gender.
 */
export const NAV_LINKS = [
  { label: 'T-SHIRTS', to: '/t-shirts' },
  { label: 'HOODIES', to: '/hoodies' },
  { label: 'SHIRTS', to: '/shirts' },
  { label: 'BOTTOM WEAR', to: '/bottom-wear' },
  { label: 'NEW DROPS', to: '/new-drops' },
  { label: 'BESTSELLERS', to: '/bestsellers' },
  { label: 'DESIGNER WEAR - EXCLUSIVE', to: '/designer-wear-exclusive', accent: true },
] as const;

/**
 * Collection routes. `collection` slugs resolve to product flags on the
 * server; `category` slugs resolve to a real Category document.
 */
/** Every state and union territory, for address forms. */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
];

export const COLLECTION_ROUTES: Record<string, { param: 'category' | 'collection'; title: string }> = {
  't-shirts': { param: 'category', title: 'T-Shirts' },
  hoodies: { param: 'category', title: 'Hoodies' },
  shirts: { param: 'category', title: 'Shirts' },
  'bottom-wear': { param: 'category', title: 'Bottom Wear' },
  'new-drops': { param: 'collection', title: 'New Drops' },
  bestsellers: { param: 'collection', title: 'Bestsellers' },
  sale: { param: 'collection', title: 'Sale' },
  'designer-wear-exclusive': { param: 'collection', title: 'Designer Wear - Exclusive' },
};

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest first' },
  { value: 'best-selling', label: 'Best selling' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'discount-desc', label: 'Biggest discount' },
] as const;

export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38'];

export const FIT_LABELS: Record<string, string> = {
  oversized: 'Oversized',
  regular: 'Regular',
  relaxed: 'Relaxed',
  slim: 'Slim',
  boxy: 'Boxy',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Payment pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Preparing your order',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/** The linear path an order walks; used to render the tracking stepper. */
export const ORDER_TIMELINE = [
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

export const CANCELLABLE_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING'];

export const LOW_STOCK_THRESHOLD = 5;
export const MAX_QUANTITY_PER_LINE = 10;
export const PRODUCTS_PER_PAGE = 24;

/** Editorial style rails on the homepage. */
export const STYLE_TILES = [
  { slug: 'oversized', title: 'Oversized', copy: 'Deliberate volume.' },
  { slug: 'graphic-tees', title: 'Graphic Tees', copy: 'Say it without shouting.' },
  { slug: 'minimal', title: 'Minimal', copy: 'Nothing spare.' },
  { slug: 'streetwear', title: 'Streetwear', copy: 'Built for pavement.' },
  { slug: 'essentials', title: 'Essentials', copy: 'The base layer.' },
] as const;

export const STORAGE_KEYS = {
  guestCart: 'humovare.cart.v1',
  recentlyViewed: 'humovare.recent.v1',
} as const;

export const SITE_URL = import.meta.env.VITE_SITE_URL || (import.meta.env.PROD ? 'https://humovare.in' : 'http://localhost:5173');
