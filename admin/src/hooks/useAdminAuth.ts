import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/endpoints';
import {
  refreshSession,
  setUnauthorisedHandler,
  setReauthHandler,
  setPasswordChangeHandler,
  setCsrfToken,
  getErrorMessage,
} from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useSecurityStore } from '@/store/securityStore';
import { toast } from '@/store/toastStore';
import { queryClient as sharedQueryClient } from '@/lib/queryClient';

let authBootstrapPromise: Promise<void> | null = null;

/**
 * Restores the admin session on load.
 *
 * Nothing about the session lives in JavaScript, so on a reload we ask the
 * server to mint a new access token from the refresh cookie. Until that
 * settles the status is `loading`, which stops the route guard bouncing a
 * signed-in operator to the login page on every refresh.
 */
export function useAdminAuthBootstrap() {
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setStatus = useAuthStore((state) => state.setStatus);
  const setPolicy = useSecurityStore((state) => state.setPolicy);
  const setSignedOutReason = useSecurityStore((state) => state.setSignedOutReason);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    setStatus('loading');

    authBootstrapPromise = (async () => {
      const ok = await refreshSession();
      if (!ok) {
        clearSession();
        return;
      }

      try {
        const { user, permissions, security } = await authApi.me();
        setPolicy(security);
        setSession(user, permissions);
      } catch {
        clearSession();
      }
    })();
  }, [setSession, clearSession, setStatus, setPolicy]);

  // Losing the session anywhere in the app drops back to the login screen,
  // with any cached admin data wiped so nothing lingers on a shared machine.
  useEffect(() => {
    setUnauthorisedHandler((reason) => {
      if (reason) setSignedOutReason(reason);
      setCsrfToken(null);
      sharedQueryClient.clear();
      clearSession();
    });
    // Sensitive actions ask for the password again through the global dialog.
    setReauthHandler(() => useSecurityStore.getState().requestReauth());
    setPasswordChangeHandler(() => {
      const current = useAuthStore.getState().user;
      if (current && !current.mustChangePassword) {
        useAuthStore.setState({ user: { ...current, mustChangePassword: true } });
      }
    });
  }, [clearSession, setSignedOutReason]);
}

export function useAdminAuth() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setPolicy = useSecurityStore((state) => state.setPolicy);
  const setSignedOutReason = useSecurityStore((state) => state.setSignedOutReason);

  const login = useCallback(
    async (payload: { email: string; password: string }) => {
      await authBootstrapPromise;
      const session = await authApi.login(payload);
      setPolicy(session.security);
      setSignedOutReason(null);
      setSession(session.user, session.permissions, session.csrfToken);
      return session;
    },
    [setSession, setPolicy, setSignedOutReason],
  );

  /** `reason` is shown on the login page (e.g. SESSION_IDLE after inactivity). */
  const logout = useCallback(async (reason?: string) => {
    try {
      await authApi.logout();
    } catch (error) {
      // The local session is cleared either way — a failed call must never
      // leave someone apparently signed in on a shared machine.
      if (!reason) toast.error(getErrorMessage(error, 'Signed out locally'));
    } finally {
      // Other open tabs sign out too.
      try {
        localStorage.setItem('hv_admin_signed_out', String(Date.now()));
      } catch {
        // Storage blocked: other tabs find out on their next request instead.
      }
      setSignedOutReason(reason ?? null);
      setCsrfToken(null);
      clearSession();
      queryClient.clear();
    }
  }, [clearSession, queryClient, setSignedOutReason]);

  return {
    user,
    isAuthenticated: status === 'authenticated',
    login,
    logout,
  };
}
