import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ShieldAlert, Loader2, RefreshCw } from 'lucide-react';

import { authApi } from '@/api/endpoints';
import { setBlockedHandler, blockedUntilFrom, blockScopeFrom, setCsrfToken } from '@/api/client';
import { useSecurityStore } from '@/store/securityStore';
import { useAuthStore } from '@/store/authStore';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui';

const mmss = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Asks the server whether this network may use the admin panel before
 * anything else renders — so after 3 wrong passwords, reloading the page shows
 * the blocked screen, never a login form. The server refuses every admin
 * request from a blocked network regardless; this makes that visible.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const accessCheck = useSecurityStore((state) => state.accessCheck);
  const setBlockedUntil = useSecurityStore((state) => state.setBlockedUntil);
  const setAccessCheck = useSecurityStore((state) => state.setAccessCheck);
  const setPolicy = useSecurityStore((state) => state.setPolicy);

  const check = useCallback(async () => {
    try {
      const { security } = await authApi.status();
      setPolicy(security);
      setBlockedUntil(null);
    } catch (error) {
      const until = blockedUntilFrom(error);
      // Only a confirmed block shuts the screen; if the API is unreachable the
      // app carries on and the server still enforces everything.
      if (until) setBlockedUntil(until, blockScopeFrom(error));
      else setAccessCheck('clear');
    }
  }, [setBlockedUntil, setAccessCheck, setPolicy]);

  useEffect(() => {
    // Any admin request answered with IP_BLOCKED lands here: wipe the
    // session and cached data, and switch to the blocked screen.
    setBlockedHandler((until, scope) => {
      setCsrfToken(null);
      queryClient.clear();
      useAuthStore.getState().clearSession();
      setBlockedUntil(until, scope);
    });
    void check();
  }, [check, setBlockedUntil]);

  if (accessCheck === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Checking access</span>
      </div>
    );
  }

  if (accessCheck === 'blocked') return <BlockedScreen onRecheck={check} />;

  return <>{children}</>;
}

function BlockedScreen({ onRecheck }: { onRecheck: () => Promise<void> }) {
  const blockedUntil = useSecurityStore((state) => state.blockedUntil);
  const blockedScope = useSecurityStore((state) => state.blockedScope);
  const policy = useSecurityStore((state) => state.policy);
  const panelWide = blockedScope === 'panel';
  const [now, setNow] = useState(() => Date.now());
  const [isChecking, setIsChecking] = useState(false);

  const remaining = Math.max(0, (blockedUntil ?? 0) - now);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  // When the time is up, ask the server — it decides, not this countdown.
  useEffect(() => {
    if (blockedUntil && remaining === 0 && !isChecking) {
      setIsChecking(true);
      void onRecheck().finally(() => setIsChecking(false));
    }
  }, [blockedUntil, remaining, isChecking, onRecheck]);

  const recheck = async () => {
    setIsChecking(true);
    await onRecheck();
    setIsChecking(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md animate-page-in text-center">
        <span className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-danger/10 text-danger">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {panelWide ? 'Admin panel temporarily locked' : 'Access temporarily blocked'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {panelWide
            ? `There were ${policy.ipMaxAttempts} wrong password attempts, so the admin panel is locked for everyone, on every network, for ${policy.ipBlockMinutes} minutes. Refreshing, another browser or another network will not lift it.`
            : `There were ${policy.ipMaxAttempts} wrong password attempts from this network, so the admin panel is blocked here for ${policy.ipBlockMinutes} minutes. Refreshing or opening a new browser will not lift it.`}
        </p>

        <div className="mx-auto mt-8 w-fit rounded-2xl bg-panel px-8 py-5 shadow-panel ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Try again in</p>
          <p className="mt-1 text-4xl font-semibold tabular text-ink" aria-live="polite">{mmss(remaining)}</p>
          {blockedUntil && (
            <p className="mt-1 text-xs text-ink-subtle">
              at {new Date(blockedUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        <p className="mt-8 text-xs leading-relaxed text-ink-subtle">
          {panelWide
            ? 'If this was a mistake, wait for the timer — or whoever runs the server can lift it now with "npm run security:unblock".'
            : 'If this was you, wait for the timer. A super admin signed in from another network can lift the block sooner.'}
        </p>
        {remaining === 0 && (
          <Button variant="outline" className="mt-4" onClick={recheck} isLoading={isChecking}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Check again
          </Button>
        )}
      </div>
    </main>
  );
}

export default AccessGate;
