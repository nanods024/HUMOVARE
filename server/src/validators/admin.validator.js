import { z } from 'zod';
import { objectId, slug, email } from './common.validator.js';
import { ALL_PERMISSIONS, ADMIN_ROLES } from '../constants/permissions.js';
import { HOMEPAGE_SECTION_TYPES, CONTENT_STATUSES } from '../models/HomepageSection.js';
import { SUPPORTED_FILTERS, SUPPORTED_SORTS } from '../models/ShopConfig.js';
import { ORDER_STATUS_VALUES } from '../constants/index.js';
import { MEDIA_FOLDERS } from '../services/media.service.js';

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Admin passwords are held to a stricter standard than customer ones: these
 * accounts can change prices, see every order and manage other admins.
 * bcrypt only reads the first 72 bytes, hence the cap.
 */
export const adminPassword = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[0-9]/, 'Add a number')
  .regex(/[^A-Za-z0-9]/, 'Add a symbol, such as ! @ # or $')
  .refine((value) => !/(.)\1{3,}/.test(value), 'Avoid repeating the same character four times in a row');

export const adminLoginSchema = {
  body: z.object({
    email,
    // Deliberately loose — never reveal the password policy on a login form.
    password: z.string().min(1, 'Password is required').max(200),
  }),
};

export const adminChangePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required').max(200),
    newPassword: adminPassword,
  }),
};

// ── Admin users & roles ──────────────────────────────────────────────────────

const permissionList = z.array(z.enum(ALL_PERMISSIONS)).max(ALL_PERMISSIONS.length);

export const createAdminSchema = {
  body: z.object({
    name: z.string().trim().min(2).max(80),
    email,
    password: adminPassword,
    role: z.enum(Object.values(ADMIN_ROLES)),
    grantedPermissions: permissionList.optional(),
    revokedPermissions: permissionList.optional(),
  }),
};

export const updateAdminSchema = {
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    role: z.enum(Object.values(ADMIN_ROLES)).optional(),
    grantedPermissions: permissionList.optional(),
    revokedPermissions: permissionList.optional(),
  }),
};

export const setAdminActiveSchema = {
  params: z.object({ id: objectId }),
  body: z.object({ isActive: z.boolean() }),
};

export const resetAdminPasswordSchema = {
  params: z.object({ id: objectId }),
  body: z.object({ password: adminPassword }),
};

export const unlockAdminSchema = {
  params: z.object({ id: objectId }),
};

export const adminReauthSchema = {
  body: z.object({ password: z.string().min(1, 'Enter your password').max(200) }),
};

export const adminForgotPasswordSchema = {
  body: z.object({ email }),
};

export const adminResetPasswordSchema = {
  body: z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/, 'This reset link is invalid'),
    password: adminPassword,
  }),
};

export const deleteCustomerSchema = {
  params: z.object({ id: objectId }),
  query: z.object({ orders: z.enum(['true', 'false']).optional() }),
};

export const deleteOrderSchema = {
  params: z.object({ id: objectId }),
};

export const deleteAdminSchema = {
  params: z.object({ id: objectId }),
};

export const updateRoleSchema = {
  params: z.object({ id: objectId }),
  body: z.object({
    description: z.string().trim().max(240).optional(),
    permissions: permissionList.optional(),
  }),
};

// ── Homepage ─────────────────────────────────────────────────────────────────

/**
 * Where a storefront link may point: a path on this site ("/shop"), an anchor,
 * or a full https:// address. Anything else — javascript:, data:, a
 * protocol-relative "//host" — would run or redirect on every visitor's click.
 */
const SAFE_LINK = /^(\/(?![/\\])|#|https:\/\/)[^\s"'<>]*$/i;
const safeLink = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === '' || SAFE_LINK.test(value), 'Use a site path like /shop or a full https:// link');

/** Images are only ever fetched over http(s). */
const imageUrl = z.string().url().refine((value) => /^https?:\/\//i.test(value), 'Use an http(s) image URL');

/** Free-form section items: any link-like field must pass the same rule. */
const LINK_KEYS = ['url', 'href', 'link', 'to'];
const sectionItem = z.record(z.unknown()).superRefine((item, ctx) => {
  for (const key of LINK_KEYS) {
    const value = item[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || !SAFE_LINK.test(value.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Use a site path like /shop or a full https:// link' });
    }
  }
});

const imageInput = z.object({
  url: imageUrl,
  publicId: z.string().trim().optional(),
  alt: z.string().trim().max(160).optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
});

const ctaInput = z.object({
  label: z.string().trim().max(60).optional(),
  url: safeLink.optional(),
  variant: z.enum(['primary', 'secondary', 'outline', 'glass', 'link']).optional(),
});

const sectionBody = z.object({
  type: z.enum(HOMEPAGE_SECTION_TYPES),
  key: slug,
  name: z.string().trim().min(2).max(80),
  eyebrow: z.string().trim().max(80).optional(),
  title: z.string().trim().max(160).optional(),
  highlight: z.string().trim().max(80).optional(),
  subtitle: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  image: imageInput.nullable().optional(),
  mobileImage: imageInput.nullable().optional(),
  primaryCta: ctaInput.nullable().optional(),
  secondaryCta: ctaInput.nullable().optional(),
  link: ctaInput.nullable().optional(),
  // Structured content only. Raw HTML is never accepted or rendered.
  items: z.array(sectionItem).max(24).optional(),
  products: z.array(objectId).max(24).optional(),
  categories: z.array(objectId).max(24).optional(),
  source: z.enum(['newDrops', 'bestsellers', 'featured', 'sale', 'designerExclusive', 'manual']).optional(),
  limit: z.coerce.number().int().min(1).max(24).optional(),
  background: z.enum(['canvas', 'surface', 'dark']).optional(),
  sortOrder: z.coerce.number().int().optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
});

export const createSectionSchema = { body: sectionBody };

export const updateSectionSchema = {
  params: z.object({ id: objectId }),
  body: sectionBody.partial(),
};

export const reorderSectionsSchema = {
  body: z.object({ order: z.array(objectId).min(1) }),
};

// ── Shop config ──────────────────────────────────────────────────────────────

export const updateShopConfigSchema = {
  body: z.object({
    title: z.string().trim().max(120).optional(),
    description: z.string().trim().max(600).optional(),
    filters: z
      .array(
        z.object({
          key: z.enum(SUPPORTED_FILTERS),
          label: z.string().trim().min(1).max(40),
          enabled: z.boolean(),
          defaultOpen: z.boolean().optional(),
          sortOrder: z.coerce.number().int(),
        }),
      )
      .optional(),
    sortOptions: z
      .array(
        z.object({
          value: z.enum(SUPPORTED_SORTS),
          label: z.string().trim().min(1).max(40),
          enabled: z.boolean(),
          sortOrder: z.coerce.number().int(),
        }),
      )
      .optional(),
    defaultSort: z.enum(SUPPORTED_SORTS).optional(),
    pageSize: z.coerce.number().int().min(8).max(60).optional(),
    emptyTitle: z.string().trim().max(120).optional(),
    emptyDescription: z.string().trim().max(300).optional(),
    seo: z
      .object({
        title: z.string().trim().max(70).optional(),
        description: z.string().trim().max(180).optional(),
      })
      .optional(),
  }),
};

// ── Collections ──────────────────────────────────────────────────────────────

const collectionBody = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional(),
  description: z.string().trim().max(1000).optional(),
  image: imageInput.nullable().optional(),
  products: z.array(objectId).max(200).optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
  showInNav: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  seo: z
    .object({
      title: z.string().trim().max(70).optional(),
      description: z.string().trim().max(180).optional(),
    })
    .optional(),
});

export const createCollectionSchema = { body: collectionBody };
export const updateCollectionSchema = {
  params: z.object({ id: objectId }),
  body: collectionBody.partial(),
};

// ── Inventory ────────────────────────────────────────────────────────────────

export const adjustStockSchema = {
  body: z.object({
    productId: objectId,
    variantId: objectId,
    quantity: z.coerce.number().int().min(0).max(100000),
    reason: z.string().trim().max(240).optional(),
    type: z.enum(['adjustment', 'restock', 'correction', 'return']).optional(),
  }),
};

export const bulkAdjustStockSchema = {
  body: z.object({
    adjustments: z
      .array(
        z.object({
          productId: objectId,
          variantId: objectId,
          quantity: z.coerce.number().int().min(0).max(100000),
          reason: z.string().trim().max(240).optional(),
        }),
      )
      .min(1)
      .max(200),
  }),
};

// ── Orders & customers ───────────────────────────────────────────────────────

/** A tracking link typed by an admin ends up in a customer's inbox. */
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === '' || /^https?:\/\/[^\s"'<>]+$/i.test(value), 'Use a full http(s) link')
  .optional();

const shipmentBody = z.object({
  carrier: z.string().trim().max(80).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
  trackingUrl: httpUrl,
  estimatedDelivery: z.union([z.coerce.date(), z.literal(''), z.null()]).optional(),
});

export const updateOrderStatusSchema = {
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(ORDER_STATUS_VALUES),
    note: z.string().trim().max(240).optional(),
    shipment: shipmentBody.optional(),
  }),
};

export const updateShipmentSchema = {
  params: z.object({ id: objectId }),
  body: shipmentBody,
};


export const orderEmailRetrySchema = {
  params: z.object({ id: objectId, eventId: objectId }),
};

export const orderNoteSchema = {
  params: z.object({ id: objectId }),
  body: z.object({ note: z.string().trim().min(1).max(500) }),
};

export const setCustomerActiveSchema = {
  params: z.object({ id: objectId }),
  body: z.object({ isActive: z.boolean() }),
};

// ── Media ────────────────────────────────────────────────────────────────────

export const uploadSignatureSchema = {
  body: z.object({ folder: z.enum(MEDIA_FOLDERS).optional() }),
};

export const registerAssetSchema = {
  body: z.object({
    publicId: z.string().trim().min(1),
    version: z.union([z.string(), z.number()]),
    signature: z.string().trim().min(1),
    secureUrl: z.string().url(),
    width: z.coerce.number().int().positive().optional(),
    height: z.coerce.number().int().positive().optional(),
    format: z.string().trim().optional(),
    bytes: z.coerce.number().int().nonnegative().optional(),
    resourceType: z.string().trim().optional(),
    folder: z.string().trim().optional(),
    altText: z.string().trim().max(160).optional(),
  }),
};

export const updateAssetSchema = {
  params: z.object({ id: objectId }),
  body: z.object({
    altText: z.string().trim().max(160).optional(),
    tags: z.array(z.string().trim()).max(20).optional(),
  }),
};

// ── Bulk catalogue ───────────────────────────────────────────────────────────

export const bulkUpdateProductsSchema = {
  body: z.object({
    ids: z.array(objectId).min(1).max(500),
    updates: z.object({
      isActive: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
      isNewDrop: z.boolean().optional(),
      isBestSeller: z.boolean().optional(),
      isDesignerExclusive: z.boolean().optional(),
      category: objectId.optional(),
    }),
  }),
};

// ── Settings ─────────────────────────────────────────────────────────────────

export const updateSettingsSchema = {
  body: z
    .object({
      storeName: z.string().trim().max(80).optional(),
      tagline: z.string().trim().max(160).optional(),
      logo: imageInput.nullable().optional(),
      contactEmail: z.string().trim().email().or(z.literal('')).optional(),
      supportEmail: z.string().trim().email().or(z.literal('')).optional(),
      phone: z.string().trim().max(24).optional(),
      // Rendered as links on every page: https only.
      whatsapp: z.string().trim().max(200).regex(/^(https:\/\/[^\s"'<>]+)?$/i, 'Use a full https:// link').optional(),
      instagram: z.string().trim().max(200).regex(/^(https:\/\/[^\s"'<>]+)?$/i, 'Use a full https:// link').optional(),
      address: z
        .object({
          line1: z.string().trim().max(160).optional(),
          line2: z.string().trim().max(160).optional(),
          city: z.string().trim().max(80).optional(),
          state: z.string().trim().max(80).optional(),
          postalCode: z.string().trim().max(12).optional(),
          country: z.string().trim().max(60).optional(),
        })
        .optional(),
      currency: z.string().trim().max(8).optional(),
      timezone: z.string().trim().max(60).optional(),
      shipping: z
        .object({
          freeShippingThreshold: z.coerce.number().min(0).optional(),
          shippingFee: z.coerce.number().min(0).optional(),
          dispatchDays: z.coerce.number().int().min(0).optional(),
          deliveryEstimateDays: z.coerce.number().int().min(1).optional(),
          codEnabled: z.boolean().optional(),
          codMaxOrderValue: z.coerce.number().min(0).optional(),
          codCityOnly: z.boolean().optional(),
          codCity: z.string().trim().max(80).optional(),
          codState: z.string().trim().max(80).optional(),
          codPinCheck: z.boolean().optional(),
          codPinAreas: z
            .array(
              z.object({
                pin: z.string().trim().regex(/^\d{6}$/, 'A PIN code is 6 digits'),
                area: z.string().trim().min(1, 'Name the area').max(60),
              }),
            )
            .max(300)
            .refine((list) => new Set(list.map((entry) => entry.pin)).size === list.length, 'Each PIN code can be listed once')
            .optional(),
          codPinPrefixes: z.array(z.string().trim().regex(/^\d{1,6}$/, 'PIN prefixes are digits only')).max(30).optional(),
        })
        .optional(),
      returns: z
        .object({
          windowDays: z.coerce.number().int().min(0).optional(),
          freePickup: z.boolean().optional(),
        })
        .optional(),
      seo: z
        .object({
          defaultTitle: z.string().trim().max(70).optional(),
          defaultDescription: z.string().trim().max(180).optional(),
          ogImage: imageInput.nullable().optional(),
        })
        .optional(),
    })
    .strict(),
};

// ── Query schemas ────────────────────────────────────────────────────────────

export const paginatedQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(60).optional(),
      search: z.string().trim().max(120).optional(),
      status: z.string().trim().max(40).optional(),
    })
    .passthrough(),
};

export const dashboardQuerySchema = {
  query: z.object({
    range: z
      .enum(['today', 'yesterday', 'last-7-days', 'last-30-days', 'this-month', 'custom'])
      .optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
  }),
};
