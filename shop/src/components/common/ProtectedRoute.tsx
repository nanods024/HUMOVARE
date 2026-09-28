import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { RouteFallback } from './RouteFallback';

/**
 * Gate for account and checkout routes.
 *
 * While the session is still being restored from the refresh cookie we render
 * a loader rather than redirecting — bouncing a signed-in shopper to /login on
 * every hard refresh would be a bug, not a guard.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'idle' || status === 'loading') return <RouteFallback />;

  if (status !== 'authenticated') {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
