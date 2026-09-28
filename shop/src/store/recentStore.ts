import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/constants';

const MAX_RECENT_PRODUCTS = 12;
const MAX_RECENT_SEARCHES = 6;

interface RecentState {
  productIds: string[];
  searches: string[];
  recordProduct: (id: string) => void;
  recordSearch: (term: string) => void;
  clearSearches: () => void;
}

/** Most-recent-first, de-duplicated, capped. */
const prepend = (list: string[], value: string, max: number) =>
  [value, ...list.filter((item) => item !== value)].slice(0, max);

export const useRecentStore = create<RecentState>()(
  persist(
    (set) => ({
      productIds: [],
      searches: [],

      recordProduct: (id) =>
        set((state) => ({ productIds: prepend(state.productIds, id, MAX_RECENT_PRODUCTS) })),

      recordSearch: (term) =>
        set((state) => {
          const clean = term.trim();
          if (clean.length < 2) return state;
          return { searches: prepend(state.searches, clean, MAX_RECENT_SEARCHES) };
        }),

      clearSearches: () => set({ searches: [] }),
    }),
    {
      name: STORAGE_KEYS.recentlyViewed,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
