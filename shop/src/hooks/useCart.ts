import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartApi, getErrorMessage } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { useGuestCartStore, selectGuestTotals } from '@/store/guestCartStore';
import { toast } from '@/store/toastStore';
import type { Cart, CartLine, GuestCartLine, Product, ProductVariant } from '@/types';
import { useStoreSettings } from '@/hooks/useStoreSettings';

/**
 * One cart interface for signed-in and guest shoppers.
 *
 * Components call `addItem` / `updateQuantity` / `removeItem` without caring
 * which backing store is in play: authenticated carts go to the API, guest
 * carts to localStorage. Keeping the branch here means no component has to
 * repeat it.
 */
export function useCart() {
  const { shipping } = useStoreSettings();
  const isAuthed = useAuthStore((state) => state.status === 'authenticated');
  const queryClient = useQueryClient();

  const guestItems = useGuestCartStore((state) => state.items);
  const guestAdd = useGuestCartStore((state) => state.addItem);
  const guestUpdate = useGuestCartStore((state) => state.updateQuantity);
  const guestRemove = useGuestCartStore((state) => state.removeItem);
  const guestClear = useGuestCartStore((state) => state.clear);

  const serverCart = useQuery({
    queryKey: queryKeys.cart,
    queryFn: () => cartApi.get().then((res) => res.cart),
    enabled: isAuthed,
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.cart });
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: cartApi.addItem,
    onSuccess: (res) => queryClient.setQueryData(queryKeys.cart, res.cart),
    onError: (error) => toast.error(getErrorMessage(error, 'Could not add to bag')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      cartApi.updateItem(itemId, quantity),
    onSuccess: (res) => queryClient.setQueryData(queryKeys.cart, res.cart),
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Could not update your bag'));
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: cartApi.removeItem,
    onSuccess: (res) => queryClient.setQueryData(queryKeys.cart, res.cart),
    onError: (error) => toast.error(getErrorMessage(error, 'Could not remove that item')),
  });

  /** Guest lines are projected into the same shape the UI renders for server lines. */
  const guestAsCart: Cart = useMemo(() => {
    const totals = selectGuestTotals(guestItems);
    const { freeShippingThreshold, shippingFee: flatFee } = shipping;
    const shippingFee = totals.subtotal === 0 || totals.subtotal >= freeShippingThreshold ? 0 : flatFee;

    return {
      id: 'guest',
      items: guestItems.map<CartLine>((item) => ({
        id: item.variantId,
        productId: item.productId,
        name: item.name,
        slug: item.slug,
        image: item.image,
        variantId: item.variantId,
        sku: item.sku,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        price: item.price,
        mrp: item.mrp,
        lineTotal: item.price * item.quantity,
        maxQuantity: item.maxQuantity,
      })),
      totalQuantity: totals.totalQuantity,
      summary: {
        subtotal: totals.subtotal,
        discount: 0,
        shippingFee,
        total: totals.subtotal + shippingFee,
        currency: 'INR',
        freeShippingThreshold,
      },
      savings: totals.savings,
      notices: [],
    };
  }, [guestItems, shipping]);

  const cart = isAuthed ? serverCart.data : guestAsCart;

  const addItem = useCallback(
    async (product: Product, variant: ProductVariant, quantity = 1) => {
      if (isAuthed) {
        await addMutation.mutateAsync({
          productId: product._id,
          variantId: variant._id,
          quantity,
        });
      } else {
        const line: GuestCartLine = {
          productId: product._id,
          variantId: variant._id,
          quantity,
          name: product.name,
          slug: product.slug,
          image: product.thumbnail?.url || product.images?.[0]?.url || '',
          size: variant.size,
          color: variant.color,
          price: variant.price ?? product.price,
          mrp: product.mrp,
          sku: variant.sku,
          maxQuantity: Math.min(variant.stock, 10),
        };
        guestAdd(line);
      }

      toast.success(`${product.name} added to bag`, { label: 'View bag', to: '/cart' });
    },
    [isAuthed, addMutation, guestAdd],
  );

  const updateQuantity = useCallback(
    async (line: CartLine, quantity: number) => {
      if (isAuthed) {
        await updateMutation.mutateAsync({ itemId: line.id, quantity });
      } else {
        guestUpdate(line.variantId, quantity);
      }
    },
    [isAuthed, updateMutation, guestUpdate],
  );

  const removeItem = useCallback(
    async (line: CartLine) => {
      if (isAuthed) {
        await removeMutation.mutateAsync(line.id);
      } else {
        guestRemove(line.variantId);
      }
      toast.info('Removed from bag');
    },
    [isAuthed, removeMutation, guestRemove],
  );

  const clear = useCallback(async () => {
    if (isAuthed) {
      await cartApi.clear();
      invalidate();
    } else {
      guestClear();
    }
  }, [isAuthed, invalidate, guestClear]);

  return {
    cart,
    items: cart?.items ?? [],
    totalQuantity: cart?.totalQuantity ?? 0,
    summary: cart?.summary,
    savings: cart?.savings ?? 0,
    notices: cart?.notices ?? [],
    isLoading: isAuthed && serverCart.isLoading,
    isEmpty: (cart?.items.length ?? 0) === 0,
    isMutating: addMutation.isPending || updateMutation.isPending || removeMutation.isPending,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    refetch: invalidate,
  };
}
