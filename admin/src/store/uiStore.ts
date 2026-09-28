import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UIState {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

/**
 * Sidebar state is a per-operator preference, so it persists across sessions.
 * Nothing sensitive is stored here.
 */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    }),
    { name: 'humovare.admin.ui', storage: createJSONStorage(() => localStorage) },
  ),
);
