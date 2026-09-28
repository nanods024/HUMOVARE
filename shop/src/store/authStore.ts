import { create } from 'zustand';
import type { User } from '@/types';
import { setAccessToken } from '@/api/client';

interface AuthState {
  user: User | null;
  /** Null until the first refresh attempt settles, so guards can wait. */
  status: 'idle' | 'loading' | 'authenticated' | 'guest';
  setSession: (user: User, accessToken: string) => void;
  setUser: (user: User) => void;
  clearSession: () => void;
  setStatus: (status: AuthState['status']) => void;
}

/**
 * Session state only. The access token itself lives in the axios module (in
 * memory), not here — keeping it out of any store makes it impossible to
 * accidentally persist it to storage.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',

  setSession: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user, status: 'authenticated' });
  },

  setUser: (user) => set({ user }),

  clearSession: () => {
    setAccessToken(null);
    set({ user: null, status: 'guest' });
  },

  setStatus: (status) => set({ status }),
}));

