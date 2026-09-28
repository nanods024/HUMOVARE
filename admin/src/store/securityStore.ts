import { create } from 'zustand';
import type { SecurityPolicy } from '@/api/endpoints';

/** Server defaults, used until the first session response arrives. */
export const DEFAULT_POLICY: SecurityPolicy = {
  idleMinutes: 30,
  reauthMinutes: 10,
  maxSessionHours: 12,
  maxLoginAttempts: 3,
  lockMinutes: 30,
  ipMaxAttempts: 3,
  ipBlockMinutes: 30,
  lockoutScope: 'panel',
};

/**
 * Last known network block, kept only so a reload can show the blocked screen
 * instantly instead of flashing the login form. The server is the authority:
 * it refuses every admin request from a blocked network regardless of this.
 */
const BLOCK_KEY = 'hv_admin_blocked_until';
const readStoredBlock = (): number | null => {
  try {
    const value = Number(localStorage.getItem(BLOCK_KEY));
    return value > Date.now() ? value : null;
  } catch {
    return null;
  }
};
const storeBlock = (until: number | null) => {
  try {
    if (until) localStorage.setItem(BLOCK_KEY, String(until));
    else localStorage.removeItem(BLOCK_KEY);
  } catch {
    // Storage blocked: the server check on load still catches it.
  }
};

interface SecurityState {
  policy: SecurityPolicy;
  /** When the lockout covering this browser ends (ms), or null if none. */
  blockedUntil: number | null;
  /** Whether that lockout covers the whole panel or only this network. */
  blockedScope: 'panel' | 'network';
  /** `checking` until the server has confirmed whether this network is blocked. */
  accessCheck: 'checking' | 'clear' | 'blocked';
  /** Why the operator was last signed out — shown once on the login page. */
  signedOutReason: string | null;
  /** Pending "confirm your password" request, resolved by the dialog. */
  reauthResolver: ((confirmed: boolean) => void) | null;

  setPolicy: (policy?: SecurityPolicy) => void;
  setBlockedUntil: (until: number | null, scope?: 'panel' | 'network') => void;
  setAccessCheck: (state: SecurityState['accessCheck']) => void;
  setSignedOutReason: (reason: string | null) => void;
  requestReauth: () => Promise<boolean>;
  resolveReauth: (confirmed: boolean) => void;
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  policy: DEFAULT_POLICY,
  blockedUntil: readStoredBlock(),
  blockedScope: 'panel',
  accessCheck: readStoredBlock() ? 'blocked' : 'checking',
  signedOutReason: null,
  reauthResolver: null,

  setPolicy: (policy) => {
    if (policy) set({ policy: { ...DEFAULT_POLICY, ...policy } });
  },

  setSignedOutReason: (reason) => set({ signedOutReason: reason }),

  setBlockedUntil: (until, scope) => {
    storeBlock(until);
    set((state) => ({
      blockedUntil: until,
      blockedScope: scope ?? state.blockedScope,
      accessCheck: until ? 'blocked' : 'clear',
    }));
  },

  setAccessCheck: (accessCheck) => set({ accessCheck }),

  requestReauth: () => {
    // Several requests may need it at once; they all wait on the same prompt.
    const pending = get().reauthResolver;
    if (pending) {
      return new Promise<boolean>((resolve) => {
        const previous = pending;
        set({ reauthResolver: (ok) => { previous(ok); resolve(ok); } });
      });
    }
    return new Promise<boolean>((resolve) => set({ reauthResolver: resolve }));
  },

  resolveReauth: (confirmed) => {
    const resolver = get().reauthResolver;
    set({ reauthResolver: null });
    resolver?.(confirmed);
  },
}));

/** What the login page says for each reason the server gives. */
export const SIGNED_OUT_MESSAGES: Record<string, string> = {
  SESSION_IDLE: 'You were signed out because the portal was left inactive. Sign in again to continue.',
  SESSION_EXPIRED: 'Your session reached its time limit. Sign in again to continue.',
  SESSION_REVOKED: 'Your session ended — it was signed out from another place or your access changed.',
  ACCOUNT_LOCKED: 'Too many wrong passwords. Your account is locked for a while; try again later or reset your password.',
  PASSWORD_RESET: 'Your password was changed. Sign in with the new one.',
  SIGNED_OUT_ELSEWHERE: 'You signed out in another tab.',
};
