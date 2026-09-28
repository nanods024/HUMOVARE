import { api } from './client';
import type { Cart } from '@/types';

export const cartApi = {
  get: () => api.get<{ cart: Cart }>('/cart'),

  addItem: (payload: { productId: string; variantId: string; quantity?: number }) =>
    api.post<{ cart: Cart }>('/cart/items', payload),

  updateItem: (itemId: string, quantity: number) =>
    api.put<{ cart: Cart }>(`/cart/items/${itemId}`, { quantity }),

  removeItem: (itemId: string) => api.delete<{ cart: Cart }>(`/cart/items/${itemId}`),

  clear: () => api.delete<{ cart: Cart }>('/cart'),

  /** Called once after sign-in with whatever the guest had in localStorage. */
  merge: (items: { productId: string; variantId: string; quantity: number }[]) =>
    api.post<{ cart: Cart }>('/cart/merge', { items }),
};
