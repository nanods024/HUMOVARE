import { useQuery } from '@tanstack/react-query';

import { storefrontApi, type PublicShopConfig } from '@/api/storefront';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Admin-managed shop page configuration.
 *
 * Shared by the shop header, the listing engine and the filter sidebar. React
 * Query dedupes the request, so mounting it from several components still
 * costs one call, and it is cached long enough that navigating between
 * listing pages does not refetch.
 *
 * Returns `undefined` while loading or if the request fails \u2014 every consumer
 * treats that as "use the built-in defaults" rather than showing an error,
 * because a content config is not worth blocking the catalogue over.
 */
export function useShopConfig(): PublicShopConfig | undefined {
  const { data } = useQuery({
    queryKey: queryKeys.shopConfig,
    queryFn: () => storefrontApi.shopConfig().then((response) => response.config),
    staleTime: 5 * 60 * 1000,
  });

  return data;
}

export default useShopConfig;
