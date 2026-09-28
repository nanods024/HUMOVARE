import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';

import { authApi } from '@/api/endpoints';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useSecurityStore } from '@/store/securityStore';
import { useAuthStore } from '@/store/authStore';
import { queryClient } from '@/lib/queryClient';
import { setCsrfToken } from '@/api/client';
import { Button, Modal } from '@/components/ui';

const ACTIVITY_KEY = 'hv_admin_last_activity';
const LOGOUT_KEY = 'hv_admin_signed_out';
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
/** While the operator is working, remind the server at most this often. */
const HEARTBEAT_MS = 5 * 60 * 1000;

const readShared = () => {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeShared = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private mode or blocked storage: each tab just keeps its own clock.
  }
};

const mmss = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Signs the operator out after a period without activity, with a warning
 * shortly before. Activity is shared across tabs (working in one keeps the
 * others alive), and signing out in one tab signs out all of them.
 *
 * The server enforces the same idle limit on its own; this makes the
 * experience graceful and clears the screen, rather than being the control.
 */
export function IdleLogout() {
  const navigate = useNavigate();
  const { logout } = useAdminAuth();
  const idleMinutes = useSecurityStore((state) => state.policy.idleMinutes);

  const idleMs = idleMinutes * 60 * 1000;
  const warnMs = Math.min(2 * 60 * 1000, idleMs / 3);

  const lastActivity = useRef(Math.max(Date.now(), readShared()));
  const lastHeartbeat = useRef(Date.now());
  const lastRecorded = useRef(0);
  const warningShown = useRef(false);
  const signingOut = useRef(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    await logout('SESSION_IDLE');
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const markActive = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    warningShown.current = false;
    setRemaining(null);
    writeShared(ACTIVITY_KEY, now);

    if (now - lastHeartbeat.current > HEARTBEAT_MS) {
      lastHeartbeat.current = now;
      authApi.me().catch(() => {});
    }
  }, []);

  // Record real activity (throttled), but not while the warning is up — that
  // needs a deliberate "Stay signed in".
  useEffect(() => {
    const onActivity = () => {
      if (warningShown.current) return;
      const now = Date.now();
      if (now - lastRecorded.current < 5000) return;
      lastRecorded.current = now;
      markActive();
    };
    EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
    return () => EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
  }, [markActive]);

  // Other tabs: their activity counts here, and their sign-out applies here.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVITY_KEY && event.newValue) {
        lastActivity.current = Math.max(lastActivity.current, Number(event.newValue) || 0);
        warningShown.current = false;
        setRemaining(null);
      }
      // Signed out in another tab: the server session is already gone, so
      // just clear this tab's screen and data.
      if (event.key === LOGOUT_KEY && event.newValue && !signingOut.current) {
        signingOut.current = true;
        useSecurityStore.getState().setSignedOutReason('SIGNED_OUT_ELSEWHERE');
        setCsrfToken(null);
        queryClient.clear();
        useAuthStore.getState().clearSession();
        navigate('/login', { replace: true });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [navigate]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= idleMs) {
        void signOut();
      } else if (idle >= idleMs - warnMs) {
        warningShown.current = true;
        setRemaining(idleMs - idle);
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [idleMs, warnMs, signOut]);

  return (
    <Modal
      isOpen={remaining !== null}
      onClose={markActive}
      title="Are you still there?"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => void signOut()}>Sign out now</Button>
          <Button onClick={markActive}>Stay signed in</Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning">
          <Clock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm leading-relaxed text-ink-muted">
            For security, you'll be signed out after {idleMinutes} minutes without activity.
          </p>
          <p className="mt-2 text-2xl font-semibold tabular text-ink" aria-live="polite">
            {mmss(remaining ?? 0)}
          </p>
        </div>
      </div>
    </Modal>
  );
}

export default IdleLogout;
