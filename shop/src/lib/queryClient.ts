import { QueryClient } from '@tanstack/react-query';

/**
 * Query defaults tuned for a storefront: catalogue data changes rarely, so a
 * generous stale time avoids refetching a product grid every time the tab
 * regains focus. Cart and wishlist reads override this locally.
 *
 * Lives in its own module so App.tsx only exports components (keeps Fast
 * Refresh working).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry a client error — a 404 will stay a 404.
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: 0 },
  },
});

export default queryClient;
