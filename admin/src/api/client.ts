import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

/**
 * Admin API client.
 *
 * Authentication rides entirely on HTTP-only cookies — no token is ever kept
 * in JavaScript, so an XSS on this page cannot steal a session. The only
 * thing the client holds is the CSRF token, which is designed to be readable
 * and is echoed back in a header so the server can prove the request came
 * from a page that could read it.
 */
export const http = axios.create({
  baseURL: `${BASE_URL}/admin`,
  withCredentials: true,
  timeout: 25_000,
  headers: { 'Content-Type': 'application/json' },
});

let csrfToken: string | null = null;
let onUnauthorised: ((reason?: string) => void) | null = null;
let onReauthRequired: (() => Promise<boolean>) | null = null;
let onBlocked: ((until: number, scope: 'panel' | 'network') => void) | null = null;
let onPasswordChangeRequired: (() => void) | null = null;

export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};
/** Called when the session cannot be kept — with the server's reason code. */
export const setUnauthorisedHandler = (handler: (reason?: string) => void) => {
  onUnauthorised = handler;
};
/** Asks the operator to re-enter their password; resolves true once confirmed. */
export const setReauthHandler = (handler: () => Promise<boolean>) => {
  onReauthRequired = handler;
};

/** Called when the server refuses everything until the admin sets their own password. */
export const setPasswordChangeHandler = (handler: () => void) => {
  onPasswordChangeRequired = handler;
};

/** Called when the server says this network is blocked from the admin panel. */
export const setBlockedHandler = (handler: (until: number, scope: 'panel' | 'network') => void) => {
  onBlocked = handler;
};

const LOCKOUT_CODES = ['IP_BLOCKED', 'PANEL_LOCKED'];

/** Whether a lockout covers the whole panel or only this network. */
export function blockScopeFrom(error: unknown): 'panel' | 'network' {
  return getErrorCode(error) === 'PANEL_LOCKED' ? 'panel' : 'network';
}

/** Reads the lockout's end time from a 423 IP_BLOCKED / PANEL_LOCKED response. */
export function blockedUntilFrom(error: unknown): number | null {
  if (!LOCKOUT_CODES.includes(getErrorCode(error) ?? '')) return null;
  const details = getErrorDetails<{ blockedUntil?: string; retryAfterSeconds?: number }>(error);
  if (details?.blockedUntil) return new Date(details.blockedUntil).getTime();
  return Date.now() + (details?.retryAfterSeconds ?? 30 * 60) * 1000;
}

/** Why the last refresh failed (SESSION_IDLE, SESSION_EXPIRED…), if the server said. */
let lastRefreshFailure: string | undefined;

/** Falls back to the cookie so a page reload does not lose the token. */
function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)hv_admin_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const isMutation = !['get', 'head', 'options'].includes((config.method ?? 'get').toLowerCase());

  if (isMutation) {
    const token = csrfToken ?? readCsrfCookie();
    if (token) config.headers['X-CSRF-Token'] = token;
  }

  return config;
});

/**
 * Single-flight refresh: several requests failing at once must not each fire
 * their own refresh, because the endpoint rotates the token and the losers
 * would invalidate the winner.
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  try {
    const { data } = await axios.post<ApiEnvelope<{ csrfToken: string }>>(
      `${BASE_URL}/admin/auth/refresh`,
      {},
      { withCredentials: true },
    );
    setCsrfToken(data?.data?.csrfToken ?? null);
    lastRefreshFailure = undefined;
    return true;
  } catch (error) {
    setCsrfToken(null);
    lastRefreshFailure = getErrorCode(error);
    const blockedUntil = blockedUntilFrom(error);
    if (blockedUntil) onBlocked?.(blockedUntil, blockScopeFrom(error));
    return false;
  }
}


type RetriableConfig = AxiosRequestConfig & { _retried?: boolean; _reauthed?: boolean };

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string; error?: unknown }>) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';

    const code = getErrorCode(error);

    // This network is shut out of the admin panel: show the blocked screen.
    const blockedUntil = blockedUntilFrom(error);
    if (blockedUntil) {
      onBlocked?.(blockedUntil, blockScopeFrom(error));
      return Promise.reject(error);
    }
    const isAuthRoute = url.includes('/auth/refresh') || url.includes('/auth/login')
      || url.includes('/auth/forgot-password') || url.includes('/auth/reset-password');

    if (status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;

      refreshPromise = refreshPromise ?? refreshSession();
      const ok = await refreshPromise;
      refreshPromise = null;

      if (ok) return http.request(original);
      onUnauthorised?.(lastRefreshFailure ?? code);
    }

    // A sensitive action needs the password again: ask, then retry once.
    if (status === 403 && code === 'REAUTH_REQUIRED' && original && !original._reauthed && onReauthRequired) {
      original._reauthed = true;
      const confirmed = await onReauthRequired();
      if (confirmed) return http.request(original);
    }

    // Someone reset this admin's password mid-session: only the change-password
    // screen works until they pick their own.
    if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
      onPasswordChangeRequired?.();
    }

    // Too many wrong passwords while signed in: the server has ended the session.
    if (status === 423 && code === 'ACCOUNT_LOCKED' && !isAuthRoute) {
      onUnauthorised?.('ACCOUNT_LOCKED');
    }

    return Promise.reject(error);
  },
);

/** Pulls the human-readable message out of the shared error envelope. */
const FIELD_LABELS: Record<string, string> = {
  colors: 'Colour',
  variants: 'Stock row',
  images: 'Image',
};

/** "colors.1.name" → "Colour 2 (name)" — a field path a person can read. */
function readableField(field: string): string {
  const [head, index, ...rest] = field.split('.');
  const label = FIELD_LABELS[head];
  if (label && /^\d+$/.test(index ?? '')) {
    return `${label} ${Number(index) + 1}${rest.length ? ` (${rest.join(' ')})` : ''}`;
  }
  return field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\./g, ' ');
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | { message?: string; error?: { field: string; message: string }[] }
      | undefined;

    if (Array.isArray(payload?.error) && payload.error.length) {
      const { field, message } = payload.error[0];
      return field ? `${readableField(field)}: ${message}` : message;
    }
    if (payload?.message) return payload.message;
    if (error.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
    if (!error.response) return 'Cannot reach the API. Check your connection.';
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** The server's machine-readable reason, e.g. ACCOUNT_LOCKED or REAUTH_REQUIRED. */
export function getErrorCode(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  return (error.response?.data as { code?: string } | undefined)?.code;
}

/** Safe extra detail the server attached (time left on a lock, attempts left…). */
export function getErrorDetails<T = Record<string, unknown>>(error: unknown): T | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  return (error.response?.data as { details?: T } | undefined)?.details;
}

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<ApiEnvelope<T>>(config);
  return response.data.data;
}

export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) => request<T>({ ...config, method: 'GET', url }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data }),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PUT', url, data }),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'DELETE', url }),
};

/** Builds a query string, dropping empty values so cache keys stay stable. */
export function toQuery(params: Record<string, unknown> = {}): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') search.set(key, value ? 'true' : 'false');
    else search.set(key, String(value));
  }

  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export { refreshSession };
