import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Optional inline action, e.g. "View bag" after adding an item. */
  action?: { label: string; to: string };
  /** Set while it animates out, just before it is removed. */
  leaving?: boolean;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const DURATION = 3600;
const MAX_VISIBLE = 3;
const EXIT_MS = 200;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    set((state) => ({
      // Cap the stack so a burst of actions cannot cover the whole screen.
      toasts: [...state.toasts, { ...toast, id }].slice(-MAX_VISIBLE),
    }));

    window.setTimeout(() => get().dismiss(id), DURATION);
  },

  dismiss: (id) => {
    if (!get().toasts.some((t) => t.id === id && !t.leaving)) return;
    set((state) => ({
      toasts: state.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    }));
    window.setTimeout(
      () => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
      EXIT_MS,
    );
  },
}));

/**
 * Imperative helper so non-React code (mutation callbacks) can raise a toast
 * without a hook.
 */
export const toast = {
  success: (message: string, action?: Toast['action']) =>
    useToastStore.getState().push({ message, variant: 'success', action }),
  error: (message: string) => useToastStore.getState().push({ message, variant: 'error' }),
  info: (message: string, action?: Toast['action']) =>
    useToastStore.getState().push({ message, variant: 'info', action }),
};
