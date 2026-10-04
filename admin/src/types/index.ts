/** Admin API types. These mirror the Mongoose schemas on the server. */

export type AdminRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'PRODUCT_MANAGER'
  | 'ORDER_MANAGER'
  | 'CONTENT_MANAGER';

export type ContentStatus = 'draft' | 'published' | 'scheduled' | 'archived';

export interface Pagination {
  currentPage: number;
  limit: number;
  totalItems: number;
  totalProducts: number;
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

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  permissions?: string[];
  /** Set while sign-in is locked after too many wrong passwords. */
  lockedUntil?: string | null;
}

export interface Role {
  _id: string;
  name: AdminRole;
  description: string;
  permissions: string[];
  isSystem: boolean;
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export interface CategoryRef {
  _id: string;
  name: string;
  slug: string;
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

export interface ProductColor {
  name: string;
  slug: string;
  hex: string;
}

export interface AdminProductRow {
  _id: string;
  name: string;
  slug: string;
  price: number;
  mrp: number;
  discountPercentage: number;
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  isNewDrop: boolean;
  isBestSeller: boolean;
  isDesignerExclusive: boolean;
  thumbnail: CloudinaryImage | null;
  category?: CategoryRef;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProduct extends AdminProductRow {
  description: string;
  shortDescription: string;
  brand: string;
  gender: string;
  fit: string;
  sizes: string[];
  colors: ProductColor[];
  variants: ProductVariant[];
  images: CloudinaryImage[];
  tags: string[];
  careInstructions: string[];
  highlights: string[];
  collections?: CategoryRef[];
  seo?: { title: string; description: string };
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description: string;
  type: 'gender' | 'product-type' | 'collection' | 'style';
  image: CloudinaryImage | null;
  isVirtual: boolean;
  showInNav: boolean;
  displayOrder: number;
  isActive: boolean;
  seo?: { title: string; description: string };
}

export interface Collection {
  _id: string;
  name: string;
  slug: string;
  description: string;
  image: CloudinaryImage | null;
  products: { product: string | AdminProductRow; sortOrder: number }[];
  productCount?: number;
  status: ContentStatus;
  showInNav: boolean;
  sortOrder: number;
  seo?: { title: string; description: string };
  updatedAt: string;
}

// ── Storefront CMS ───────────────────────────────────────────────────────────

export type SectionType =
  | 'hero'
  | 'categories'
  | 'collections'
  | 'productRail'
  | 'brandStory'
  | 'styleRail'
  | 'quality'
  | 'community'
  | 'trust';

export interface Cta {
  label?: string;
  url?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'glass' | 'link';
}

export interface HomepageSection {
  _id: string;
  type: SectionType;
  key: string;
  name: string;
  eyebrow: string;
  title: string;
  highlight: string;
  subtitle: string;
  description: string;
  image: CloudinaryImage | null;
  mobileImage: CloudinaryImage | null;
  primaryCta: Cta | null;
  secondaryCta: Cta | null;
  link: Cta | null;
  items: Record<string, unknown>[];
  products: string[];
  categories: string[];
  source: 'newDrops' | 'bestsellers' | 'featured' | 'sale' | 'manual';
  limit: number;
  background: 'canvas' | 'surface' | 'dark';
  sortOrder: number;
  status: ContentStatus;
  startAt: string | null;
  endAt: string | null;
  updatedAt: string;
}

export interface ShopFilter {
  key: 'availability' | 'size' | 'colour' | 'price' | 'fit' | 'fabric';
  label: string;
  enabled: boolean;
  defaultOpen?: boolean;
  sortOrder: number;
}

export interface ShopSortOption {
  value: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
}

export interface ShopConfig {
  _id: string;
  title: string;
  description: string;
  filters: ShopFilter[];
  sortOptions: ShopSortOption[];
  defaultSort: string;
  pageSize: number;
  emptyTitle: string;
  emptyDescription: string;
  seo: { title: string; description: string };
}

// ── Operations ───────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export interface AdminOrder {
  _id: string;
  orderNumber: string;
  user?: { _id: string; name: string; email: string } | null;
  items: {
    name: string;
    slug: string;
    sku: string;
    image: string;
    size: string;
    color: string;
    quantity: number;
    price: number;
    lineTotal: number;
  }[];
  shippingAddress: Record<string, string>;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  paymentMethod: 'COD' | 'ONLINE';
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  statusHistory: { status: OrderStatus; note: string; at: string }[];
  shipment?: {
    carrier: string;
    trackingNumber: string;
    trackingUrl: string;
    estimatedDelivery: string | null;
    shippedAt: string | null;
  };
  payment?: {
    provider: string;
    reference: string;
    gatewayOrderId?: string;
    transactionId?: string;
    paymentMode?: string;
    /** Paise, as PhonePe confirmed it. */
    amountPaid?: number;
    attempts?: number;
    lastAttemptAt?: string | null;
    paidAt: string | null;
    expiresAt?: string | null;
    needsReview?: boolean;
  };
  createdAt: string;
  updatedAt?: string;
}

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

/** One trip to PhonePe's checkout. Amounts in paise. */
export interface PaymentAttemptRow {
  _id: string;
  attemptNumber: number;
  merchantOrderId: string;
  gateway: string;
  amount: number;
  currency: string;
  status: 'CREATED' | 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  gatewayOrderId: string;
  transactionId: string;
  paymentMode: string;
  expireAt: string | null;
  errorCode: string;
  detailedErrorCode: string;
  lastCheckedAt: string | null;
  finalizedAt: string | null;
  needsReview: boolean;
  reviewReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentEventRow {
  _id: string;
  type: string;
  source: string;
  gatewayReference: string;
  status: string;
  amount: number | null;
  detail: string;
  createdAt: string;
}

export interface OrderPayments {
  gateway: string;
  environment: string;
  attempts: PaymentAttemptRow[];
  events: PaymentEventRow[];
}

export interface ShipmentInput {
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: string | null;
}

/** One transactional email sent (or attempted) for an order. No body is stored. */
export interface OrderEmailEvent {
  _id: string;
  type: string;
  status: 'sending' | 'sent' | 'failed' | 'skipped';
  recipient: string;
  subject: string;
  providerMessageId: string;
  attempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  retryable: boolean;
  errorCategory: string;
  errorMessage: string;
  sentAt: string | null;
  createdAt: string;
}

/** What happened to the email a status change triggered. */
export type EmailOutcome = { status: 'sent' | 'failed' | 'queued' | 'duplicate' | 'skipped' | 'none' | string };

export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
}

export interface InventoryRow {
  productId: string;
  name: string;
  slug: string;
  thumbnail: CloudinaryImage | null;
  isActive: boolean;
  variantId: string;
  sku: string;
  size: string;
  color: string;
  colorSlug?: string;
  stock: number;
  price: number;
  lowStockThreshold: number;
  status: 'in' | 'low' | 'out';
}

/** A product on the stock screen, with its variants and true totals. */
export interface InventoryProduct {
  productId: string;
  name: string;
  slug: string;
  thumbnail: CloudinaryImage | null;
  isActive: boolean;
  totalStock: number;
  variantCount: number;
  outCount: number;
  lowCount: number;
  /** Variants matching the level filter (all of them when unfiltered). */
  matchingCount: number;
  variants: InventoryRow[];
  colors: { name: string; slug: string; hex: string }[];
}

export interface InventorySummary {
  units: number;
  variants: number;
  out: number;
  low: number;
  products: number;
  lowStockThreshold: number;
}

export interface MediaAsset {
  _id: string;
  publicId: string;
  secureUrl: string;
  width: number | null;
  height: number | null;
  format: string;
  bytes: number;
  folder: string;
  altText: string;
  createdAt: string;
  uploadedBy?: { name: string; email: string } | null;
}

export interface AuditLogEntry {
  _id: string;
  adminUser?: { _id: string; name: string; email: string; role: string } | null;
  adminEmail: string;
  action: string;
  resource: string;
  resourceId: string;
  description: string;
  ip: string;
  status: 'success' | 'failure';
  metadata: unknown;
  before: unknown;
  after: unknown;
  createdAt: string;
}

/** PhonePe on this server, as the Settings page sees it. Never credentials. */
export interface PaymentGatewayStatus {
  provider: string;
  /** Keys are set, so online payment can actually be taken. */
  configured: boolean;
  /** Sandbox keys: no real money moves. */
  testMode: boolean;
}

export interface StoreSettings {
  _id: string;
  storeName: string;
  tagline: string;
  logo: CloudinaryImage | null;
  contactEmail: string;
  supportEmail: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  currency: string;
  timezone: string;
  shipping: {
    freeShippingThreshold: number;
    shippingFee: number;
    dispatchDays: number;
    deliveryEstimateDays: number;
    codEnabled: boolean;
    /** Online payment (PhonePe) at checkout. Older documents may not have it yet. */
    onlineEnabled?: boolean;
    codMaxOrderValue: number;
    /** COD only for deliveries to codCity. Older documents may not have these yet. */
    codCityOnly?: boolean;
    codCity?: string;
    codState?: string;
    codPinCheck?: boolean;
    codPinPrefixes?: string[];
    codPinAreas?: { pin: string; area: string }[];
  };
  returns: { windowDays: number; freePickup: boolean };
  seo: { defaultTitle: string; defaultDescription: string; ogImage: CloudinaryImage | null };
}

export interface DashboardData {
  range: { start: string; end: string; key: string };
  totals: {
    revenue: number;
    orders: number;
    itemsSold: number;
    averageOrderValue: number;
    customers: number;
    newCustomers: number;
  };
  orders: Record<string, number>;
  products: { total: number; active: number; outOfStock: number; lowStock: number };
  charts: {
    trend: { date: string; revenue: number; orders: number }[];
    topProducts: { _id: string; name: string; image: string; unitsSold: number; revenue: number }[];
  };
  recentOrders: {
    _id: string;
    orderNumber: string;
    total: number;
    orderStatus: OrderStatus;
    paymentStatus: string;
    createdAt: string;
    shippingAddress: { name: string };
  }[];
  lowStock: { _id: string; name: string; slug: string; stock: number; thumbnail: CloudinaryImage | null }[];
}

// ── Feedback ───────────────────────────────────────────────────────

export type FeedbackStatus = 'new' | 'read' | 'replied' | 'archived';
export type FeedbackTopic = 'general' | 'order' | 'product' | 'returns' | 'wholesale';

export interface FeedbackMessage {
  _id: string;
  name: string;
  email: string;
  topic: FeedbackTopic;
  subject: string;
  message: string;
  status: FeedbackStatus;
  note: string;
  user?: { _id: string; name: string; email: string } | null;
  handledBy?: { name: string } | null;
  handledAt?: string | null;
  createdAt: string;
}
