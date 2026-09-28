import { Router } from 'express';
import { clearPublicCache } from '../utils/publicCache.js';
import rateLimit from 'express-rate-limit';

import * as adminAuthController from '../controllers/adminAuth.controller.js';
import * as admin from '../controllers/admin.controller.js';

import { validate } from '../middleware/validation.middleware.js';
import {
  requireAdminAuth,
  requireCsrf,
  requireOwnPassword,
  requirePermission,
  requireSuperAdmin,
  requireRecentAuth,
  noStore,
  rejectBlockedIp,
} from '../middleware/adminAuth.middleware.js';
import { writeLimiter, passwordResetLimiter } from '../middleware/rateLimit.middleware.js';
import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';
import { PERMISSIONS as P } from '../constants/permissions.js';
import { idParam } from '../validators/common.validator.js';
import {
  adminLoginSchema,
  adminChangePasswordSchema,
  createAdminSchema,
  updateAdminSchema,
  setAdminActiveSchema,
  deleteAdminSchema, deleteOrderSchema, deleteCustomerSchema,
  unlockAdminSchema,
  adminReauthSchema,
  adminForgotPasswordSchema,
  adminResetPasswordSchema,
  resetAdminPasswordSchema,
  updateRoleSchema,
  createSectionSchema,
  updateSectionSchema,
  reorderSectionsSchema,
  updateShopConfigSchema,
  createCollectionSchema,
  updateCollectionSchema,
  adjustStockSchema,
  bulkAdjustStockSchema,
  updateOrderStatusSchema,
  updateShipmentSchema,
  orderEmailRetrySchema,
  orderNoteSchema,
  setCustomerActiveSchema,
  uploadSignatureSchema,
  registerAssetSchema,
  updateAssetSchema,
  bulkUpdateProductsSchema,
  updateSettingsSchema,
  dashboardQuerySchema,
} from '../validators/admin.validator.js';
import { createProductSchema, updateProductSchema } from '../validators/product.validator.js';
import { listFeedbackSchema, updateFeedbackSchema } from '../validators/feedback.validator.js';
import { createCategorySchema, updateCategorySchema, listCategoriesSchema } from '../validators/category.validator.js';

const router = Router();

/**
 * Admin sign-in is the one unauthenticated admin surface, so it gets its own
 * tight limiter on top of the account-level lockout.
 */
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => env.isDev && process.env.DISABLE_RATE_LIMIT === 'true',
  handler: (_req, res) =>
    sendError(res, { statusCode: 429, message: 'Too many sign-in attempts. Try again shortly.' }),
});

// Nothing the admin API returns may be cached by the browser or a proxy —
// including pages visited before signing out.
/**
 * Runs extra guards only when a query flag asks for the irreversible variant
 * of an action (`?hard=true` product delete, `?force=true` media delete):
 * those destroy data and images outright, so they need a super admin who has
 * just confirmed their password.
 */
function ifQueryFlag(flag, ...guards) {
  return (req, res, next) => {
    if (req.query?.[flag] !== 'true') return next();
    const run = (index) => (error) => {
      if (error) return next(error);
      if (index >= guards.length) return next();
      return guards[index](req, res, run(index + 1));
    };
    return run(0)();
  };
}

router.use(noStore);

// Whatever an admin changes (products, categories, homepage, settings…) must
// show on the storefront at once, so any successful write clears the cache.
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => {
      if (res.statusCode < 400) clearPublicCache();
    });
  }
  next();
});

// A network that has run out of password attempts is refused the entire
// admin API — including sign-in — until its block expires.
router.use(rejectBlockedIp);

// ── Auth (public) ────────────────────────────────────────────────────────────
router.post('/auth/login', adminLoginLimiter, validate(adminLoginSchema), adminAuthController.login);
router.post('/auth/refresh', adminAuthController.refresh);
router.get('/auth/status', adminAuthController.status);
router.post('/auth/forgot-password', passwordResetLimiter, validate(adminForgotPasswordSchema), adminAuthController.forgotPassword);
router.post('/auth/reset-password', adminLoginLimiter, validate(adminResetPasswordSchema), adminAuthController.resetPassword);

// ── Everything below requires an authenticated admin ─────────────────────────
// `requireAdminAuth` runs before every route, so no admin endpoint can be
// reached by an unauthenticated caller even if a later guard is forgotten.
router.use(requireAdminAuth);
router.use(requireCsrf);
router.use(requireOwnPassword);

router.post('/auth/logout', adminAuthController.logout);
router.get('/auth/me', adminAuthController.me);
router.get('/auth/sessions', adminAuthController.sessions);
router.post('/auth/change-password', adminLoginLimiter, validate(adminChangePasswordSchema), adminAuthController.changePassword);
// Re-enter the password to unlock sensitive actions for a few minutes.
router.post('/auth/reauth', adminLoginLimiter, validate(adminReauthSchema), adminAuthController.reauth);

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', requirePermission(P.ORDERS_READ), validate(dashboardQuerySchema), admin.getDashboard);

// ── Products ─────────────────────────────────────────────────────────────────
router.get('/products', requirePermission(P.PRODUCTS_READ), admin.listProducts);
router.get('/products/:id', requirePermission(P.PRODUCTS_READ), validate({ params: idParam }), admin.getProduct);
router.post('/products', requirePermission(P.PRODUCTS_CREATE), writeLimiter, validate(createProductSchema), admin.createProduct);
router.put('/products/:id', requirePermission(P.PRODUCTS_UPDATE), writeLimiter, validate(updateProductSchema), admin.updateProduct);
router.delete('/products/:id', requirePermission(P.PRODUCTS_DELETE), ifQueryFlag('hard', requireSuperAdmin, requireRecentAuth), writeLimiter, validate({ params: idParam }), admin.deleteProduct);
router.post('/products/bulk', requirePermission(P.PRODUCTS_UPDATE), writeLimiter, validate(bulkUpdateProductsSchema), admin.bulkUpdateProducts);

// ── Categories ───────────────────────────────────────────────────────────────
router.get('/categories', requirePermission(P.CATEGORIES_READ), validate(listCategoriesSchema), admin.listCategories);
router.post('/categories', requirePermission(P.CATEGORIES_CREATE), writeLimiter, validate(createCategorySchema), admin.createCategory);
router.put('/categories/:id', requirePermission(P.CATEGORIES_UPDATE), writeLimiter, validate(updateCategorySchema), admin.updateCategory);
router.delete('/categories/:id', requirePermission(P.CATEGORIES_DELETE), writeLimiter, validate({ params: idParam }), admin.deleteCategory);

// ── Collections ──────────────────────────────────────────────────────────────
router.get('/collections', requirePermission(P.COLLECTIONS_READ), admin.listCollections);
router.get('/collections/:id', requirePermission(P.COLLECTIONS_READ), validate({ params: idParam }), admin.getCollection);
router.post('/collections', requirePermission(P.COLLECTIONS_MANAGE), writeLimiter, validate(createCollectionSchema), admin.createCollection);
router.put('/collections/:id', requirePermission(P.COLLECTIONS_MANAGE), writeLimiter, validate(updateCollectionSchema), admin.updateCollection);
router.delete('/collections/:id', requirePermission(P.COLLECTIONS_MANAGE), writeLimiter, validate({ params: idParam }), admin.deleteCollection);

// ── Homepage CMS ─────────────────────────────────────────────────────────────
router.get('/homepage', requirePermission(P.HOMEPAGE_READ), admin.listSections);
router.get('/homepage/preview', requirePermission(P.HOMEPAGE_READ), admin.previewHomepage);
router.post('/homepage/sections', requirePermission(P.HOMEPAGE_MANAGE), writeLimiter, validate(createSectionSchema), admin.createSection);
router.put('/homepage/sections/:id', requirePermission(P.HOMEPAGE_MANAGE), writeLimiter, validate(updateSectionSchema), admin.updateSection);
router.delete('/homepage/sections/:id', requirePermission(P.HOMEPAGE_MANAGE), writeLimiter, validate({ params: idParam }), admin.deleteSection);
router.put('/homepage/reorder', requirePermission(P.HOMEPAGE_MANAGE), writeLimiter, validate(reorderSectionsSchema), admin.reorderSections);

// ── Shop config ──────────────────────────────────────────────────────────────
router.get('/shop', requirePermission(P.SHOP_READ), admin.getShopConfig);
router.put('/shop', requirePermission(P.SHOP_MANAGE), writeLimiter, validate(updateShopConfigSchema), admin.updateShopConfig);

// ── Inventory ────────────────────────────────────────────────────────────────
router.get('/inventory', requirePermission(P.INVENTORY_READ), admin.listInventory);
router.get('/inventory/:id/history', requirePermission(P.INVENTORY_READ), validate({ params: idParam }), admin.stockHistory);
router.put('/inventory', requirePermission(P.INVENTORY_UPDATE), writeLimiter, validate(adjustStockSchema), admin.adjustStock);
router.put('/inventory/bulk', requirePermission(P.INVENTORY_UPDATE), writeLimiter, validate(bulkAdjustStockSchema), admin.bulkAdjustStock);

// ── Orders ───────────────────────────────────────────────────────────────────
router.get('/orders', requirePermission(P.ORDERS_READ), admin.listOrders);
router.get('/orders/:id', requirePermission(P.ORDERS_READ), validate({ params: idParam }), admin.getOrder);
router.put('/orders/:id/status', requirePermission(P.ORDERS_UPDATE), writeLimiter, validate(updateOrderStatusSchema), admin.updateOrderStatus);
// Permanent — super admin only, on top of the permission check.
router.delete('/orders/:id', requireSuperAdmin, requirePermission(P.ORDERS_DELETE), requireRecentAuth, writeLimiter, validate(deleteOrderSchema), admin.deleteOrder);
router.post('/orders/:id/notes', requirePermission(P.ORDERS_UPDATE), writeLimiter, validate(orderNoteSchema), admin.addOrderNote);
router.put('/orders/:id/shipment', requirePermission(P.ORDERS_UPDATE), writeLimiter, validate(updateShipmentSchema), admin.updateOrderShipment);
router.get('/orders/:id/payments', requirePermission(P.ORDERS_READ), validate({ params: idParam }), admin.getOrderPayments);
router.post('/orders/:id/payments/verify', requirePermission(P.ORDERS_UPDATE), writeLimiter, validate({ params: idParam }), admin.verifyOrderPayment);
router.get('/orders/:id/emails', requirePermission(P.ORDERS_READ), validate({ params: idParam }), admin.listOrderEmails);
router.post('/orders/:id/emails/:eventId/retry', requirePermission(P.ORDERS_UPDATE), writeLimiter, validate(orderEmailRetrySchema), admin.retryOrderEmail);

// ── Customers ────────────────────────────────────────────────────────────────
router.get('/customers', requirePermission(P.CUSTOMERS_READ), admin.listCustomers);
router.get('/customers/:id', requirePermission(P.CUSTOMERS_READ), validate({ params: idParam }), admin.getCustomer);
// Permanent — super admin only, on top of the permission check.
router.delete('/customers/:id', requireSuperAdmin, requirePermission(P.CUSTOMERS_DELETE), requireRecentAuth, writeLimiter, validate(deleteCustomerSchema), admin.deleteCustomer);
router.put('/customers/:id/status', requirePermission(P.CUSTOMERS_UPDATE), writeLimiter, validate(setCustomerActiveSchema), admin.setCustomerActive);

// ── Feedback ─────────────────────────────────────────────────────────────────
router.get('/feedback', requirePermission(P.FEEDBACK_READ), validate(listFeedbackSchema), admin.listFeedback);
router.put('/feedback/:id', requirePermission(P.FEEDBACK_MANAGE), writeLimiter, validate(updateFeedbackSchema), admin.updateFeedback);
router.delete('/feedback/:id', requirePermission(P.FEEDBACK_MANAGE), writeLimiter, validate({ params: idParam }), admin.deleteFeedback);

// ── Media ────────────────────────────────────────────────────────────────────
router.get('/media', requirePermission(P.MEDIA_READ), admin.listAssets);
router.post('/media/signature', requirePermission(P.MEDIA_UPLOAD), validate(uploadSignatureSchema), admin.uploadSignature);
router.post('/media', requirePermission(P.MEDIA_UPLOAD), writeLimiter, validate(registerAssetSchema), admin.registerAsset);
router.put('/media/:id', requirePermission(P.MEDIA_UPLOAD), validate(updateAssetSchema), admin.updateAsset);
router.delete('/media/:id', requirePermission(P.MEDIA_DELETE), ifQueryFlag('force', requireSuperAdmin, requireRecentAuth), writeLimiter, validate({ params: idParam }), admin.deleteAsset);

// ── Admin users & roles ──────────────────────────────────────────────────────
router.get('/admin-users', requirePermission(P.ADMINS_READ), admin.listAdmins);
router.get('/admin-users/:id', requirePermission(P.ADMINS_READ), validate({ params: idParam }), admin.getAdminUser);
router.post('/admin-users', requirePermission(P.ADMINS_CREATE), requireRecentAuth, writeLimiter, validate(createAdminSchema), admin.createAdminUser);
router.put('/admin-users/:id', requirePermission(P.ADMINS_UPDATE), requireRecentAuth, writeLimiter, validate(updateAdminSchema), admin.updateAdminUser);
router.put('/admin-users/:id/status', requirePermission(P.ADMINS_DISABLE), requireRecentAuth, writeLimiter, validate(setAdminActiveSchema), admin.setAdminActive);
router.put('/admin-users/:id/password', requirePermission(P.ADMINS_UPDATE), requireRecentAuth, writeLimiter, validate(resetAdminPasswordSchema), admin.resetAdminPassword);
// Lift a sign-in lock early (e.g. after confirming with the admin by phone).
router.post('/admin-users/:id/unlock', requirePermission(P.ADMINS_UPDATE), requireRecentAuth, writeLimiter, validate(unlockAdminSchema), admin.unlockAdminUser);
// Permanent removal — restricted to super admins, same guard combo as the audit log.
router.delete('/admin-users/:id', requireSuperAdmin, requirePermission(P.ADMINS_DELETE), requireRecentAuth, writeLimiter, validate(deleteAdminSchema), admin.deleteAdminUser);

router.get('/roles', requirePermission(P.ROLES_MANAGE), admin.listRoles);
router.put('/roles/:id', requirePermission(P.ROLES_MANAGE), requireRecentAuth, writeLimiter, validate(updateRoleSchema), admin.updateRole);

// ── Network blocks ───────────────────────────────────────────────────────────
router.get('/security/blocked-ips', requireSuperAdmin, adminAuthController.blockedIps);
router.delete('/security/blocked-ips/:id', requireSuperAdmin, requireRecentAuth, writeLimiter, validate({ params: idParam }), adminAuthController.unblockIp);

// ── Audit logs ───────────────────────────────────────────────────────────────
// Read-only by design: there is no route that edits or deletes an entry, and
// only a super admin may read the trail.
router.get('/audit-logs', requireSuperAdmin, requirePermission(P.AUDITLOGS_READ), admin.getAuditLogs);

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', requirePermission(P.SETTINGS_READ), admin.getSettings);
router.put('/settings', requirePermission(P.SETTINGS_UPDATE), requireRecentAuth, writeLimiter, validate(updateSettingsSchema), admin.updateSettings);

export default router;
