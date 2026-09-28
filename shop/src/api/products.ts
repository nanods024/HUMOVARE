import { api } from './client';
import type {
  Product,
  ProductCardData,
  ProductFacets,
  ProductQuery,
  Pagination,
} from '@/types';

/**
 * Turns the typed query object into URLSearchParams.
 * Arrays repeat the key (`?size=L&size=M`), which the server accepts, and
 * empty values are dropped so the URL stays clean and cache keys stay stable.
 */
export function toSearchParams(query: ProductQuery): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;

    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((item) => params.append(key, String(item)));
    } else if (typeof value === 'boolean') {
      if (value) params.set(key, 'true');
    } else {
      params.set(key, String(value));
    }
  }

  return params;
}

export interface ProductListResponse {
  products: ProductCardData[];
  pagination: Pagination;
}

export const productsApi = {
  list: (query: ProductQuery = {}) =>
    api.get<ProductListResponse>(`/products?${toSearchParams(query).toString()}`),

  detail: (slug: string) =>
    api.get<{ product: Product; related: ProductCardData[] }>(`/products/${slug}`),

  search: (q: string, limit = 8) =>
    api.get<{ query: string; products: ProductCardData[]; count: number }>(
      `/products/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),

  homeFeed: () =>
    api.get<{
      newDrops: ProductCardData[];
      bestsellers: ProductCardData[];
      featured: ProductCardData[];
    }>('/products/home-feed'),

  facets: (query: { category?: string; collection?: string } = {}) =>
    api.get<ProductFacets>(`/products/facets?${toSearchParams(query).toString()}`),

  byIds: (ids: string[]) =>
    api.get<{ products: ProductCardData[] }>(`/products/by-ids?ids=${ids.join(',')}`),
};
