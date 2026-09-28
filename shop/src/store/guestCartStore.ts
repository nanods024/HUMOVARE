import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GuestCartLine } from '@/types';
import { STORAGE_KEYS, MAX_QUANTITY_PER_LINE } from '@/constants';

interface GuestCartState {
  items: GuestCartLine[];
  addItem: (line: GuestCartLine) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clear: () => void;
}

const sameLine = (line: GuestCartLine, variantId: string) => line.variantId === variantId;

/**
 * The bag for shoppers who have not signed in.
 *
 * Lines are denormalised (name, image, price) so the guest bag renders with
 * no extra requests. Those values are display-only: the server re-resolves
 * every line from the live catalogue when the cart is merged at sign-in, so a
 * tampered localStorage entry cannot buy anything at the wrong price.
 */
export const useGuestCartStore = create<GuestCartState>()(
  persist(
    (set) => ({
      items: [],

      addItem: (line) =>
        set((state) => {
          const existing = state.items.find((item) => sameLine(item, line.variantId));

          if (!existing) {
            return { items: [...state.items, line] };
          }

          const cap = Math.min(line.maxQuantity || MAX_QUANTITY_PER_LINE, MAX_QUANTITY_PER_LINE);
          return {
            items: state.items.map((item) =>
              sameLine(item, line.variantId)
                ? { ...item, quantity: Math.min(item.quantity + line.quantity, cap) }
                : item,
            ),
          };
        }),

      updateQuantity: (variantId, quantity) =>
        set((state) => ({
          items: state.items.map((item) =>
            sameLine(item, variantId)
              ? {
                  ...item,
                  quantity: Math.max(
                    1,
                    Math.min(quantity, item.maxQuantity || MAX_QUANTITY_PER_LINE),
                  ),
                }
              : item,
          ),
        })),

      removeItem: (variantId) =>
        set((state) => ({ items: state.items.filter((item) => !sameLine(item, variantId)) })),

      clear: () => set({ items: [] }),
    }),
    {
      name: STORAGE_KEYS.guestCart,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

/** Derived totals for the guest bag, mirroring the server's cart summary. */
export function selectGuestTotals(items: GuestCartLine[]) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const mrpTotal = items.reduce((sum, item) => sum + item.mrp * item.quantity, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return { subtotal, savings: Math.max(0, mrpTotal - subtotal), totalQuantity };
}
