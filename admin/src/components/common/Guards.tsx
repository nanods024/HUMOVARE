import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { usePermission } from '@/hooks/usePermission';
import { EmptyState, ButtonLink } from '@/components/ui';

/**
 * Shown while a screen's code downloads or the session is restored: a slim
 * indeterminate bar along the top of the window, plus a quiet mark in the
 * middle, so the wait reads as progress rather than a blank page.
 */
export function RouteLoader() {
  return (
    <div className="flex min-h-[50vh] animate-fade-in items-center justify-center" role="status" aria-live="polite">
      <div className="fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-primary/10" aria-hidden="true">
        <div className="h-full w-2/5 animate-route-progress rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
      </div>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-panel shadow-lift ring-1 ring-line">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
      </span>
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * Gate for every admin route.
 *
 * While the session is still being restored from the refresh cookie we render
 * a loader rather than redirecting — bouncing a signed-in operator to the
 * login page on every hard refresh would be a bug, not a guard.
 *
 * This is UX only. The server independently authorises every request.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const mustChangePassword = useAuthStore((state) => Boolean(state.user?.mustChangePassword));
  const location = useLocation();

  if (status === 'idle' || status === 'loading') return <RouteLoader />;

  if (status !== 'authenticated') {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  // A password someone else set only opens the change-password screen; the
  // server refuses every other request until it is replaced.
  if (mustChangePassword && location.pathname !== '/account/password') {
    return <Navigate to="/account/password" replace />;
  }

  return <>{children}</>;
}

/** Renders a clear "not allowed" screen instead of a broken page. */
export function RequirePermission({
  permissions,
  superAdminOnly = false,
  children,
}: {
  permissions: string[];
  superAdminOnly?: boolean;
  children: React.ReactNode;
}) {
  const { canAny, isSuperAdmin } = usePermission();

  if (!canAny(...permissions) || (superAdminOnly && !isSuperAdmin)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You do not have access to this area"
        description="Ask a super admin if you need this permission added to your role."
        action={<ButtonLink to="/dashboard" variant="outline">Back to dashboard</ButtonLink>}
      />
    );
  }

  return <>{children}</>;
}
