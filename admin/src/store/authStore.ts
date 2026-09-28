import { create } from 'zustand';
import type { AdminUser } from '@/types';
import { setCsrfToken } from '@/api/client';

interface AuthState {
  user: AdminUser | null;
  permissions: string[];
  /** `idle`/`loading` mean "we do not know yet" — guards must wait, not redirect. */
  status: 'idle' | 'loading' | 'authenticated' | 'guest';
  setSession: (user: AdminUser, permissions: string[], csrfToken?: string) => void;
  clearSession: () => void;
  setStatus: (status: AuthState['status']) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  permissions: [],
  status: 'idle',

  setSession: (user, permissions, csrfToken) => {
    if (csrfToken) setCsrfToken(csrfToken);
    set({ user, permissions, status: 'authenticated' });
  },

  clearSession: () => {
    setCsrfToken(null);
    set({ user: null, permissions: [], status: 'guest' });
  },

  setStatus: (status) => set({ status }),
}));

