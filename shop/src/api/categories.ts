import { api } from './client';
import type { Category, NavigationTree } from '@/types';

export const categoriesApi = {
  list: (params: { type?: string; nav?: boolean } = {}) => {
    const search = new URLSearchParams();
    if (params.type) search.set('type', params.type);
    if (params.nav) search.set('nav', 'true');
    return api.get<{ categories: Category[]; count: number }>(`/categories?${search.toString()}`);
  },

  navigation: () => api.get<NavigationTree>('/categories/navigation'),

  detail: (slug: string) => api.get<{ category: Category }>(`/categories/${slug}`),
};
