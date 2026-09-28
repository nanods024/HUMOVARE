import { api } from './client';
import type { Category, CodArea, ProductCardData } from '@/types';
import type { CollectionSummary } from './collections';

/**
 * Admin-managed storefront content.
 *
 * These endpoints return only published content, so a draft or expired
 * section is never visible to a customer.
 */

export interface Cta {
  label?: string;
  url?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'glass' | 'link';
}

export interface HomepageSectionData {
  id: string;
  type:
    | 'hero' | 'categories' | 'collections' | 'productRail' | 'brandStory' | 'styleRail'
    | 'quality' | 'community' | 'trust';
  key: string;
  name: string;
  eyebrow: string;
  title: string;
  highlight: string;
  subtitle: string;
  description: string;
  image: { url: string; publicId?: string; alt?: string } | null;
  mobileImage: { url: string; publicId?: string; alt?: string } | null;
  primaryCta: Cta | null;
  secondaryCta: Cta | null;
  link: Cta | null;
  items: Record<string, string>[];
  background: 'canvas' | 'surface' | 'dark';
  sortOrder: number;
  /** Present on productRail sections. */
  products?: ProductCardData[];
  source?: string;
  /** Present on categories sections. */
  categories?: Category[];
  /** Present on collections sections. */
  collections?: CollectionSummary[];
}

export interface PublicShopConfig {
  title: string;
  description: string;
  filters: { key: string; label: string; defaultOpen?: boolean }[];
  sortOptions: { value: string; label: string }[];
  defaultSort: string;
  pageSize: number;
  emptyTitle: string;
  emptyDescription: string;
  seo: { title: string; description: string };
}

/** Contact details and shop rules, edited in the admin under Settings. */
export interface PublicStoreSettings {
  storeName: string;
  tagline: string;
  email: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  address: { line1: string; line2: string; city: string; state: string; postalCode: string };
  shipping: { freeShippingThreshold: number; shippingFee: number; dispatchDays: number; deliveryDays: number };
  cod: { enabled: boolean; maxOrderValue: number; area?: CodArea | null };
  returns: { windowDays: number };
}

export const storefrontApi = {
  homepage: () => api.get<{ sections: HomepageSectionData[] }>('/homepage'),
  settings: () => api.get<{ settings: PublicStoreSettings }>('/settings'),
  shopConfig: () => api.get<{ config: PublicShopConfig }>('/shop-config'),
};
