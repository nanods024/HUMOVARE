import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { SlidersHorizontal, ArrowUpDown } from 'lucide-react';

import { productsApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { SORT_OPTIONS, PRODUCTS_PER_PAGE } from '@/constants';
import { useShopConfig } from '@/hooks/useShopConfig';
import type { Gender, ProductQuery } from '@/types';
import { ProductGrid } from '@/components/product/ProductGrid';
import { FilterSidebar, MobileFilterSheet, type FilterState } from './FilterSidebar';
import { Pagination } from './Pagination';
import { ActiveFilterChips } from './ActiveFilterChips';
import { ErrorState } from '@/components/ui/States';
import { useUIStore } from '@/store/uiStore';

interface ProductListingProps {
  /** Fixed scope for a collection page; absent on /shop and /search. */
  scope?: { category?: string; collection?: string };
  searchTerm?: string;
  emptyTitle?: string;
}

/** Reads the multi-value facets out of the URL. */
const readList = (params: URLSearchParams, key: string) => params.getAll(key).filter(Boolean);

const GENDERS: Gender[] = ['men'];

/** Only accept a gender the API actually understands. */
const readGender = (params: URLSearchParams): Gender | undefined => {
  const value = params.get('gender');
  return value && GENDERS.includes(value as Gender) ? (value as Gender) : undefined;
};

/**
 * The shared listing engine behind /shop, every collection page and /search.
 *
 * All filter and sort state lives in the URL, which makes every view
 * shareable, back-button friendly and cacheable. Filtering and sorting happen
 * on the server — the browser never receives more than one page.
 */
export function ProductListing({ scope, searchTerm, emptyTitle }: ProductListingProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobileFilterOpen = useUIStore((state) => state.isMobileFilterOpen);
  const openMobileFilter = useUIStore((state) => state.openMobileFilter);
  const closeMobileFilter = useUIStore((state) => state.closeMobileFilter);

  // Admin-managed: sort list, page size, filter panels and empty-state copy.
  // Falls back to the built-in constants until it resolves, so the listing
  // renders identically whether or not the config is available.
  const config = useShopConfig();

  const sortOptions = config?.sortOptions?.length ? config.sortOptions : SORT_OPTIONS;
  const defaultSort = config?.defaultSort ?? 'featured';
  const pageSize = config?.pageSize ?? PRODUCTS_PER_PAGE;

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const sort = searchParams.get('sort') || undefined;

  const filters: FilterState = useMemo(
    () => ({
      size: readList(searchParams, 'size'),
      color: readList(searchParams, 'color'),
      fit: readList(searchParams, 'fit'),
      collection: readList(searchParams, 'collection'),
      gender: readGender(searchParams),
      maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
      minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
      inStock: searchParams.get('inStock') === 'true' || undefined,
      onSale: searchParams.get('onSale') === 'true' || undefined,
    }),
    [searchParams],
  );

  const query: ProductQuery = useMemo(
    () => ({
      ...scope,
      ...filters,
      // The API takes curated collections under its own plural name, so it is
      // never confused with the category-style `collection` scope.
      collection: scope?.collection,
      collections: filters.collection.length ? filters.collection : undefined,
      search: searchTerm,
      sort: sort ?? defaultSort,
      page,
      limit: pageSize,
    }),
    [scope, filters, searchTerm, sort, defaultSort, page, pageSize],
  );

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: queryKeys.products.list(query),
    queryFn: () => productsApi.list(query),
    // Keeps the previous page on screen while the next one loads, so the grid
    // does not flash empty when paginating.
    placeholderData: keepPreviousData,
  });

  const facetScope = scope?.category ?? scope?.collection ?? 'all';
  const { data: facets } = useQuery({
    queryKey: queryKeys.products.facets(facetScope),
    queryFn: () => productsApi.facets(scope ?? {}),
    staleTime: 10 * 60 * 1000,
  });

  /** Writes filter state back to the URL and resets to page 1. */
  const applyFilters = useCallback(
    (next: FilterState) => {
      const params = new URLSearchParams();

      if (sort) params.set('sort', sort);
      if (searchTerm) params.set('q', searchTerm);

      (['size', 'color', 'fit', 'collection'] as const).forEach((key) => {
        next[key].forEach((item) => params.append(key, item));
      });

      if (next.gender) params.set('gender', next.gender);
      if (next.minPrice !== undefined) params.set('minPrice', String(next.minPrice));
      if (next.maxPrice !== undefined) params.set('maxPrice', String(next.maxPrice));
      if (next.inStock) params.set('inStock', 'true');
      if (next.onSale) params.set('onSale', 'true');

      setSearchParams(params, { replace: true });
    },
    [setSearchParams, sort, searchTerm],
  );

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (sort) params.set('sort', sort);
    if (searchTerm) params.set('q', searchTerm);
    setSearchParams(params, { replace: true });
  }, [setSearchParams, sort, searchTerm]);

  const changeSort = (nextSort: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('sort', nextSort);
    params.delete('page');
    setSearchParams(params, { replace: true });
  };

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(nextPage));
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isError) {
    return (
      <ErrorState
        title="We could not load these products"
        onRetry={() => refetch()}
        isOffline={!navigator.onLine}
      />
    );
  }

  const products = data?.products ?? [];
  const pagination = data?.pagination;
  const total = pagination?.totalProducts ?? 0;

  const filterControls = (
    <FilterSidebar
      facets={facets}
      value={filters}
      onChange={applyFilters}
      onClear={clearFilters}
      filters={config?.filters}
    />
  );

  return (
    <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10">
      <div className="hidden lg:block">{filterControls}</div>

      <div className="min-w-0">
        {/* Toolbar: sticks under the header so sort stays reachable. */}
        <div className="sticky top-header z-30 -mx-gutter mb-6 flex items-center justify-between gap-3 border-b border-line bg-canvas/95 px-gutter py-3 backdrop-blur lg:static lg:mx-0 lg:px-0">
          <p className="shrink-0 text-xs text-ink-muted" aria-live="polite">
            {isLoading ? 'Loading…' : `${total} product${total === 1 ? '' : 's'}`}
          </p>

          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={openMobileFilter}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-[0.6875rem] font-semibold uppercase tracking-wider transition-all duration-300 hover:border-ink-black active:scale-95 lg:hidden"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Filter
            </button>

            <div className="relative min-w-0">
              <ArrowUpDown
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <select
                value={sort ?? defaultSort}
                onChange={(event) => changeSort(event.target.value)}
                aria-label="Sort products"
                className="h-9 w-full min-w-0 max-w-[12rem] cursor-pointer appearance-none truncate rounded-xl border border-line bg-canvas pl-9 pr-8 text-[0.6875rem] font-semibold uppercase tracking-wider transition-[border-color,box-shadow] duration-300 hover:border-ink-muted focus:border-primary focus:shadow-[0_0_0_4px_rgb(var(--color-primary)/0.12)] focus:outline-none sm:max-w-none"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <ActiveFilterChips value={filters} onChange={applyFilters} onClear={clearFilters} />

        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <ProductGrid
            products={products}
            isLoading={isLoading}
            skeletonCount={12}
            emptyTitle={emptyTitle ?? config?.emptyTitle ?? 'No products match those filters'}
            emptyDescription={
              config?.emptyDescription ?? 'Try widening your price range or clearing a filter.'
            }
          />
        </div>

        {pagination && pagination.totalPages > 1 && (
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={goToPage}
          />
        )}
      </div>

      <MobileFilterSheet
        isOpen={isMobileFilterOpen}
        onClose={closeMobileFilter}
        resultCount={total}
      >
        {filterControls}
      </MobileFilterSheet>
    </div>
  );
}

export default ProductListing;
