import { api, toQuery } from './client';
import type {
  AdminCustomer,
  EmailOutcome,
  OrderEmailEvent,
  OrderPayments,
  ShipmentInput,
  FeedbackMessage,
  FeedbackStatus,
  AdminOrder,
  AdminProduct,
  AdminProductRow,
  AdminUser,
  AuditLogEntry,
  Category,
  Collection,
  DashboardData,
  HomepageSection,
  InventoryRow, InventoryProduct, InventorySummary,
  MediaAsset,
  Pagination,
  Role,
  ShopConfig,
  StoreSettings,
} from '@/types';

type Paged<K extends string, T> = { [P in K]: T[] } & { pagination: Pagination };

/** Session rules set on the server; the app only uses them for countdowns. */
export interface SecurityPolicy {
  idleMinutes: number;
  reauthMinutes: number;
  maxSessionHours: number;
  maxLoginAttempts: number;
  lockMinutes: number;
  ipMaxAttempts: number;
  ipBlockMinutes: number;
  /** 'panel': wrong passwords lock the whole panel for everyone; 'network': only that IP. */
  lockoutScope: 'panel' | 'network';
}

export interface AdminSession {
  user: AdminUser;
  permissions: string[];
  csrfToken: string;
  security?: SecurityPolicy;
}

export const authApi = {
  login: (payload: { email: string; password: string }) =>
    api.post<AdminSession>('/auth/login', payload),
  logout: () => api.post<null>('/auth/logout'),
  me: () => api.get<{ user: AdminUser; permissions: string[]; security?: SecurityPolicy }>('/auth/me'),
  /** 200 when this network may use the admin panel; 423 IP_BLOCKED when not. */
  status: () => api.get<{ blocked: boolean; security: SecurityPolicy }>('/auth/status'),
  reauth: (password: string) => api.post<{ authenticatedAt: string; reauthMinutes: number }>('/auth/reauth', { password }),
  forgotPassword: (email: string) => api.post<null>('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => api.post<null>('/auth/reset-password', { token, password }),
  sessions: () =>
    api.get<{ sessions: { ip: string; userAgent: string; createdAt: string; revokedAt: string | null }[] }>(
      '/auth/sessions',
    ),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    api.post<AdminSession>('/auth/change-password', payload),
};

export const dashboardApi = {
  get: (params: { range?: string; from?: string; to?: string } = {}) =>
    api.get<DashboardData>(`/dashboard${toQuery(params)}`),
};

export const productsApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<Paged<'products', AdminProductRow>>(`/products${toQuery(params)}`),
  get: (id: string) => api.get<{ product: AdminProduct }>(`/products/${id}`),
  create: (payload: unknown) => api.post<{ product: AdminProduct }>('/products', payload),
  update: (id: string, payload: unknown) =>
    api.put<{ product: AdminProduct }>(`/products/${id}`, payload),
  remove: (id: string, hard = false) =>
    api.delete<{ deleted: boolean; deactivated: boolean }>(`/products/${id}${toQuery({ hard })}`),
  bulk: (ids: string[], updates: Record<string, unknown>) =>
    api.post<{ matched: number; modified: number }>('/products/bulk', { ids, updates }),
};

export const categoriesApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<{ categories: Category[] }>(`/categories${toQuery(params)}`),
  create: (payload: unknown) => api.post<{ category: Category }>('/categories', payload),
  update: (id: string, payload: unknown) =>
    api.put<{ category: Category }>(`/categories/${id}`, payload),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/categories/${id}`),
};

export const collectionsApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<Paged<'collections', Collection>>(`/collections${toQuery(params)}`),
  get: (id: string) => api.get<{ collection: Collection }>(`/collections/${id}`),
  create: (payload: unknown) => api.post<{ collection: Collection }>('/collections', payload),
  update: (id: string, payload: unknown) =>
    api.put<{ collection: Collection }>(`/collections/${id}`, payload),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/collections/${id}`),
};

export const homepageApi = {
  list: () => api.get<{ sections: HomepageSection[] }>('/homepage'),
  preview: () => api.get<{ sections: Record<string, unknown>[] }>('/homepage/preview'),
  create: (payload: unknown) => api.post<{ section: HomepageSection }>('/homepage/sections', payload),
  update: (id: string, payload: unknown) =>
    api.put<{ section: HomepageSection }>(`/homepage/sections/${id}`, payload),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/homepage/sections/${id}`),
  reorder: (order: string[]) => api.put<{ sections: HomepageSection[] }>('/homepage/reorder', { order }),
};

export const shopApi = {
  get: () => api.get<{ config: ShopConfig }>('/shop'),
  update: (payload: unknown) => api.put<{ config: ShopConfig }>('/shop', payload),
};

export const inventoryApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<{ products: InventoryProduct[]; items: InventoryRow[]; summary: InventorySummary; pagination: Pagination }>(
      `/inventory${toQuery(params)}`,
    ),
  adjust: (payload: { productId: string; variantId: string; quantity: number; reason?: string }) =>
    api.put<{ stock: number; previous: number; sku: string }>('/inventory', payload),
  bulkAdjust: (
    adjustments: { productId: string; variantId: string; quantity: number; reason?: string }[],
  ) =>
    api.put<{ updated: number; failed: number; results: { ok: boolean; sku?: string; error?: string }[] }>(
      '/inventory/bulk',
      { adjustments },
    ),
  history: (productId: string) =>
    api.get<{ history: { type: string; delta: number; balanceAfter: number; reason: string; createdAt: string; adminUser?: { name: string } }[] }>(
      `/inventory/${productId}/history`,
    ),
};

export const ordersApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<Paged<'orders', AdminOrder>>(`/orders${toQuery(params)}`),
  get: (id: string) => api.get<{ order: AdminOrder }>(`/orders/${id}`),
  updateStatus: (id: string, status: string, note?: string, shipment?: ShipmentInput) =>
    api.put<{ order: AdminOrder; email: EmailOutcome }>(`/orders/${id}/status`, { status, note, shipment }),
  updateShipment: (id: string, shipment: ShipmentInput) =>
    api.put<{ order: AdminOrder }>(`/orders/${id}/shipment`, shipment),
  payments: (id: string) => api.get<OrderPayments>(`/orders/${id}/payments`),
  verifyPayment: (id: string) =>
    api.post<{ results: { reference: string; status: string }[]; order: AdminOrder }>(`/orders/${id}/payments/verify`),
  emails: (id: string) => api.get<{ emails: OrderEmailEvent[] }>(`/orders/${id}/emails`),
  retryEmail: (id: string, eventId: string) =>
    api.post<{ result: EmailOutcome }>(`/orders/${id}/emails/${eventId}/retry`),
  addNote: (id: string, note: string) => api.post<{ order: AdminOrder }>(`/orders/${id}/notes`, { note }),
  /** Super admin only. Permanent. */
  remove: (id: string) => api.delete<{ deleted: boolean; restocked: boolean }>(`/orders/${id}`),
};

export const customersApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<Paged<'customers', AdminCustomer>>(`/customers${toQuery(params)}`),
  get: (id: string) => api.get<{ customer: AdminCustomer & { orders: AdminOrder[] } }>(`/customers/${id}`),
  setActive: (id: string, isActive: boolean) =>
    api.put<{ customer: AdminCustomer }>(`/customers/${id}/status`, { isActive }),
  /** Super admin only. Permanent. Orders are kept unless `deleteOrders`. */
  remove: (id: string, deleteOrders = false) =>
    api.delete<{ deleted: boolean; ordersDeleted: number; ordersKept: number }>(
      `/customers/${id}${deleteOrders ? '?orders=true' : ''}`,
    ),
};

export interface UploadSignature {
  signature: string;
  timestamp: number;
  folder: string;
  transformation: string;
  apiKey: string;
  cloudName: string;
  allowedFormats: string[];
  maxBytes: number;
}

export const mediaApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<Paged<'assets', MediaAsset>>(`/media${toQuery(params)}`),
  signature: (folder: string) => api.post<UploadSignature>('/media/signature', { folder }),
  register: (payload: unknown) => api.post<{ asset: MediaAsset }>('/media', payload),
  update: (id: string, payload: { altText?: string }) =>
    api.put<{ asset: MediaAsset }>(`/media/${id}`, payload),
  remove: (id: string, force = false) =>
    api.delete<{ deleted: boolean }>(`/media/${id}${toQuery({ force })}`),
};

export const feedbackApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<{ messages: FeedbackMessage[]; unread: number; pagination: Pagination }>(
      `/feedback${toQuery(params)}`,
    ),
  update: (id: string, payload: { status?: FeedbackStatus; note?: string }) =>
    api.put<{ message: FeedbackMessage }>(`/feedback/${id}`, payload),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/feedback/${id}`),
};

export const adminUsersApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<Paged<'admins', AdminUser>>(`/admin-users${toQuery(params)}`),
  get: (id: string) => api.get<{ admin: AdminUser }>(`/admin-users/${id}`),
  create: (payload: unknown) => api.post<{ admin: AdminUser }>('/admin-users', payload),
  update: (id: string, payload: unknown) => api.put<{ admin: AdminUser }>(`/admin-users/${id}`, payload),
  setActive: (id: string, isActive: boolean) =>
    api.put<{ admin: AdminUser }>(`/admin-users/${id}/status`, { isActive }),
  resetPassword: (id: string, password: string) =>
    api.put<{ admin: AdminUser }>(`/admin-users/${id}/password`, { password }),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/admin-users/${id}`),
  /** Lift a sign-in lock before it expires. */
  unlock: (id: string) => api.post<{ admin: AdminUser }>(`/admin-users/${id}/unlock`),
};

export const rolesApi = {
  list: () => api.get<{ roles: Role[] }>('/roles'),
  update: (id: string, payload: { permissions?: string[]; description?: string }) =>
    api.put<{ role: Role }>(`/roles/${id}`, payload),
};

export const auditApi = {
  list: (params: Record<string, unknown> = {}) =>
    api.get<{ logs: AuditLogEntry[]; pagination: Pagination; retentionDays: number }>(`/audit-logs${toQuery(params)}`),
};

export const settingsApi = {
  get: () => api.get<{ settings: StoreSettings }>('/settings'),
  update: (payload: unknown) => api.put<{ settings: StoreSettings }>('/settings', payload),
};

export interface BlockedNetwork {
  id: string;
  scope: 'panel' | 'network';
  ip: string;
  blockedUntil: string;
  lastFailureAt: string | null;
}

/** Networks shut out of the admin panel after too many wrong passwords (super admins). */
export const securityApi = {
  blockedIps: () => api.get<{ blocks: BlockedNetwork[] }>('/security/blocked-ips'),
  unblockIp: (id: string) => api.delete<{ id: string }>(`/security/blocked-ips/${id}`),
};
