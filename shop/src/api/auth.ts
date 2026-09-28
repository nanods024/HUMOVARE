import { api } from './client';
import type { User } from '@/types';

export interface AuthSession {
  user: User;
  accessToken: string;
}

export const authApi = {
  register: (payload: { name: string; email: string; password: string; phone?: string }) =>
    api.post<AuthSession>('/auth/register', payload),

  login: (payload: { email: string; password: string }) =>
    api.post<AuthSession>('/auth/login', payload),

  /** Exchanges a Google ID token for a HUMOVARE session. */
  google: (credential: string) =>
    api.post<AuthSession & { created: boolean }>('/auth/google', { credential }),

  /** Sign-in providers the shop has configured; the Google client ID is public. */
  providers: () => api.get<{ google: { clientId: string } | null }>('/auth/providers'),

  logout: () => api.post<null>('/auth/logout'),

  me: () => api.get<{ user: User }>('/auth/me'),

  forgotPassword: (email: string) =>
    api.post<{ sent: boolean }>('/auth/forgot-password', { email }),

  resetPassword: (payload: { token: string; password: string }) =>
    api.post<null>('/auth/reset-password', payload),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    api.post<AuthSession>('/auth/change-password', payload),
};
