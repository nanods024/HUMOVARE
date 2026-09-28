import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useRecentStore } from '@/store/recentStore';
import { ProductRail } from './ProductGrid';

/**
 * Recently-viewed rail. The id list lives in localStorage, so the rail works
 * for guests too; the server only resolves ids into cards.
 */
export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const productIds = useRecentStore((state) => state.productIds);
  const ids = productIds.filter((id) => id !== excludeId).slice(0, 8);

  // Keyed on the set of ids, not their order: viewing one more product would
  // otherwise make a brand-new request for the same cards.
  const idsKey = useMemo(() => [...ids].sort(), [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.products.byIds(idsKey),
    queryFn: () => productsApi.byIds(idsKey),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const products = useMemo(() => {
    const byId = new Map((data?.products ?? []).map((product) => [product._id, product]));
    return ids.map((id) => byId.get(id)).filter((product) => product !== undefined);
  }, [data, ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ids.length || (!isLoading && !products.length)) return null;

  return (
    <section className="border-t border-line bg-surface py-14">
      <div className="container-page">
        <h2 className="mb-8 text-display-sm">Recently viewed</h2>
        <ProductRail products={products} isLoading={isLoading} />
      </div>
    </section>
  );
}

export default RecentlyViewed;
