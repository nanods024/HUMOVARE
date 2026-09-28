import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, cartApi, refreshSession, getErrorMessage, setUnauthorisedHandler } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { useGuestCartStore } from '@/store/guestCartStore';
import { toast } from '@/store/toastStore';
import type { AuthSession } from '@/api/auth';

/**
 * Restores the session on first load.
 *
 * The access token only lives in memory, so after a refresh we ask the server
 * to mint a new one from the HTTP-only cookie. Until that settles the auth
 * status is `loading`, which stops protected routes from bouncing a
 * signed-in shopper to the login page.
 */
export function useAuthBootstrap() {
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setStatus = useAuthStore((state) => state.setStatus);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    setStatus('loading');

    (async () => {
      const token = await refreshSession();
      if (!token) {
        clearSession();
        return;
      }

      try {
        const { user } = await authApi.me();
        setSession(user, token);
      } catch {
        clearSession();
      }
    })();
  }, [setSession, clearSession, setStatus]);

  // A refresh failure anywhere in the app drops us back to guest state.
  useEffect(() => {
    setUnauthorisedHandler(() => clearSession());
  }, [clearSession]);
}

export function useAuth() {
  const queryClient = useQueryClient();
  // Selectors, not the whole store: the always-mounted mobile menu uses this
  // hook and must not re-render on unrelated store changes.
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const clearGuestCart = useGuestCartStore((state) => state.clear);

  /**
   * After sign-in, hand the guest bag to the server and drop the local copy.
   * The merge is best-effort: a failure must not block the shopper from
   * getting into their account.
   */
  const mergeGuestCart = useCallback(async () => {
    // Read at call time, so the hook need not re-render on every bag change.
    const guestItems = useGuestCartStore.getState().items;
    if (!guestItems.length) return;

    try {
      await cartApi.merge(
        guestItems.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      );
      clearGuestCart();
    } catch {
      toast.info('Some items in your bag could not be synced');
    } finally {
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
    }
  }, [clearGuestCart, queryClient]);

  const finishSignIn = useCallback(
    async (session: AuthSession) => {
      setSession(session.user, session.accessToken);
      await mergeGuestCart();
      queryClient.invalidateQueries({ queryKey: queryKeys.wishlist.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.wishlist.ids });
    },
    [setSession, mergeGuestCart, queryClient],
  );

  const login = useCallback(
    async (payload: { email: string; password: string }) => {
      const session = await authApi.login(payload);
      await finishSignIn(session);
      return session;
    },
    [finishSignIn],
  );

  const register = useCallback(
    async (payload: { name: string; email: string; password: string; phone?: string }) => {
      const session = await authApi.register(payload);
      await finishSignIn(session);
      return session;
    },
    [finishSignIn],
  );

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      const session = await authApi.google(credential);
      await finishSignIn(session);
      return session;
    },
    [finishSignIn],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // The local session is cleared regardless — a failed call must never
      // leave someone apparently signed in on a shared device.
      toast.error(getErrorMessage(error, 'Signed out locally'));
    } finally {
      clearSession();
      queryClient.clear();
      toast.info('Signed out');
    }
  }, [clearSession, queryClient]);

  return {
    user,
    status,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading' || status === 'idle',
    login,
    loginWithGoogle,
    register,
    logout,
  };
}
