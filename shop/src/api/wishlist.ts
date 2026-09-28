import { api } from './client';
import type { Wishlist } from '@/types';

export const wishlistApi = {
  get: () => api.get<{ wishlist: Wishlist }>('/wishlist'),

  ids: () => api.get<{ productIds: string[] }>('/wishlist/ids'),

  add: (productId: string) => api.post<{ wishlist: Wishlist }>(`/wishlist/${productId}`),

  remove: (productId: string) => api.delete<{ wishlist: Wishlist }>(`/wishlist/${productId}`),
};
