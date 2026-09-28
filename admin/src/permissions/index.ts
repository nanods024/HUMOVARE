/**
 * Permission catalogue — mirrors server/src/constants/permissions.js.
 *
 * These constants drive navigation visibility and route guards, which are a
 * convenience for the operator. They are NOT a security boundary: every admin
 * request is independently authorised on the server, so hiding a menu item
 * here only tidies the interface.
 */
export const PERMISSIONS = {
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
  ADMINS_DELETE: 'admins.delete',

  ROLES_MANAGE: 'roles.manage',
  PERMISSIONS_MANAGE: 'permissions.manage',

  AUDITLOGS_READ: 'auditlogs.read',

  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',
} as const;

export const PERMISSION_GROUPS: { group: string; permissions: string[] }[] = [
  { group: 'Catalog', permissions: ['products.read', 'products.create', 'products.update', 'products.delete'] },
  { group: 'Categories', permissions: ['categories.read', 'categories.create', 'categories.update', 'categories.delete'] },
  { group: 'Collections', permissions: ['collections.read', 'collections.manage'] },
  { group: 'Inventory', permissions: ['inventory.read', 'inventory.update'] },
  { group: 'Orders', permissions: ['orders.read', 'orders.update', 'orders.delete'] },
  { group: 'Customers', permissions: ['customers.read', 'customers.update', 'customers.delete'] },
  { group: 'Feedback', permissions: ['feedback.read', 'feedback.manage'] },
  { group: 'Storefront', permissions: ['homepage.read', 'homepage.manage', 'shop.read', 'shop.manage'] },
  { group: 'Media', permissions: ['media.read', 'media.upload', 'media.delete'] },
  { group: 'Administration', permissions: ['admins.read', 'admins.create', 'admins.update', 'admins.disable', 'admins.delete', 'roles.manage', 'permissions.manage'] },
  { group: 'Audit', permissions: ['auditlogs.read'] },
  { group: 'Settings', permissions: ['settings.read', 'settings.update'] },
];

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  PRODUCT_MANAGER: 'Product manager',
  ORDER_MANAGER: 'Order manager',
  CONTENT_MANAGER: 'Content manager',
};
