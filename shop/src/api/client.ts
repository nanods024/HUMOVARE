import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import type { ApiEnvelope } from '@/types';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const http = axios.create({
  baseURL: BASE_URL,
  // Required so the HTTP-only refresh cookie travels with /auth requests.
  withCredentials: true,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * The access token is short-lived and kept in memory only. Persisting it to
 * localStorage would expose it to any XSS on the page; the refresh cookie is
 * HTTP-only and restores the session after a reload instead.
 */
let accessToken: string | null = null;
let onUnauthorised: (() => void) | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const setUnauthorisedHandler = (handler: () => void) => {
  onUnauthorised = handler;
};

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/**
 * Single-flight refresh.
 *
 * When several requests 401 at once we must not fire several refreshes — the
 * first would rotate the token and the rest would fail with a stale one. The
 * first 401 starts the refresh; everything else waits on the same promise.
 */
let refreshPromise: Promise<string | null> | null = null;

async function refreshSession(): Promise<string | null> {
  try {
    const { data } = await axios.post<ApiEnvelope<{ accessToken: string }>>(
      `${BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    const token = data?.data?.accessToken ?? null;
    setAccessToken(token);
    return token;
  } catch {
    setAccessToken(null);
    return null;
  }
}

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string; error?: unknown }>) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';

    // Never try to refresh the refresh call itself, or a failed sign-in.
    const isAuthRoute = url.includes('/auth/refresh') || url.includes('/auth/login');

    if (status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;

      refreshPromise = refreshPromise ?? refreshSession();
      const token = await refreshPromise;
      refreshPromise = null;

      if (token) {
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return http.request(original);
      }

      onUnauthorised?.();
    }

    return Promise.reject(error);
  },
);

/** Pulls the human-readable message out of the shared error envelope. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | { message?: string; error?: { field: string; message: string }[] }
      | undefined;

    // Validation errors carry per-field detail; surface the first one.
    if (Array.isArray(payload?.error) && payload.error.length) {
      return payload.error[0].message;
    }
    if (payload?.message) return payload.message;
    if (error.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
    if (!error.response) return 'Cannot reach HUMOVARE right now. Check your connection.';
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Unwraps `{ success, message, data }` so callers work with `data` directly. */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<ApiEnvelope<T>>(config);
  return response.data.data;
}

export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) => request<T>({ ...config, method: 'GET', url }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data }),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PUT', url, data }),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PATCH', url, data }),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'DELETE', url }),
};

export { refreshSession };
