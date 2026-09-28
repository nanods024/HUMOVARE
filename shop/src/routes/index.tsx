import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { COLLECTION_ROUTES } from '@/constants';
import HomePage from '@/pages/Home/HomePage';

/**
 * Route map.
 *
 * Home is imported eagerly because it is the most common entry point and
 * should not wait on a second network round trip. Everything else is code
 * split, so the initial bundle stays small.
 */
const AccountLayout = lazy(() => import('@/layouts/AccountLayout'));
const CheckoutLayout = lazy(() => import('@/layouts/CheckoutLayout'));

const ShopPage = lazy(() => import('@/pages/Shop/ShopPage'));
const CollectionPage = lazy(() => import('@/pages/Shop/CollectionPage'));
const CategoryRoute = lazy(() =>
  import('@/pages/Shop/CollectionPage').then((m) => ({ default: m.CategoryRoute })),
);
const CuratedCollectionPage = lazy(() => import('@/pages/Shop/CuratedCollectionPage'));
const SearchPage = lazy(() => import('@/pages/Shop/SearchPage'));
const ProductPage = lazy(() => import('@/pages/Product/ProductPage'));
const CartPage = lazy(() => import('@/pages/Cart/CartPage'));
const WishlistPage = lazy(() => import('@/pages/Wishlist/WishlistPage'));
const CheckoutPage = lazy(() => import('@/pages/Checkout/CheckoutPage'));
const OrderSuccessPage = lazy(() => import('@/pages/Checkout/OrderSuccessPage'));
const PaymentStatusPage = lazy(() => import('@/pages/Checkout/PaymentStatusPage'));

const LoginPage = lazy(() => import('@/pages/Auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/Auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/Auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/Auth/ResetPasswordPage'));

const ProfilePage = lazy(() => import('@/pages/Account/ProfilePage'));
const OrdersPage = lazy(() => import('@/pages/Account/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/Account/OrderDetailPage'));
const AddressesPage = lazy(() => import('@/pages/Account/AddressesPage'));

const AboutPage = lazy(() => import('@/pages/Content/AboutPage'));
const ContactPage = lazy(() => import('@/pages/Content/ContactPage'));
const FaqPage = lazy(() => import('@/pages/Content/FaqPage'));
const PolicyPage = lazy(() => import('@/pages/Content/PolicyPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFound/NotFoundPage'));

/** Slugs that render as a collection page. */
const COLLECTION_SLUGS = Object.keys(COLLECTION_ROUTES);

export const router = createBrowserRouter([
  {
    element: (
      <ErrorBoundary>
        <RootLayout />
      </ErrorBoundary>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/shop', element: <ShopPage /> },

      // Each collection gets its own clean, indexable URL (/men, /t-shirts…).
      ...COLLECTION_SLUGS.map((slug) => ({
        path: `/${slug}`,
        element: <CollectionPage slug={slug} />,
      })),

      // Curated collections built in the admin, kept under their own prefix so
      // they can never collide with a category slug.
      { path: '/collections/:slug', element: <CuratedCollectionPage /> },

      { path: '/search', element: <SearchPage /> },
      { path: '/product/:slug', element: <ProductPage /> },
      { path: '/cart', element: <CartPage /> },
      { path: '/wishlist', element: <WishlistPage /> },

      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },

      {
        path: '/account',
        element: (
          <ProtectedRoute>
            <AccountLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <ProfilePage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:id', element: <OrderDetailPage /> },
          { path: 'addresses', element: <AddressesPage /> },
        ],
      },

      // Legacy aliases kept working rather than 404ing. /men and /women date
      // from before the range was menswear-only.
      { path: '/men', element: <Navigate to="/shop" replace /> },
      { path: '/women', element: <Navigate to="/shop" replace /> },
      { path: '/orders', element: <Navigate to="/account/orders" replace /> },
      { path: '/order/:id', element: <Navigate to="/account/orders" replace /> },

      { path: '/about', element: <AboutPage /> },
      { path: '/contact', element: <ContactPage /> },
      { path: '/faq', element: <FaqPage /> },
      { path: '/shipping', element: <PolicyPage policy="shipping" /> },
      { path: '/returns', element: <PolicyPage policy="returns" /> },
      { path: '/privacy', element: <PolicyPage policy="privacy" /> },
      { path: '/terms', element: <PolicyPage policy="terms" /> },

      // Any category created in the admin gets a working URL immediately,
      // without a code change here. Static routes always win over this one
      // (React Router ranks them higher regardless of order), so it only
      // catches slugs nothing more specific claimed; CollectionPage 404s
      // cleanly if the slug is not a real category.
      { path: '/:slug', element: <CategoryRoute /> },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <CheckoutLayout />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
    children: [
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/order-success/:id', element: <OrderSuccessPage /> },
      // PhonePe returns the shopper here. One page for every outcome: it
      // shows whatever the server has verified.
      { path: '/payment/status', element: <PaymentStatusPage /> },
      { path: '/payment/success', element: <PaymentStatusPage /> },
      { path: '/payment/failure', element: <PaymentStatusPage /> },
    ],
  },
]);

export default router;
