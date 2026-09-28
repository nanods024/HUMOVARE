import { create } from 'zustand';

/**
 * Transient interface state — what is open right now. Nothing here is
 * persisted or server-backed; product data lives in React Query instead.
 */
interface UIState {
  isMobileMenuOpen: boolean;
  isSearchOpen: boolean;
  isCartDrawerOpen: boolean;
  isMobileFilterOpen: boolean;
  quickViewSlug: string | null;

  openMobileMenu: () => void;
  closeMobileMenu: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  openCartDrawer: () => void;
  closeCartDrawer: () => void;
  openMobileFilter: () => void;
  closeMobileFilter: () => void;
  openQuickView: (slug: string) => void;
  closeQuickView: () => void;
  closeAll: () => void;
}

const allClosed = {
  isMobileMenuOpen: false,
  isSearchOpen: false,
  isCartDrawerOpen: false,
  isMobileFilterOpen: false,
  quickViewSlug: null,
};

export const useUIStore = create<UIState>((set) => ({
  ...allClosed,

  // Only one overlay at a time — opening one closes the rest.
  openMobileMenu: () => set({ ...allClosed, isMobileMenuOpen: true }),
  closeMobileMenu: () => set({ isMobileMenuOpen: false }),
  openSearch: () => set({ ...allClosed, isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  openCartDrawer: () => set({ ...allClosed, isCartDrawerOpen: true }),
  closeCartDrawer: () => set({ isCartDrawerOpen: false }),
  openMobileFilter: () => set({ ...allClosed, isMobileFilterOpen: true }),
  closeMobileFilter: () => set({ isMobileFilterOpen: false }),
  openQuickView: (slug) => set({ ...allClosed, quickViewSlug: slug }),
  closeQuickView: () => set({ quickViewSlug: null }),
  closeAll: () => set(allClosed),
}));

