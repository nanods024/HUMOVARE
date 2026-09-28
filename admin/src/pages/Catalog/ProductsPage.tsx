import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Package, Search, Trash2, Pencil, CheckSquare, Plus } from 'lucide-react';

import { productsApi, categoriesApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { useTableQuery, useDebouncedSearch } from '@/hooks/useTableQuery';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { formatPrice, formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import { thumbUrl } from '@/utils/image';
import {
  PageHeader, Panel, Button, Input, Select, Badge, TableSkeleton, EmptyState, ErrorState,
  Pagination, ConfirmDialog,
} from '@/components/ui';
import { PAGE_SIZE } from '@/lib/pagination';

export function ProductsPage() {
  const { params, page, setParam, setPage } = useTableQuery();
  const { can } = usePermission();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useDebouncedSearch(params.search, setParam);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  // Push the debounced value into the URL so the query key is stable.

  const query = {
    page,
    limit: PAGE_SIZE,
    search: params.search,
    isActive: params.isActive,
    flag: params.flag,
    category: params.category,
  };

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: queryKeys.products.list(query),
    queryFn: () => productsApi.list(query),
    placeholderData: keepPreviousData,
  });

  // Only product-type categories — a product's `category` field never points
  // at a style tile or a virtual collection like "Sale", so those would just
  // be dead options in this filter.
  const { data: categoriesData } = useQuery({
    queryKey: queryKeys.categories.list({ type: 'product-type' }),
    queryFn: () => categoriesApi.list({ type: 'product-type' }),
  });
  const categories = categoriesData?.categories ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all });

  const removeMutation = useMutation({
    mutationFn: (id: string) => productsApi.remove(id),
    onSuccess: (result) => {
      toast.success(result.deleted ? 'Product deleted' : 'Product deactivated');
      setDeleting(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not delete that product')),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, updates }: { ids: string[]; updates: Record<string, unknown> }) =>
      productsApi.bulk(ids, updates),
    onSuccess: (result) => {
      toast.success(`${result.modified} product(s) updated`);
      setSelected([]);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Bulk update failed')),
  });

  const products = data?.products ?? [];
  const pagination = data?.pagination;

  const allSelected = products.length > 0 && selected.length === products.length;
  const toggleAll = () => setSelected(allSelected ? [] : products.map((product) => product._id));
  const toggleOne = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  if (isError) return <ErrorState title="Could not load products" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Products"
        description="The catalogue the storefront reads from."
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Products' }]}
        actions={
          can(P.PRODUCTS_CREATE) && (
            <Button onClick={() => navigate('/products/new')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New product
            </Button>
          )
        }
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name, slug or SKU…"
              aria-label="Search products"
              className="pl-9"
            />
          </div>

          <Select
            value={params.category ?? ''}
            onChange={(event) => setParam('category', event.target.value || undefined)}
            aria-label="Filter by category"
            className="w-44"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </Select>

          <Select
            value={params.isActive ?? ''}
            onChange={(event) => setParam('isActive', event.target.value || undefined)}
            aria-label="Filter by visibility"
            className="w-36"
          >
            <option value="">All visibility</option>
            <option value="true">Visible</option>
            <option value="false">Hidden</option>
          </Select>

          <Select
            value={params.flag ?? ''}
            onChange={(event) => setParam('flag', event.target.value || undefined)}
            aria-label="Filter by flag"
            className="w-40"
          >
            <option value="">All products</option>
            <option value="featured">Featured</option>
            <option value="new-drop">New drops</option>
            <option value="bestseller">Bestsellers</option>
            <option value="sale">On sale</option>
            <option value="designer-exclusive">Designer Wear - Exclusive</option>
          </Select>
        </div>

        {/* Bulk bar only appears once something is selected. */}
        {selected.length > 0 && can(P.PRODUCTS_UPDATE) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-primary/5 px-5 py-2.5">
            <CheckSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-sm font-medium text-ink">{selected.length} selected</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ ids: selected, updates: { isActive: true } })}>
                Activate
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ ids: selected, updates: { isActive: false } })}>
                Deactivate
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ ids: selected, updates: { isNewDrop: true } })}>
                Mark new drop
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ ids: selected, updates: { isBestSeller: true } })}>
                Mark bestseller
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ ids: selected, updates: { isDesignerExclusive: true } })}>
                Mark designer exclusive
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products match those filters"
            description="Try clearing the search or status filter."
          />
        ) : (
          <div className={cn('overflow-x-auto', isPlaceholderData && 'opacity-60 transition-opacity')}>
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50 text-left text-xs text-ink-muted">
                  <th scope="col" className="w-10 px-5 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all products on this page"
                      className="h-4 w-4 rounded border-line accent-[rgb(var(--admin-primary))]"
                    />
                  </th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Product</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Category</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Price</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Stock</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2.5 pr-5 text-right font-medium">Updated</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-line">
                {products.map((product) => (
                  <tr key={product._id} className="hover:bg-canvas/60">
                    <td className="px-5 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(product._id)}
                        onChange={() => toggleOne(product._id)}
                        aria-label={`Select ${product.name}`}
                        className="h-4 w-4 rounded border-line accent-[rgb(var(--admin-primary))]"
                      />
                    </td>

                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        {product.thumbnail?.url ? (
                          <img src={thumbUrl(product.thumbnail.url)} alt="" loading="lazy" className="h-11 w-9 shrink-0 rounded object-cover" />
                        ) : (
                          <div className="h-11 w-9 shrink-0 rounded bg-canvas" />
                        )}
                        <div className="min-w-0">
                          <Link to={`/products/${product._id}`} className="block truncate font-medium text-ink hover:text-primary">
                            {product.name}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {product.isFeatured && <Badge tone="primary">Featured</Badge>}
                            {product.isNewDrop && <Badge tone="info">New</Badge>}
                            {product.isBestSeller && <Badge tone="success">Bestseller</Badge>}
                            {product.isDesignerExclusive && <Badge tone="neutral">Designer Exclusive</Badge>}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 pr-4 text-ink-muted">{product.category?.name ?? '—'}</td>

                    <td className="tabular py-3 pr-4">
                      <span className="font-medium text-ink">{formatPrice(product.price)}</span>
                      {product.mrp > product.price && (
                        <span className="ml-1.5 text-xs text-ink-subtle line-through">{formatPrice(product.mrp)}</span>
                      )}
                    </td>

                    <td className="tabular py-3 pr-4">
                      <Badge tone={product.stock <= 0 ? 'danger' : product.stock <= 5 ? 'warning' : 'neutral'}>
                        {product.stock}
                      </Badge>
                    </td>

                    <td className="py-3 pr-4">
                      <Badge tone={product.isActive ? 'success' : 'neutral'}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>

                    <td className="py-3 pr-5">
                      <div className="flex items-center justify-end gap-2">
                        <span className="hidden text-xs text-ink-subtle sm:inline">{formatDate(product.updatedAt)}</span>
                        <Link to={`/products/${product._id}`} aria-label={`Edit ${product.name}`} className="rounded p-1.5 text-ink-muted hover:bg-canvas hover:text-ink">
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                        {can(P.PRODUCTS_DELETE) && (
                          <button
                            type="button"
                            onClick={() => setDeleting({ id: product._id, name: product.name })}
                            aria-label={`Delete ${product.name}`}
                            className="rounded p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && (
          <Pagination
            pageSize={PAGE_SIZE}
            page={pagination.currentPage}
            totalPages={pagination.totalPages}
            total={pagination.totalItems}
            onChange={setPage}
          />
        )}
      </Panel>

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeMutation.mutate(deleting.id)}
        title="Deactivate this product?"
        message={`"${deleting?.name}" will be hidden from the storefront. Orders that already contain it are unaffected, and you can reactivate it at any time.`}
        confirmLabel="Deactivate"
        isLoading={removeMutation.isPending}
      />
    </>
  );
}

export default ProductsPage;
