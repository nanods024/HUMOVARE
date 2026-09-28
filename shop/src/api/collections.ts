import { api } from './client';
import type { CloudinaryImage, ProductCardData } from '@/types';

/**
 * Curated collections.
 *
 * Distinct from the category routes (/t-shirts, /sale): a collection is a
 * merchandising decision made in the admin, and the order of its products is
 * chosen rather than derived. Only published collections are returned.
 */
export interface CollectionSummary {
  _id: string;
  name: string;
  slug: string;
  description: string;
  image: CloudinaryImage | null;
  productCount?: number;
  seo?: { title: string; description: string };
}

export interface CollectionDetail extends CollectionSummary {
  products: ProductCardData[];
}

export const collectionsApi = {
  list: () => api.get<{ collections: CollectionSummary[] }>('/collections'),
  detail: (slug: string) => api.get<{ collection: CollectionDetail }>(`/collections/${slug}`),
};

export default collectionsApi;
