/** Shared API types. These mirror the Mongoose schemas on the server. */

/** HUMOVARE is a menswear label; the enum is kept so the schema can grow. */
export type Gender = 'men';
export type Fit = 'oversized' | 'regular' | 'relaxed' | 'slim' | 'boxy';
export type CategoryType = 'gender' | 'product-type' | 'collection' | 'style';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface Pagination {
  currentPage: number;
  limit: number;
  totalProducts: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CloudinaryImage {
  url: string;
  publicId?: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
}

export interface ProductColor {
  name: string;
  slug: string;
  hex: string;
}

export interface ProductVariant {
  _id: string;
  sku: string;
  size: string;
  color: string;
  colorSlug: string;
  stock: number;
  price: number | null;
}

export interface CategoryRef {
  _id: string;
  name: string;
  slug: string;
}

/** The shape returned by listing endpoints — no description, no variants. */
export interface ProductCardData {
  _id: string;
  name: string;
  slug: string;
  price: number;
  mrp: number;
  discountPercentage: number;
  thumbnail: CloudinaryImage | null;
  images: CloudinaryImage[];
  colors: ProductColor[];
  sizes: string[];
  gender: Gender;
  fit?: Fit;
  stock: number;
  soldCount?: number;
  isNewDrop?: boolean;
  isBestSeller?: boolean;
  isFeatured?: boolean;
  rating?: { average: number; count: number };
  category?: CategoryRef;
  createdAt?: string;
  inStock?: boolean;
  isLowStock?: boolean;
}

/** The full document returned by /api/products/:slug. */
export interface Product extends ProductCardData {
  description: string;
  shortDescription: string;
  brand: string;
  collections?: CategoryRef[];
  variants: ProductVariant[];
  careInstructions: string[];
  highlights: string[];
  taxIncluded: boolean;
  tags: string[];
  seo?: { title: string; description: string };
}

export interface Category {
  _id: string | null;
  name: string;
  slug: string;
  description: string;
  type: CategoryType;
  image: CloudinaryImage | null;
  isVirtual?: boolean;
  showInNav?: boolean;
  displayOrder?: number;
  seo?: { title: string; description: string };
}

export interface NavigationTree {
  gender: Category[];
  productTypes: Category[];
  collections: Category[];
  styles: Category[];
  all: Category[];
}

export interface FacetValue {
  value: string;
  count: number;
  name?: string;
  hex?: string;
}

export interface ProductFacets {
  price: { min: number; max: number };
  sizes: FacetValue[];
  colors: FacetValue[];
  fits: FacetValue[];
  genders: FacetValue[];
}

// ── User & auth ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin';
  createdAt?: string;
}

export interface Address {
  _id: string;
  label: 'home' | 'work' | 'other';
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export type AddressInput = Omit<Address, '_id' | 'isDefault' | 'label' | 'addressLine2'> &
  Partial<Pick<Address, 'label' | 'isDefault' | 'addressLine2'>>;

// ── Cart ─────────────────────────────────────────────────────────────────────

export interface CartNotice {
  type: 'removed' | 'quantity' | 'price' | 'skipped';
  message: string;
}

export interface CartSummary {
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  currency: string;
  freeShippingThreshold: number;
}

export interface CartLine {
  id: string;
  productId: string;
  name: string;
  slug: string;
  image: string;
  variantId: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  price: number;
  mrp: number;
  lineTotal: number;
  maxQuantity: number;
}

export interface Cart {
  id: string;
  items: CartLine[];
  totalQuantity: number;
  summary: CartSummary;
  savings: number;
  notices: CartNotice[];
}

/** A cart line held in localStorage before the shopper signs in. */
export interface GuestCartLine {
  productId: string;
  variantId: string;
  quantity: number;
  /** Denormalised so the guest bag renders without extra requests. */
  name: string;
  slug: string;
  image: string;
  size: string;
  color: string;
  price: number;
  mrp: number;
  sku: string;
  maxQuantity: number;
}

export interface Wishlist {
  id: string;
  products: ProductCardData[];
  count: number;
  productIds: string[];
}

// ── Orders ───────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';
export type PaymentMethod = 'COD' | 'ONLINE';

export interface OrderItem {
  product: string;
  variantId: string;
  name: string;
  slug: string;
  sku: string;
  image: string;
  size: string;
  color: string;
  quantity: number;
  price: number;
  mrp: number;
  lineTotal: number;
}

export interface Order {
  _id: string;
  orderNumber: string;
  items: OrderItem[];
  shippingAddress: Omit<Address, '_id' | 'isDefault' | 'label'> & { email?: string };
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** Summary only; set by the server from a verified PhonePe result. */
  payment?: {
    provider?: string;
    reference?: string;
    paymentMode?: string;
    paidAt?: string | null;
    expiresAt?: string | null;
  };
  orderStatus: OrderStatus;
  statusHistory: { status: OrderStatus; note: string; at: string }[];
  customerNote?: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  /** Courier details, filled in by the shop when the parcel ships. */
  shipment?: {
    carrier?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estimatedDelivery?: string | null;
    shippedAt?: string | null;
  };
}

/** The one city Cash on Delivery is limited to (set in admin Settings). */
export interface CodArea {
  city: string;
  state: string;
  /** The delivery PIN must start with one of these; empty = city only. */
  pinPrefixes?: string[];
  /** The exact PINs that count, with area names — shown as a dropdown. */
  pinAreas?: { pin: string; area: string }[];
}

export interface PaymentMethodOption {
  method: PaymentMethod;
  label: string;
  enabled: boolean;
  provider?: string | null;
  testMode?: boolean;
  /** COD only: the largest order it can be used for. null = no limit. */
  maxOrderValue?: number | null;
  /** COD only: null = any address; otherwise only deliveries to this city. */
  area?: CodArea | null;
}

// ── Query params ─────────────────────────────────────────────────────────────

export interface ProductQuery {
  page?: number;
  limit?: number;
  category?: string;
  collection?: string;
  gender?: Gender;
  size?: string[];
  color?: string[];
  fit?: string[];
  collections?: string[];
  tag?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  search?: string;
  sort?: string;
}
