import { Suspense } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { ToastViewport } from '@/components/ui/Toast';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { RouteFallback } from '@/components/common/RouteFallback';

/**
 * Distraction-free checkout shell: no primary navigation, no search, no cart
 * drawer — nothing that invites the shopper back out of the funnel.
 */
export function CheckoutLayout() {
  const { brand: BRAND } = useStoreSettings();
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <header className="border-b border-line">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo className="h-7" />
          <p className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Secure checkout
          </p>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-line py-6">
        <div className="container-page flex flex-col gap-2 text-xs text-ink-muted md:flex-row md:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND.name}
          </p>
          <nav aria-label="Checkout footer" className="flex gap-4">
            <Link to="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link to="/returns" className="hover:text-ink">
              Returns
            </Link>
          </nav>
        </div>
      </footer>

      <ToastViewport />
    </div>
  );
}

export default CheckoutLayout;
