import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { wishlistApi, getErrorMessage } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';

/**
 * Wishlist is server-backed and therefore sign-in only: it has to follow the
 * shopper across devices, which localStorage cannot do. Guests are sent to
 * the login page with a redirect back to where they were.
 */
export function useWishlist() {
  const isAuthed = useAuthStore((state) => state.status === 'authenticated');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const idsQuery = useQuery({
    queryKey: queryKeys.wishlist.ids,
    queryFn: () => wishlistApi.ids().then((res) => res.productIds),
    enabled: isAuthed,
    staleTime: 60_000,
  });

  // Memoised so the `?? []` fallback does not produce a new array identity
  // on every render and invalidate the callbacks below.
  const ids = useMemo(() => idsQuery.data ?? [], [idsQuery.data]);

  const syncCaches = (productIds: string[]) => {
    queryClient.setQueryData(queryKeys.wishlist.ids, productIds);
    // Refresh the full list, but not the ids that were just set.
    queryClient.invalidateQueries({
      queryKey: queryKeys.wishlist.all,
      predicate: (query) => query.queryKey[1] !== 'ids',
    });
  };

  const addMutation = useMutation({
    mutationFn: wishlistApi.add,
    // Optimistic: the heart must fill the instant it is tapped.
    onMutate: async (productId: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.wishlist.ids });
      const previous = queryClient.getQueryData<string[]>(queryKeys.wishlist.ids) ?? [];
      queryClient.setQueryData(queryKeys.wishlist.ids, [...new Set([...previous, productId])]);
      return { previous };
    },
    onError: (error, _productId, context) => {
      queryClient.setQueryData(queryKeys.wishlist.ids, context?.previous ?? []);
      toast.error(getErrorMessage(error, 'Could not save to wishlist'));
    },
    onSuccess: (res) => syncCaches(res.wishlist.productIds),
  });

  const removeMutation = useMutation({
    mutationFn: wishlistApi.remove,
    onMutate: async (productId: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.wishlist.ids });
      const previous = queryClient.getQueryData<string[]>(queryKeys.wishlist.ids) ?? [];
      queryClient.setQueryData(
        queryKeys.wishlist.ids,
        previous.filter((id) => id !== productId),
      );
      return { previous };
    },
    onError: (error, _productId, context) => {
      queryClient.setQueryData(queryKeys.wishlist.ids, context?.previous ?? []);
      toast.error(getErrorMessage(error, 'Could not update your wishlist'));
    },
    onSuccess: (res) => syncCaches(res.wishlist.productIds),
  });

  const isWishlisted = useCallback((productId: string) => ids.includes(productId), [ids]);

  const toggle = useCallback(
    (productId: string, productName?: string) => {
      if (!isAuthed) {
        toast.info('Sign in to save pieces to your wishlist');
        navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      if (isWishlisted(productId)) {
        removeMutation.mutate(productId);
        toast.info(productName ? `${productName} removed from wishlist` : 'Removed from wishlist');
      } else {
        addMutation.mutate(productId);
        toast.success(productName ? `${productName} saved` : 'Saved to wishlist', {
          label: 'View wishlist',
          to: '/wishlist',
        });
      }
    },
    [isAuthed, isWishlisted, navigate, addMutation, removeMutation],
  );

  return {
    ids,
    count: ids.length,
    isWishlisted,
    toggle,
    isLoading: isAuthed && idsQuery.isLoading,
  };
}

/** Full wishlist with populated products — used by the wishlist page only. */
export function useWishlistProducts() {
  const isAuthed = useAuthStore((state) => state.status === 'authenticated');

  return useQuery({
    queryKey: queryKeys.wishlist.all,
    queryFn: () => wishlistApi.get().then((res) => res.wishlist),
    enabled: isAuthed,
  });
}
