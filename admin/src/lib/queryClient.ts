import { QueryClient } from '@tanstack/react-query';

/**
 * Admin data changes while you watch it, so the defaults are tighter than the
 * storefront's: short stale time, and a refetch when the tab regains focus.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Never retry a client error — a 403 will stay a 403.
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: 0 },
  },
});

export default queryClient;
