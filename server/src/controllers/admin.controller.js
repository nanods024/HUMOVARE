import * as productService from '../services/product.service.js';
import * as categoryService from '../services/category.service.js';
import * as collectionService from '../services/collection.service.js';
import * as homepageService from '../services/homepage.service.js';
import * as shopConfigService from '../services/shopConfig.service.js';
import * as inventoryService from '../services/inventory.service.js';
import * as dashboardService from '../services/dashboard.service.js';
import * as mediaService from '../services/media.service.js';
import * as adminUserService from '../services/adminUser.service.js';
import * as adminOps from '../services/adminOps.service.js';
import * as feedbackService from '../services/feedback.service.js';
import * as onlinePayment from '../services/payments/onlinePayment.service.js';
import { listEmailEvents } from '../services/email/email.service.js';
import { retryEmailEvent } from '../services/email/notifications.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { recordAudit, listAuditLogs } from '../services/audit.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { AUDIT_ACTIONS } from '../constants/permissions.js';
import { Product } from '../models/Product.js';
import { env } from '../config/env.js';

/**
 * Admin controllers.
 *
 * Thin by design: each one validates nothing (the route already did), calls a
 * service, writes an audit entry for mutations, and returns the shared
 * envelope. All the reasoning lives in the services.
 */

const actorId = (req) => req.adminUser?._id ?? null;

// ── Dashboard ────────────────────────────────────────────────────────────────

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboard(req.validatedQuery ?? {});
  return sendSuccess(res, { message: 'Dashboard fetched', data });
});

// ── Products ─────────────────────────────────────────────────────────────────

/** Admin listing differs from the storefront: inactive products are included. */
export const listProducts = asyncHandler(async (req, res) => {
  const query = req.query ?? {};
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.isActive !== undefined && query.isActive !== '') filter.isActive = query.isActive === 'true';
  if (query.category) filter.category = query.category;
  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(safe, 'i');
    filter.$or = [{ name: pattern }, { slug: pattern }, { 'variants.sku': pattern }];
  }
  if (query.flag === 'featured') filter.isFeatured = true;
  if (query.flag === 'new-drop') filter.isNewDrop = true;
  if (query.flag === 'bestseller') filter.isBestSeller = true;
  if (query.flag === 'sale') filter.discountPercentage = { $gt: 0 };
  if (query.flag === 'designer-exclusive') filter.isDesignerExclusive = true;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select('name slug price mrp discountPercentage stock isActive isFeatured isNewDrop isBestSeller isDesignerExclusive thumbnail category createdAt updatedAt')
      .populate('category', 'name slug')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    message: 'Products fetched',
    data: { products, pagination: buildPaginationMeta({ page, limit, total }) },
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('category', 'name slug')
    .populate('collections', 'name slug')
    .lean({ virtuals: true });

  if (!product) throw ApiError.notFound('Product not found');
  return sendSuccess(res, { message: 'Product fetched', data: { product } });
});

export const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PRODUCT_CREATED,
    resource: 'product',
    resourceId: product._id,
    description: `Created product "${product.name}"`,
    after: { name: product.name, price: product.price, isActive: product.isActive },
  });

  return sendCreated(res, { message: 'Product created', data: { product } });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const before = await Product.findById(req.params.id).lean();
  const product = await productService.updateProduct(req.params.id, req.body);

  // A price change is worth its own audit line — it is the field most likely
  // to be queried after the fact.
  if (before && req.body.price !== undefined && before.price !== product.price) {
    await recordAudit({
      req,
      action: AUDIT_ACTIONS.PRICE_CHANGED,
      resource: 'product',
      resourceId: product._id,
      description: `Price changed on "${product.name}"`,
      before: { price: before.price },
      after: { price: product.price },
    });
  }

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    resource: 'product',
    resourceId: product._id,
    description: `Updated product "${product.name}"`,
    metadata: { fields: Object.keys(req.body) },
  });

  return sendSuccess(res, { message: 'Product updated', data: { product } });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const result = await productService.deleteProduct(req.params.id, { hard: req.query.hard === 'true' });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PRODUCT_DELETED,
    resource: 'product',
    resourceId: req.params.id,
    description: result.deleted ? 'Product permanently deleted' : 'Product deactivated',
    metadata: result,
  });

  return sendSuccess(res, {
    message: result.deleted ? 'Product deleted' : 'Product deactivated',
    data: result,
  });
});

export const bulkUpdateProducts = asyncHandler(async (req, res) => {
  const { ids, updates } = req.body;
  const result = await adminOps.bulkUpdateProducts(ids, updates);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PRODUCT_BULK_UPDATED,
    resource: 'product',
    description: `Bulk updated ${result.modified} product(s)`,
    metadata: { ids: ids.slice(0, 50), updates: result.updates },
  });

  return sendSuccess(res, { message: `${result.modified} product(s) updated`, data: result });
});

// ── Categories ───────────────────────────────────────────────────────────────

export const listCategories = asyncHandler(async (req, res) => {
  const categories = await categoryService.listCategories(req.validatedQuery ?? {});
  return sendSuccess(res, { message: 'Categories fetched', data: { categories } });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.CATEGORY_CREATED,
    resource: 'category',
    resourceId: category._id,
    description: `Created category "${category.name}"`,
  });

  return sendCreated(res, { message: 'Category created', data: { category } });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.CATEGORY_UPDATED,
    resource: 'category',
    resourceId: category._id,
    description: `Updated category "${category.name}"`,
    metadata: { fields: Object.keys(req.body) },
  });

  return sendSuccess(res, { message: 'Category updated', data: { category } });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const result = await categoryService.deleteCategory(req.params.id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.CATEGORY_DELETED,
    resource: 'category',
    resourceId: req.params.id,
    description: 'Deleted category',
  });

  return sendSuccess(res, { message: 'Category deleted', data: result });
});

// ── Collections ──────────────────────────────────────────────────────────────

export const listCollections = asyncHandler(async (req, res) => {
  const data = await collectionService.listCollections(req.query ?? {});
  return sendSuccess(res, { message: 'Collections fetched', data });
});

export const getCollection = asyncHandler(async (req, res) => {
  const collection = await collectionService.getCollection(req.params.id);
  return sendSuccess(res, { message: 'Collection fetched', data: { collection } });
});

export const createCollection = asyncHandler(async (req, res) => {
  const collection = await collectionService.createCollection(req.body, actorId(req));

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.COLLECTION_CREATED,
    resource: 'collection',
    resourceId: collection._id,
    description: `Created collection "${collection.name}"`,
  });

  return sendCreated(res, { message: 'Collection created', data: { collection } });
});

export const updateCollection = asyncHandler(async (req, res) => {
  const collection = await collectionService.updateCollection(req.params.id, req.body, actorId(req));

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.COLLECTION_UPDATED,
    resource: 'collection',
    resourceId: collection._id,
    description: `Updated collection "${collection.name}"`,
    metadata: { fields: Object.keys(req.body) },
  });

  return sendSuccess(res, { message: 'Collection updated', data: { collection } });
});

export const deleteCollection = asyncHandler(async (req, res) => {
  const result = await collectionService.deleteCollection(req.params.id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.COLLECTION_DELETED,
    resource: 'collection',
    resourceId: req.params.id,
    description: 'Deleted collection',
  });

  return sendSuccess(res, { message: 'Collection deleted', data: result });
});

// ── Homepage ─────────────────────────────────────────────────────────────────

export const listSections = asyncHandler(async (req, res) => {
  const sections = await homepageService.listSections();
  return sendSuccess(res, { message: 'Homepage sections fetched', data: { sections } });
});

export const previewHomepage = asyncHandler(async (_req, res) => {
  const sections = await homepageService.getHomepagePreview();
  return sendSuccess(res, { message: 'Homepage preview fetched', data: { sections } });
});

export const createSection = asyncHandler(async (req, res) => {
  const section = await homepageService.createSection(req.body, actorId(req));

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.HOMEPAGE_SECTION_CREATED,
    resource: 'homepageSection',
    resourceId: section._id,
    description: `Created homepage section "${section.name}"`,
  });

  return sendCreated(res, { message: 'Section created', data: { section } });
});

export const updateSection = asyncHandler(async (req, res) => {
  const before = await homepageService.getSection(req.params.id);
  const section = await homepageService.updateSection(req.params.id, req.body, actorId(req));

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.HOMEPAGE_SECTION_UPDATED,
    resource: 'homepageSection',
    resourceId: section._id,
    description: `Updated homepage section "${section.name}"`,
    before: { status: before.status, title: before.title },
    after: { status: section.status, title: section.title },
  });

  return sendSuccess(res, { message: 'Section updated', data: { section } });
});

export const deleteSection = asyncHandler(async (req, res) => {
  const result = await homepageService.deleteSection(req.params.id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.HOMEPAGE_SECTION_DELETED,
    resource: 'homepageSection',
    resourceId: req.params.id,
    description: 'Deleted homepage section',
  });

  return sendSuccess(res, { message: 'Section deleted', data: result });
});

export const reorderSections = asyncHandler(async (req, res) => {
  const sections = await homepageService.reorderSections(req.body.order, actorId(req));

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.HOMEPAGE_REORDERED,
    resource: 'homepageSection',
    description: 'Reordered homepage sections',
    metadata: { order: req.body.order },
  });

  return sendSuccess(res, { message: 'Sections reordered', data: { sections } });
});

// ── Shop config ──────────────────────────────────────────────────────────────

export const getShopConfig = asyncHandler(async (_req, res) => {
  const config = await shopConfigService.getShopConfig();
  return sendSuccess(res, { message: 'Shop config fetched', data: { config } });
});

export const updateShopConfig = asyncHandler(async (req, res) => {
  const { before, after } = await shopConfigService.updateShopConfig(req.body, actorId(req));

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.SHOP_CONFIG_UPDATED,
    resource: 'shopConfig',
    resourceId: after._id,
    description: 'Updated shop page configuration',
    before: { defaultSort: before.defaultSort, pageSize: before.pageSize },
    after: { defaultSort: after.defaultSort, pageSize: after.pageSize },
  });

  return sendSuccess(res, { message: 'Shop configuration saved', data: { config: after } });
});

// ── Inventory ────────────────────────────────────────────────────────────────

export const listInventory = asyncHandler(async (req, res) => {
  const data = await inventoryService.listInventory(req.query ?? {});
  return sendSuccess(res, { message: 'Inventory fetched', data });
});

export const adjustStock = asyncHandler(async (req, res) => {
  const result = await inventoryService.adjustStock({ ...req.body, adminId: actorId(req) });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.STOCK_CHANGED,
    resource: 'product',
    resourceId: result.productId,
    description: `Stock for ${result.sku} set to ${result.stock} (was ${result.previous})`,
    before: { stock: result.previous },
    after: { stock: result.stock },
    metadata: { reason: req.body.reason ?? '' },
  });

  return sendSuccess(res, { message: 'Stock updated', data: result });
});

export const bulkAdjustStock = asyncHandler(async (req, res) => {
  const result = await inventoryService.bulkAdjustStock(req.body.adjustments, actorId(req));

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.STOCK_CHANGED,
    resource: 'product',
    description: `Bulk stock update — ${result.updated} succeeded, ${result.failed} failed`,
    metadata: { updated: result.updated, failed: result.failed },
  });

  return sendSuccess(res, { message: `${result.updated} variant(s) updated`, data: result });
});

export const stockHistory = asyncHandler(async (req, res) => {
  const history = await inventoryService.getStockHistory(req.params.id);
  return sendSuccess(res, { message: 'Stock history fetched', data: { history } });
});

// ── Orders ───────────────────────────────────────────────────────────────────

export const listOrders = asyncHandler(async (req, res) => {
  const data = await adminOps.listOrders(req.query ?? {});
  return sendSuccess(res, { message: 'Orders fetched', data });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await adminOps.getOrder(req.params.id);
  return sendSuccess(res, { message: 'Order fetched', data: { order } });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { order, before, after, email } = await adminOps.updateOrderStatus(
    req.params.id,
    req.body.status,
    req.body.note,
    req.body.shipment,
  );

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
    resource: 'order',
    resourceId: order._id,
    description: `Order ${order.orderNumber}: ${before} → ${after}`,
    before: { orderStatus: before },
    after: { orderStatus: after },
  });

  return sendSuccess(res, {
    message: 'Order status updated',
    data: { order, email: { status: email?.status ?? 'none' } },
  });
});


export const updateOrderShipment = asyncHandler(async (req, res) => {
  const { order, before } = await adminOps.updateShipment(req.params.id, req.body);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ORDER_SHIPMENT_UPDATED,
    resource: 'order',
    resourceId: order._id,
    description: `Order ${order.orderNumber}: courier details updated`,
    before,
    after: {
      carrier: order.shipment.carrier,
      trackingNumber: order.shipment.trackingNumber,
      trackingUrl: order.shipment.trackingUrl,
    },
  });

  return sendSuccess(res, { message: 'Courier details saved', data: { order } });
});

/** Every PhonePe attempt and event for one order. No secrets, no checkout links. */
export const getOrderPayments = asyncHandler(async (req, res) => {
  const data = await onlinePayment.adminPaymentDetails(req.params.id);
  return sendSuccess(res, { message: 'Payments fetched', data });
});

/** Asks PhonePe for the current state of anything still open on the order. */
export const verifyOrderPayment = asyncHandler(async (req, res) => {
  const { results } = await onlinePayment.adminVerify(req.params.id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PAYMENT_VERIFIED,
    resource: 'order',
    resourceId: req.params.id,
    description: `Checked payment status with PhonePe (${results.length} open)`,
    after: { results: results.map((result) => ({ reference: result.reference, status: result.status })) },
  });

  const order = await adminOps.getOrder(req.params.id);
  return sendSuccess(res, { message: 'Checked with PhonePe', data: { results, order } });
});


/** Email history for one order. Bodies are never stored, so none are returned. */
export const listOrderEmails = asyncHandler(async (req, res) => {
  const emails = await listEmailEvents({ order: req.params.id });
  return sendSuccess(res, { message: 'Emails fetched', data: { emails } });
});

export const retryOrderEmail = asyncHandler(async (req, res) => {
  const event = await EmailEvent.findOne({ _id: req.params.eventId, order: req.params.id }).lean();
  if (!event) throw ApiError.notFound('Email not found for this order');

  const result = await retryEmailEvent(event._id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.EMAIL_RESENT,
    resource: 'order',
    resourceId: req.params.id,
    description: `Retried ${event.type.toLowerCase().replace(/_/g, ' ')} email — ${result.status}`,
  });

  return sendSuccess(res, { message: `Email ${result.status}`, data: { result: { status: result.status } } });
});

export const addOrderNote = asyncHandler(async (req, res) => {
  const order = await adminOps.addOrderNote(req.params.id, req.body.note);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ORDER_NOTE_ADDED,
    resource: 'order',
    resourceId: order._id,
    description: `Note added to ${order.orderNumber}`,
  });

  return sendSuccess(res, { message: 'Note added', data: { order } });
});

// ── Customers ────────────────────────────────────────────────────────────────

export const listCustomers = asyncHandler(async (req, res) => {
  const data = await adminOps.listCustomers(req.query ?? {});
  return sendSuccess(res, { message: 'Customers fetched', data });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await adminOps.getCustomer(req.params.id);
  return sendSuccess(res, { message: 'Customer fetched', data: { customer } });
});

export const setCustomerActive = asyncHandler(async (req, res) => {
  const customer = await adminOps.setCustomerActive(req.params.id, req.body.isActive);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
    resource: 'user',
    resourceId: req.params.id,
    description: `Customer ${req.body.isActive ? 'enabled' : 'disabled'}`,
  });

  return sendSuccess(res, { message: 'Customer updated', data: { customer } });
});

// ── Media ────────────────────────────────────────────────────────────────────

export const uploadSignature = asyncHandler(async (req, res) => {
  const signature = mediaService.createUploadSignature({ folder: req.body?.folder });
  return sendSuccess(res, { message: 'Upload signature issued', data: signature });
});

export const registerAsset = asyncHandler(async (req, res) => {
  // Confirms Cloudinary really issued this public id before we record it.
  mediaService.verifyUploadSignature(req.body);
  const asset = await mediaService.registerAsset(req.body, actorId(req));

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.MEDIA_UPLOADED,
    resource: 'media',
    resourceId: asset._id,
    description: `Uploaded ${asset.publicId}`,
  });

  return sendCreated(res, { message: 'Media registered', data: { asset } });
});

export const listAssets = asyncHandler(async (req, res) => {
  const data = await mediaService.listAssets(req.query ?? {});
  return sendSuccess(res, { message: 'Media fetched', data });
});

export const updateAsset = asyncHandler(async (req, res) => {
  const asset = await mediaService.updateAsset(req.params.id, req.body);
  return sendSuccess(res, { message: 'Media updated', data: { asset } });
});

export const deleteAsset = asyncHandler(async (req, res) => {
  const result = await mediaService.deleteAsset(req.params.id, { force: req.query.force === 'true' });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.MEDIA_DELETED,
    resource: 'media',
    resourceId: req.params.id,
    description: 'Deleted media asset',
    metadata: result.usage,
  });

  return sendSuccess(res, { message: 'Media deleted', data: result });
});

// ── Admin users & roles ──────────────────────────────────────────────────────

export const listAdmins = asyncHandler(async (req, res) => {
  const data = await adminUserService.listAdmins(req.query ?? {});
  return sendSuccess(res, { message: 'Admins fetched', data });
});

export const getAdminUser = asyncHandler(async (req, res) => {
  const admin = await adminUserService.getAdmin(req.params.id);
  return sendSuccess(res, { message: 'Admin fetched', data: { admin } });
});

export const createAdminUser = asyncHandler(async (req, res) => {
  const admin = await adminUserService.createAdmin(req.body, req.adminUser);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_CREATED,
    resource: 'adminUser',
    resourceId: admin.id,
    description: `Created admin ${admin.email} (${admin.role})`,
  });

  return sendCreated(res, { message: 'Admin created', data: { admin } });
});

export const updateAdminUser = asyncHandler(async (req, res) => {
  const admin = await adminUserService.updateAdmin(req.params.id, req.body, req.adminUser);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_UPDATED,
    resource: 'adminUser',
    resourceId: admin.id,
    description: `Updated admin ${admin.email}`,
    metadata: { fields: Object.keys(req.body) },
  });

  return sendSuccess(res, { message: 'Admin updated', data: { admin } });
});

export const setAdminActive = asyncHandler(async (req, res) => {
  const admin = await adminUserService.setAdminActive(req.params.id, req.body.isActive, req.adminUser);

  await recordAudit({
    req,
    action: req.body.isActive ? AUDIT_ACTIONS.ADMIN_ENABLED : AUDIT_ACTIONS.ADMIN_DISABLED,
    resource: 'adminUser',
    resourceId: admin.id,
    description: `${req.body.isActive ? 'Enabled' : 'Disabled'} admin ${admin.email}`,
  });

  return sendSuccess(res, { message: 'Admin updated', data: { admin } });
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const deleteOrders = (req.validatedQuery ?? req.query)?.orders === 'true';
  const deleted = await adminOps.deleteCustomer(req.params.id, { deleteOrders });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.CUSTOMER_DELETED,
    resource: 'customer',
    resourceId: deleted.id,
    description: `Deleted customer ${deleted.email}${deleted.ordersDeleted ? ` and ${deleted.ordersDeleted} order(s)` : ''}`,
    before: deleted,
  });

  return sendSuccess(res, { message: 'Customer deleted', data: { deleted: true, ...deleted } });
});

export const deleteOrder = asyncHandler(async (req, res) => {
  const deleted = await adminOps.deleteOrder(req.params.id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ORDER_DELETED,
    resource: 'order',
    resourceId: deleted.id,
    description: `Deleted order ${deleted.orderNumber}${deleted.restocked ? ' (stock returned)' : ''}`,
    before: deleted,
  });

  return sendSuccess(res, { message: 'Order deleted', data: { deleted: true, restocked: deleted.restocked } });
});

export const deleteAdminUser = asyncHandler(async (req, res) => {
  const deleted = await adminUserService.deleteAdmin(req.params.id, req.adminUser);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_DELETED,
    resource: 'adminUser',
    resourceId: deleted.id,
    description: `Deleted admin ${deleted.email} (${deleted.role})`,
    before: deleted,
  });

  return sendSuccess(res, { message: 'Admin deleted', data: { deleted: true } });
});

export const unlockAdminUser = asyncHandler(async (req, res) => {
  const admin = await adminUserService.unlockAdmin(req.params.id, req.adminUser);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_ACCOUNT_UNLOCKED,
    resource: 'adminUser',
    resourceId: admin.id,
    description: `Lifted the sign-in lock for ${admin.email}`,
  });

  return sendSuccess(res, { message: 'Sign-in unlocked', data: { admin } });
});

export const resetAdminPassword = asyncHandler(async (req, res) => {
  const admin = await adminUserService.resetAdminPassword(req.params.id, req.body.password, req.adminUser);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_PASSWORD_RESET,
    resource: 'adminUser',
    resourceId: admin.id,
    description: `Reset password for ${admin.email}`,
  });

  return sendSuccess(res, { message: 'Password reset', data: { admin } });
});

export const listRoles = asyncHandler(async (_req, res) => {
  const roles = await adminUserService.listRoles();
  return sendSuccess(res, { message: 'Roles fetched', data: { roles } });
});

export const updateRole = asyncHandler(async (req, res) => {
  const role = await adminUserService.updateRole(req.params.id, req.body, req.adminUser);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ROLE_UPDATED,
    resource: 'role',
    resourceId: role._id,
    description: `Updated role ${role.name}`,
    after: { permissions: role.permissions },
  });

  return sendSuccess(res, { message: 'Role updated', data: { role } });
});

// ── Audit logs & settings ────────────────────────────────────────────────────

export const getAuditLogs = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query ?? {});
  const { logs, total } = await listAuditLogs(req.query ?? {}, pagination);

  return sendSuccess(res, {
    message: 'Audit logs fetched',
    data: {
      logs,
      pagination: buildPaginationMeta({ ...pagination, total }),
      // So the UI's "older entries are deleted automatically" copy always
      // matches the server's actual configuration, not a hardcoded number.
      retentionDays: env.auditLog.retentionDays,
    },
  });
});

export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await adminOps.getSettings();
  return sendSuccess(res, { message: 'Settings fetched', data: { settings } });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const { after } = await adminOps.updateSettings(req.body, actorId(req));

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    resource: 'storeSetting',
    resourceId: after._id,
    description: 'Updated store settings',
    metadata: { fields: Object.keys(req.body) },
  });

  return sendSuccess(res, { message: 'Settings saved', data: { settings: after } });
});

// ── Feedback ─────────────────────────────────────────────────────────────────

export const listFeedback = asyncHandler(async (req, res) => {
  const data = await feedbackService.listFeedback(req.query ?? {});
  return sendSuccess(res, { message: 'Messages fetched', data });
});

export const updateFeedback = asyncHandler(async (req, res) => {
  const { before, after } = await feedbackService.updateFeedback(
    req.params.id,
    req.body,
    actorId(req),
  );

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.FEEDBACK_UPDATED,
    resource: 'feedback',
    resourceId: req.params.id,
    // The message body itself is not audited — it is a customer's words, and
    // the audit log is read by more people than the inbox is.
    description: `Message from ${after.email} marked ${after.status}`,
    before,
    after: { status: after.status },
  });

  return sendSuccess(res, { message: 'Message updated', data: { message: after } });
});

export const deleteFeedback = asyncHandler(async (req, res) => {
  const result = await feedbackService.deleteFeedback(req.params.id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.FEEDBACK_DELETED,
    resource: 'feedback',
    resourceId: req.params.id,
    description: 'Message deleted',
  });

  return sendSuccess(res, { message: 'Message deleted', data: result });
});
