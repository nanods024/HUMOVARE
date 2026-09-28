/** Centralised React Query keys so invalidation can target a whole branch. */
export const queryKeys = {
  dashboard: (params: Record<string, unknown>) => ['dashboard', params] as const,

  products: {
    all: ['products'] as const,
    list: (params: Record<string, unknown>) => ['products', 'list', params] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: (params: Record<string, unknown>) => ['categories', 'list', params] as const,
  },
  collections: {
    all: ['collections'] as const,
    list: (params: Record<string, unknown>) => ['collections', 'list', params] as const,
    detail: (id: string) => ['collections', 'detail', id] as const,
  },
  inventory: {
    all: ['inventory'] as const,
    list: (params: Record<string, unknown>) => ['inventory', 'list', params] as const,
    history: (id: string) => ['inventory', 'history', id] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (params: Record<string, unknown>) => ['orders', 'list', params] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
    emails: (id: string) => ['orders', 'emails', id] as const,
    payments: (id: string) => ['orders', 'payments', id] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: (params: Record<string, unknown>) => ['customers', 'list', params] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
  },
  homepage: ['homepage'] as const,
  shop: ['shop'] as const,
  feedback: {
    all: ['feedback'] as const,
    list: (query: Record<string, unknown>) => ['feedback', 'list', query] as const,
  },
  media: {
    all: ['media'] as const,
    list: (params: Record<string, unknown>) => ['media', 'list', params] as const,
  },
  adminUsers: {
    all: ['admin-users'] as const,
    list: (params: Record<string, unknown>) => ['admin-users', 'list', params] as const,
  },
  roles: ['roles'] as const,
  auditLogs: (params: Record<string, unknown>) => ['audit-logs', params] as const,
  settings: ['settings'] as const,
};
