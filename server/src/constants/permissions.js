/**
 * The permission catalogue.
 *
 * This is the single source of truth for what an admin can do. Routes name a
 * permission; roles bundle them. Nothing in the codebase should ever check a
 * role name directly — check a permission, so a new role is a data change
 * rather than a code change.
 */

export const PERMISSIONS = Object.freeze({
  PRODUCTS_READ: 'products.read',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',

  CATEGORIES_READ: 'categories.read',
  CATEGORIES_CREATE: 'categories.create',
  CATEGORIES_UPDATE: 'categories.update',
  CATEGORIES_DELETE: 'categories.delete',

  COLLECTIONS_READ: 'collections.read',
  COLLECTIONS_MANAGE: 'collections.manage',

  INVENTORY_READ: 'inventory.read',
  INVENTORY_UPDATE: 'inventory.update',

  ORDERS_READ: 'orders.read',
  ORDERS_UPDATE: 'orders.update',
  ORDERS_DELETE: 'orders.delete',

  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_UPDATE: 'customers.update',
  CUSTOMERS_DELETE: 'customers.delete',

  FEEDBACK_READ: 'feedback.read',
  FEEDBACK_MANAGE: 'feedback.manage',

  HOMEPAGE_READ: 'homepage.read',
  HOMEPAGE_MANAGE: 'homepage.manage',

  SHOP_READ: 'shop.read',
  SHOP_MANAGE: 'shop.manage',

  MEDIA_READ: 'media.read',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',

  ADMINS_READ: 'admins.read',
  ADMINS_CREATE: 'admins.create',
  ADMINS_UPDATE: 'admins.update',
  ADMINS_DISABLE: 'admins.disable',
  /** Permanent removal. Gated separately from admins.disable — disabling is reversible, this is not. */
  ADMINS_DELETE: 'admins.delete',

  ROLES_MANAGE: 'roles.manage',
  PERMISSIONS_MANAGE: 'permissions.manage',

  AUDITLOGS_READ: 'auditlogs.read',

  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',
});

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

export const ADMIN_ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  PRODUCT_MANAGER: 'PRODUCT_MANAGER',
  ORDER_MANAGER: 'ORDER_MANAGER',
  CONTENT_MANAGER: 'CONTENT_MANAGER',
});

const P = PERMISSIONS;

/**
 * Seeded role definitions. SUPER_ADMIN is special-cased in the guard rather
 * than listed here, so a newly added permission is never accidentally missing
 * from the owner role.
 */
export const DEFAULT_ROLES = Object.freeze([
  {
    name: ADMIN_ROLES.SUPER_ADMIN,
    description: 'Full access, including admin users, roles and audit logs.',
    permissions: ALL_PERMISSIONS,
    isSystem: true,
  },
  {
    name: ADMIN_ROLES.ADMIN,
    description: 'Runs the store day to day. No admin-user or role management.',
    permissions: [
      P.PRODUCTS_READ, P.PRODUCTS_CREATE, P.PRODUCTS_UPDATE, P.PRODUCTS_DELETE,
      P.CATEGORIES_READ, P.CATEGORIES_CREATE, P.CATEGORIES_UPDATE, P.CATEGORIES_DELETE,
      P.COLLECTIONS_READ, P.COLLECTIONS_MANAGE,
      P.INVENTORY_READ, P.INVENTORY_UPDATE,
      P.ORDERS_READ, P.ORDERS_UPDATE,
      P.CUSTOMERS_READ, P.CUSTOMERS_UPDATE,
      P.FEEDBACK_READ, P.FEEDBACK_MANAGE,
      P.HOMEPAGE_READ, P.HOMEPAGE_MANAGE,
      P.SHOP_READ, P.SHOP_MANAGE,
      P.MEDIA_READ, P.MEDIA_UPLOAD, P.MEDIA_DELETE,
      P.SETTINGS_READ, P.SETTINGS_UPDATE,
    ],
    isSystem: true,
  },
  {
    name: ADMIN_ROLES.PRODUCT_MANAGER,
    description: 'Catalogue and stock. Cannot see orders or customers.',
    permissions: [
      P.PRODUCTS_READ, P.PRODUCTS_CREATE, P.PRODUCTS_UPDATE,
      P.CATEGORIES_READ, P.CATEGORIES_CREATE, P.CATEGORIES_UPDATE,
      P.COLLECTIONS_READ, P.COLLECTIONS_MANAGE,
      P.INVENTORY_READ, P.INVENTORY_UPDATE,
      P.MEDIA_READ, P.MEDIA_UPLOAD,
    ],
    isSystem: true,
  },
  {
    name: ADMIN_ROLES.ORDER_MANAGER,
    description: 'Fulfilment. Reads the catalogue, works orders and customers.',
    permissions: [
      P.ORDERS_READ, P.ORDERS_UPDATE,
      P.CUSTOMERS_READ,
      P.PRODUCTS_READ,
      P.INVENTORY_READ,
      P.FEEDBACK_READ, P.FEEDBACK_MANAGE,
    ],
    isSystem: true,
  },
  {
    name: ADMIN_ROLES.CONTENT_MANAGER,
    description: 'Storefront content — home page, shop page, media.',
    permissions: [
      P.HOMEPAGE_READ, P.HOMEPAGE_MANAGE,
      P.SHOP_READ, P.SHOP_MANAGE,
      P.COLLECTIONS_READ, P.COLLECTIONS_MANAGE,
      P.CATEGORIES_READ, P.CATEGORIES_UPDATE,
      P.MEDIA_READ, P.MEDIA_UPLOAD, P.MEDIA_DELETE,
      P.PRODUCTS_READ,
    ],
    isSystem: true,
  },
]);

/** Audit actions. Kept as a list so the log stays queryable and consistent. */
export const AUDIT_ACTIONS = Object.freeze({
  ADMIN_LOGIN: 'ADMIN_LOGIN',
  ADMIN_LOGIN_FAILED: 'ADMIN_LOGIN_FAILED',
  ADMIN_LOGOUT: 'ADMIN_LOGOUT',
  ADMIN_CREATED: 'ADMIN_CREATED',
  ADMIN_UPDATED: 'ADMIN_UPDATED',
  ADMIN_DISABLED: 'ADMIN_DISABLED',
  ADMIN_ENABLED: 'ADMIN_ENABLED',
  ADMIN_DELETED: 'ADMIN_DELETED',
  ADMIN_SESSIONS_REVOKED: 'ADMIN_SESSIONS_REVOKED',
  ADMIN_PASSWORD_RESET: 'ADMIN_PASSWORD_RESET',
  ADMIN_PASSWORD_RESET_REQUESTED: 'ADMIN_PASSWORD_RESET_REQUESTED',
  ADMIN_ACCOUNT_LOCKED: 'ADMIN_ACCOUNT_LOCKED',
  ADMIN_ACCOUNT_UNLOCKED: 'ADMIN_ACCOUNT_UNLOCKED',
  ADMIN_REAUTHENTICATED: 'ADMIN_REAUTHENTICATED',
  ADMIN_REAUTH_FAILED: 'ADMIN_REAUTH_FAILED',
  ADMIN_ACCESS_DENIED: 'ADMIN_ACCESS_DENIED',
  ADMIN_IP_BLOCKED: 'ADMIN_IP_BLOCKED',
  ADMIN_IP_UNBLOCKED: 'ADMIN_IP_UNBLOCKED',
  ADMIN_PANEL_LOCKED: 'ADMIN_PANEL_LOCKED',
  ADMIN_SESSION_ENDED: 'ADMIN_SESSION_ENDED',

  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DELETED: 'PRODUCT_DELETED',
  PRODUCT_STATUS_CHANGED: 'PRODUCT_STATUS_CHANGED',
  PRODUCT_BULK_UPDATED: 'PRODUCT_BULK_UPDATED',
  PRICE_CHANGED: 'PRICE_CHANGED',
  STOCK_CHANGED: 'STOCK_CHANGED',

  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_DELETED: 'CATEGORY_DELETED',

  COLLECTION_CREATED: 'COLLECTION_CREATED',
  COLLECTION_UPDATED: 'COLLECTION_UPDATED',
  COLLECTION_DELETED: 'COLLECTION_DELETED',

  HOMEPAGE_UPDATED: 'HOMEPAGE_UPDATED',
  HOMEPAGE_SECTION_CREATED: 'HOMEPAGE_SECTION_CREATED',
  HOMEPAGE_SECTION_UPDATED: 'HOMEPAGE_SECTION_UPDATED',
  HOMEPAGE_SECTION_DELETED: 'HOMEPAGE_SECTION_DELETED',
  HOMEPAGE_REORDERED: 'HOMEPAGE_REORDERED',

  SHOP_CONFIG_UPDATED: 'SHOP_CONFIG_UPDATED',

  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  ORDER_NOTE_ADDED: 'ORDER_NOTE_ADDED',

  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  CUSTOMER_DELETED: 'CUSTOMER_DELETED',

  ORDER_SHIPMENT_UPDATED: 'ORDER_SHIPMENT_UPDATED',
  ORDER_DELETED: 'ORDER_DELETED',
  PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
  EMAIL_RESENT: 'EMAIL_RESENT',
  FEEDBACK_UPDATED: 'FEEDBACK_UPDATED',
  FEEDBACK_DELETED: 'FEEDBACK_DELETED',
  MEDIA_UPLOADED: 'MEDIA_UPLOADED',
  MEDIA_DELETED: 'MEDIA_DELETED',

  ROLE_UPDATED: 'ROLE_UPDATED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
});

export default PERMISSIONS;
