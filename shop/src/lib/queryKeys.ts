import type { ProductQuery } from '@/types';

/**
 * Centralised React Query keys.
 *
 * Keeping them in one place means an invalidation can target a whole branch
 * (`queryKeys.products.all`) without every call site guessing the shape.
 */
export const queryKeys = {
  products: {
    all: ['products'] as const,
    list: (query: ProductQuery) => ['products', 'list', query] as const,
    detail: (slug: string) => ['products', 'detail', slug] as const,
    search: (term: string) => ['products', 'search', term] as const,
    homeFeed: ['products', 'home-feed'] as const,
    facets: (scope: string) => ['products', 'facets', scope] as const,
    byIds: (ids: string[]) => ['products', 'by-ids', ids.join(',')] as const,
  },
  categories: {
    all: ['categories'] as const,
    navigation: ['categories', 'navigation'] as const,
    detail: (slug: string) => ['categories', 'detail', slug] as const,
  },
  collections: {
    all: ['collections'] as const,
    detail: (slug: string) => ['collections', 'detail', slug] as const,
  },
  cart: ['cart'] as const,
  wishlist: {
    all: ['wishlist'] as const,
    ids: ['wishlist', 'ids'] as const,
  },
  auth: { me: ['auth', 'me'] as const, providers: ['auth', 'providers'] as const },
  user: {
    profile: ['user', 'profile'] as const,
    addresses: ['user', 'addresses'] as const,
  },
  homepage: ['homepage'] as const,
  storeSettings: ['store-settings'] as const,
  shopConfig: ['shop-config'] as const,
  orders: {
    paymentStatus: (id: string) => ['orders', 'payment-status', id] as const,
    all: ['orders'] as const,
    lists: ['orders', 'list'] as const,
    list: (params: Record<string, unknown>) => ['orders', 'list', params] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
    paymentMethods: ['orders', 'payment-methods'] as const,
  },
};
