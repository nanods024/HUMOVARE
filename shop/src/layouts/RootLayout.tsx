import { Outlet, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ToastViewport } from '@/components/ui/Toast';
import { RouteFallback } from '@/components/common/RouteFallback';
import { useUIStore } from '@/store/uiStore';

// Pop-overs nobody needs for the first paint. They load once the page is
// idle — or the moment one is opened — and then stay mounted, so their
// open/close transitions still run.
const MobileMenu = lazy(() => import('@/components/layout/MobileMenu'));
const SearchOverlay = lazy(() => import('@/components/layout/SearchOverlay'));
const CartDrawer = lazy(() => import('@/components/cart/CartDrawer'));
const QuickViewModal = lazy(() => import('@/components/product/QuickViewModal'));

function useIdle(timeoutMs = 1500) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setIdle(true), { timeout: timeoutMs });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setIdle(true), timeoutMs);
    return () => window.clearTimeout(id);
  }, [timeoutMs]);
  return idle;
}

export function RootLayout() {
  const location = useLocation();
  const closeAll = useUIStore((state) => state.closeAll);
  const anyOverlayOpen = useUIStore(
    (state) =>
      state.isMobileMenuOpen || state.isSearchOpen || state.isCartDrawerOpen || state.quickViewSlug !== null,
  );
  const idle = useIdle();
  // The page fade is for moving between pages. On first load (a refresh) it
  // would fade the whole site in from white.
  const firstPath = useRef(location.pathname);
  const hasNavigated = useRef(false);
  if (location.pathname !== firstPath.current) hasNavigated.current = true;
  const [overlaysMounted, setOverlaysMounted] = useState(false);
  if ((idle || anyOverlayOpen) && !overlaysMounted) setOverlaysMounted(true);

  // Navigating must reset scroll and dismiss any open overlay — otherwise the
  // cart drawer stays open over a brand-new page.
  useEffect(() => {
    closeAll();
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname, closeAll]);

  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only-focusable absolute left-4 top-4 z-[300] rounded-xl bg-ink-black px-4 py-2 text-xs font-semibold uppercase tracking-wider text-canvas"
      >
        Skip to content
      </a>

      <Header />

      {/* Header is fixed (so the homepage hero can sit under it,
          transparent, at the very top of the page) and so no longer
          reserves its own space — every route pads around it instead. */}
      <main id="main" className="flex-1 pt-20 md:pt-28">
        {/* A soft fade on every navigation. Opacity only — a transform here
            would break the fixed bars some pages pin to the screen. */}
        <div key={location.pathname} className={hasNavigated.current ? 'animate-fade-in' : undefined}>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <Footer />

      {overlaysMounted && (
        <Suspense fallback={null}>
          <MobileMenu />
          <SearchOverlay />
          <CartDrawer />
          <QuickViewModal />
        </Suspense>
      )}
      <ToastViewport />
    </div>
  );
}

export default RootLayout;
