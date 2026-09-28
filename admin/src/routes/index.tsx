import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AdminLayout } from '@/layouts/AdminLayout';
import { RequireAuth, RequirePermission, RouteLoader } from '@/components/common/Guards';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { PERMISSIONS as P } from '@/permissions';
import LoginPage from '@/pages/Auth/LoginPage';

const ForgotPasswordPage = lazy(() => import('@/pages/Auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/Auth/ResetPasswordPage'));

/**
 * Route map.
 *
 * Login is eager (it is the entry point); every authenticated screen is code
 * split so the login bundle stays small. Each route declares the permission
 * it needs — the same one the API enforces server-side.
 */
const DashboardPage = lazy(() => import('@/pages/Dashboard/DashboardPage'));

const ProductsPage = lazy(() => import('@/pages/Catalog/ProductsPage'));
const ProductEditorPage = lazy(() => import('@/pages/Catalog/ProductEditorPage'));
const ProductCreatePage = lazy(() => import('@/pages/Catalog/ProductCreatePage'));
const CategoriesPage = lazy(() => import('@/pages/Catalog/CategoriesPage'));
const CollectionsPage = lazy(() => import('@/pages/Catalog/CollectionsPage'));
const InventoryPage = lazy(() => import('@/pages/Catalog/InventoryPage'));
const MediaPage = lazy(() => import('@/pages/Catalog/MediaPage'));

const HomepagePage = lazy(() => import('@/pages/Storefront/HomepagePage'));
const ShopConfigPage = lazy(() => import('@/pages/Storefront/ShopConfigPage'));
const InstagramPage = lazy(() => import('@/pages/Storefront/InstagramPage'));

const OrdersPage = lazy(() => import('@/pages/Operations/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/Operations/OrderDetailPage'));
const CustomersPage = lazy(() => import('@/pages/Operations/CustomersPage'));
const FeedbackPage = lazy(() => import('@/pages/Operations/FeedbackPage'));
const CustomerDetailPage = lazy(() =>
  import('@/pages/Operations/CustomersPage').then((m) => ({ default: m.CustomerDetailPage })),
);

const AdminUsersPage = lazy(() => import('@/pages/Administration/AdminUsersPage'));
const RolesPage = lazy(() => import('@/pages/Administration/RolesPage'));
const AuditLogsPage = lazy(() => import('@/pages/Administration/AuditLogsPage'));
const SettingsPage = lazy(() => import('@/pages/Administration/SettingsPage'));
const ChangePasswordPage = lazy(() => import('@/pages/Account/ChangePasswordPage'));

/** Wraps a screen in its suspense boundary and permission gate. */
const guarded = (element: React.ReactNode, permissions?: string[]) => (
  <Suspense fallback={<RouteLoader />}>
    {permissions ? <RequirePermission permissions={permissions}>{element}</RequirePermission> : element}
  </Suspense>
);

export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    { path: '/forgot-password', element: <Suspense fallback={<RouteLoader />}><ForgotPasswordPage /></Suspense> },
    { path: '/reset-password', element: <Suspense fallback={<RouteLoader />}><ResetPasswordPage /></Suspense> },

    {
      element: (
        <ErrorBoundary>
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        </ErrorBoundary>
      ),
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard', element: guarded(<DashboardPage />, [P.ORDERS_READ]) },

        { path: 'products', element: guarded(<ProductsPage />, [P.PRODUCTS_READ]) },
        { path: 'products/new', element: guarded(<ProductCreatePage />, [P.PRODUCTS_CREATE]) },
        { path: 'products/:id', element: guarded(<ProductEditorPage />, [P.PRODUCTS_READ]) },
        { path: 'categories', element: guarded(<CategoriesPage />, [P.CATEGORIES_READ]) },
        { path: 'collections', element: guarded(<CollectionsPage />, [P.COLLECTIONS_READ]) },
        { path: 'inventory', element: guarded(<InventoryPage />, [P.INVENTORY_READ]) },
        { path: 'media', element: guarded(<MediaPage />, [P.MEDIA_READ]) },

        { path: 'homepage', element: guarded(<HomepagePage />, [P.HOMEPAGE_READ]) },
        { path: 'shop', element: guarded(<ShopConfigPage />, [P.SHOP_READ]) },
        { path: 'instagram', element: guarded(<InstagramPage />, [P.HOMEPAGE_READ]) },

        { path: 'orders', element: guarded(<OrdersPage />, [P.ORDERS_READ]) },
        { path: 'orders/:id', element: guarded(<OrderDetailPage />, [P.ORDERS_READ]) },
        { path: 'customers', element: guarded(<CustomersPage />, [P.CUSTOMERS_READ]) },
        { path: 'customers/:id', element: guarded(<CustomerDetailPage />, [P.CUSTOMERS_READ]) },
        { path: 'feedback', element: guarded(<FeedbackPage />, [P.FEEDBACK_READ]) },

        { path: 'admin-users', element: guarded(<AdminUsersPage />, [P.ADMINS_READ]) },
        { path: 'roles', element: guarded(<RolesPage />, [P.ROLES_MANAGE]) },
        {
          path: 'audit-logs',
          element: (
            <Suspense fallback={<RouteLoader />}>
              <RequirePermission permissions={[P.AUDITLOGS_READ]} superAdminOnly>
                <AuditLogsPage />
              </RequirePermission>
            </Suspense>
          ),
        },
        { path: 'settings', element: guarded(<SettingsPage />, [P.SETTINGS_READ]) },

        // Available to every signed-in admin regardless of role.
        { path: 'account/password', element: guarded(<ChangePasswordPage />) },

        { path: '*', element: <Navigate to="/dashboard" replace /> },
      ],
    },
  ],
  // Served from /admin on the storefront domain.
  { basename: '/admin' },
);

export default router;
