import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Playing its exit animation; removed a moment later. */
  leaving?: boolean;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

/** How long a toast stays up. The viewport's countdown bar reads this too. */
export const TOAST_DURATION = 4000;
const EXIT_MS = 160;
const MAX_VISIBLE = 4;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_VISIBLE) }));
    window.setTimeout(() => get().dismiss(id), TOAST_DURATION);
  },

  dismiss: (id) => {
    const target = get().toasts.find((t) => t.id === id);
    if (!target || target.leaving) return;
    // Let it animate out, then drop it.
    set((state) => ({ toasts: state.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
    window.setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), EXIT_MS);
  },
}));

/** Imperative helper so mutation callbacks can raise a toast without a hook. */
export const toast = {
  success: (message: string) => useToastStore.getState().push({ message, variant: 'success' }),
  error: (message: string) => useToastStore.getState().push({ message, variant: 'error' }),
  info: (message: string) => useToastStore.getState().push({ message, variant: 'info' }),
};
