import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  AlertTriangle, Boxes, History, Layers, Minus, PackageX, Pencil, Plus, Search, type LucideIcon,
} from 'lucide-react';

import { inventoryApi, categoriesApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { useTableQuery, useDebouncedSearch } from '@/hooks/useTableQuery';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { thumbUrl } from '@/utils/image';
import type { InventoryProduct, InventoryRow } from '@/types';
import { PageHeader, Panel, Button, Input, Select, Badge, Modal, Skeleton, EmptyState, ErrorState, Pagination } from '@/components/ui';

const PRODUCTS_PER_PAGE = 15;

type Level = 'in' | 'low' | 'out';

const LEVEL: Record<Level, { label: string; chip: string; text: string; tone: 'success' | 'warning' | 'danger' }> = {
  in: { label: 'In stock', chip: 'bg-success/10 text-success ring-success/20', text: 'text-ink', tone: 'success' },
  low: { label: 'Running low', chip: 'bg-warning/10 text-warning ring-warning/25', text: 'text-warning', tone: 'warning' },
  out: { label: 'Out of stock', chip: 'bg-danger/10 text-danger ring-danger/20', text: 'text-danger', tone: 'danger' },
};

const FILTERS: { value: '' | Level; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'low', label: 'Running low' },
  { value: 'out', label: 'Out of stock' },
  { value: 'in', label: 'In stock' },
];

/** Clothing sizes in shelf order; waist sizes and anything else follow. */
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL'];
function compareSizes(a: string, b: string) {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase());
  const ib = SIZE_ORDER.indexOf(b.toUpperCase());
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

const sizesOf = (product: InventoryProduct) => [...new Set(product.variants.map((v) => v.size))].sort(compareSizes);
const colourKey = (v: InventoryRow) => v.colorSlug || v.color;

function SummaryTile({ icon: Icon, label, value, tone, active, onClick }: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  active?: boolean;
  onClick?: () => void;
}) {
  const tones = {
    neutral: 'bg-ink/[0.06] text-ink-muted',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'panel flex items-center gap-3 p-4 text-left transition-all duration-200',
        onClick && 'hover:-translate-y-0.5 hover:shadow-lift',
        active && 'ring-2 ring-primary',
      )}
    >
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', tones[tone])} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-xs font-medium text-ink-muted">{label}</span>
        <span className="tabular block text-xl font-bold text-ink">{value}</span>
      </span>
    </Tag>
  );
}

/**
 * Edits one product's stock as a colour × size grid, with its own Save.
 * Opening a product to change it keeps the main list clean and easy to read.
 */
function StockEditor({ product, threshold, onClose }: {
  product: InventoryProduct;
  threshold: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(product.variants.map((v) => [v.variantId, v.stock])),
  );
  const [reason, setReason] = useState('');

  const sizes = sizesOf(product);
  const colours = [...new Set(product.variants.map(colourKey))].map((key) => {
    const sample = product.variants.find((v) => colourKey(v) === key)!;
    const swatch = product.colors.find((c) => c.slug === key || c.name === sample.color);
    return { key, name: sample.color, hex: swatch?.hex ?? '#d4d4d8' };
  });
  const cell = (colour: string, size: string) => product.variants.find((v) => colourKey(v) === colour && v.size === size);

  const changes = product.variants.filter((v) => counts[v.variantId] !== v.stock);
  const total = product.variants.reduce((sum, v) => sum + (counts[v.variantId] ?? 0), 0);
  const set = (v: InventoryRow, next: number) =>
    setCounts((c) => ({ ...c, [v.variantId]: Math.max(0, Math.floor(Number.isFinite(next) ? next : 0)) }));

  const save = useMutation({
    mutationFn: () =>
      inventoryApi.bulkAdjust(
        changes.map((v) => ({
          productId: product.productId,
          variantId: v.variantId,
          quantity: counts[v.variantId],
          reason: reason.trim() || undefined,
        })),
      ),
    onSuccess: (result) => {
      if (result.failed > 0) toast.error(`${result.updated} saved, ${result.failed} failed`);
      else toast.success(`Stock updated for ${product.name}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update stock')),
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Update stock — ${product.name}`}
      size="xl"
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            aria-label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional) — restock, stock count, damaged…"
            containerClassName="flex-1"
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} isLoading={save.isPending} disabled={!changes.length}>
              {changes.length ? `Save ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}` : 'No changes'}
            </Button>
          </div>
        </div>
      }
    >
      <p className="mb-4 text-sm text-ink-muted">
        Type how many you have of each colour and size. Total: <strong className="tabular text-ink">{total}</strong>
      </p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[24rem] text-sm">
          <thead>
            <tr className="bg-canvas text-xs font-semibold text-ink-muted">
              <th scope="col" className="px-4 py-2.5 text-left">Colour</th>
              {sizes.map((size) => (
                <th key={size} scope="col" className="px-2 py-2.5 text-center">{size}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {colours.map((colour) => (
              <tr key={colour.key}>
                <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: colour.hex }} aria-hidden="true" />
                    {colour.name}
                  </span>
                </th>
                {sizes.map((size) => {
                  const v = cell(colour.key, size);
                  if (!v) return <td key={size} className="px-2 py-3 text-center text-ink-subtle">—</td>;
                  const value = counts[v.variantId] ?? 0;
                  const changed = value !== v.stock;
                  const lv: Level = value <= 0 ? 'out' : value <= threshold ? 'low' : 'in';
                  return (
                    <td key={size} className="px-2 py-3">
                      <div className="mx-auto flex w-fit flex-col items-center gap-1">
                        <div className={cn('flex items-center rounded-lg border bg-panel', changed ? 'border-primary ring-2 ring-primary/20' : 'border-line')}>
                          <button type="button" onClick={() => set(v, value - 1)} disabled={value <= 0} aria-label={`One fewer ${colour.name} ${size}`} className="grid h-9 w-8 place-items-center text-ink-muted hover:text-ink disabled:opacity-30">
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={String(value)}
                            onChange={(e) => set(v, Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            aria-label={`${colour.name} ${size}`}
                            className={cn(
                              'tabular h-9 w-12 bg-transparent text-center font-semibold focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
                              lv === 'out' ? 'text-danger' : lv === 'low' ? 'text-warning' : 'text-ink',
                            )}
                          />
                          <button type="button" onClick={() => set(v, value + 1)} aria-label={`One more ${colour.name} ${size}`} className="grid h-9 w-8 place-items-center text-ink-muted hover:text-ink">
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <span className={cn('text-[0.6875rem]', changed ? 'font-medium text-primary' : 'text-transparent')}>
                          was {v.stock}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/**
 * Stock overview: one clean row per product — how many there are, and which
 * sizes are low or gone. Changing numbers happens in a focused editor.
 */
export function InventoryPage() {
  const { params, page, setParam, setPage } = useTableQuery();
  const { can } = usePermission();
  const canEdit = can(P.INVENTORY_UPDATE);

  const [searchInput, setSearchInput] = useDebouncedSearch(params.search, setParam);
  const [historyFor, setHistoryFor] = useState<InventoryProduct | null>(null);
  const [editing, setEditing] = useState<InventoryProduct | null>(null);

  const level = (params.status ?? '') as '' | Level;
  const query = { page, limit: PRODUCTS_PER_PAGE, search: params.search, status: params.status, category: params.category };

  const { data: categoryData } = useQuery({
    queryKey: queryKeys.categories.list({ type: 'product-type' }),
    queryFn: () => categoriesApi.list({ type: 'product-type' }),
    staleTime: 5 * 60 * 1000,
  });
  const productTypes = useMemo(
    () =>
      (categoryData?.categories ?? [])
        .filter((category) => category.type === 'product-type' && !category.isVirtual)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categoryData],
  );

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: queryKeys.inventory.list(query),
    queryFn: () => inventoryApi.list(query),
    placeholderData: keepPreviousData,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: queryKeys.inventory.history(historyFor?.productId ?? ''),
    queryFn: () => inventoryApi.history(historyFor!.productId),
    enabled: Boolean(historyFor),
  });

  const products = data?.products ?? [];
  const summary = data?.summary;
  const threshold = summary?.lowStockThreshold ?? 5;
  const levelOf = (stock: number): Level => (stock <= 0 ? 'out' : stock <= threshold ? 'low' : 'in');

  if (isError) return <ErrorState title="Could not load stock" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Stock"
        description="See what's in stock at a glance. Use Update stock to change a product's counts — every change is kept in its history."
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Stock' }]}
      />

      <div className="stagger mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryTile icon={Boxes} label="Units in stock" value={summary ? summary.units.toLocaleString('en-IN') : '—'} tone="neutral" />
        <SummaryTile icon={Layers} label="Products" value={summary?.products ?? '—'} tone="success" active={level === ''} onClick={() => setParam('status', undefined)} />
        <SummaryTile icon={AlertTriangle} label={`Sizes running low (≤ ${threshold})`} value={summary?.low ?? '—'} tone="warning" active={level === 'low'} onClick={() => setParam('status', 'low')} />
        <SummaryTile icon={PackageX} label="Sizes out of stock" value={summary?.out ?? '—'} tone="danger" active={level === 'out'} onClick={() => setParam('status', 'out')} />
      </div>

      <Panel>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by product or SKU…" aria-label="Search stock" className="pl-9" />
          </div>
          <div role="tablist" aria-label="Stock level" className="flex shrink-0 gap-1 overflow-x-auto rounded-lg bg-canvas p-1">
            {FILTERS.map((filter) => (
              <button
                key={filter.value || 'all'}
                type="button"
                role="tab"
                aria-selected={level === filter.value}
                onClick={() => setParam('status', filter.value || undefined)}
                className={cn(
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                  level === filter.value ? 'bg-panel text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <Select value={params.category ?? ''} onChange={(e) => setParam('category', e.target.value || undefined)} aria-label="Filter by product type" className="lg:w-48">
            <option value="">All product types</option>
            {productTypes.map((category) => (
              <option key={category._id} value={category._id}>{category.name}</option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-16 w-full" />)}
          </div>
        ) : products.length === 0 ? (
          <EmptyState icon={Boxes} title="Nothing matches" description="Clear the search, or switch the filter back to All." />
        ) : (
          <ul className={cn('divide-y divide-line', isPlaceholderData && 'opacity-60 transition-opacity')}>
            {products.map((product) => {
              const headline: Level = product.outCount === product.variantCount ? 'out' : product.outCount || product.lowCount ? 'low' : 'in';
              // Per size, summed over colours — the quick "what's on the shelf" read.
              const sizes = sizesOf(product).map((size) => {
                const qty = product.variants.filter((v) => v.size === size).reduce((sum, v) => sum + Math.max(v.stock, 0), 0);
                return { size, qty, level: levelOf(qty) };
              });
              const colourCount = new Set(product.variants.map(colourKey)).size;

              return (
                <li key={product.productId} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-canvas/50 md:flex-row md:items-center md:gap-5">
                  <div className="flex min-w-0 items-center gap-3 md:w-72 md:shrink-0">
                    {product.thumbnail?.url ? (
                      <img src={thumbUrl(product.thumbnail.url)} alt="" loading="lazy" className="h-14 w-11 shrink-0 rounded-lg object-cover ring-1 ring-line" />
                    ) : (
                      <span className="grid h-14 w-11 shrink-0 place-items-center rounded-lg bg-line text-ink-subtle">
                        <Boxes className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <Link to={`/products/${product.productId}`} className="block truncate font-semibold text-ink hover:text-primary">
                        {product.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={LEVEL[headline].tone}>{LEVEL[headline].label}</Badge>
                        {!product.isActive && <Badge tone="neutral">Hidden</Badge>}
                        <span className="text-[0.6875rem] text-ink-subtle">{colourCount} {colourCount === 1 ? 'colour' : 'colours'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label="Stock by size">
                    {sizes.map(({ size, qty, level: lv }) => (
                      <span key={size} className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs ring-1 ring-inset', LEVEL[lv].chip)}>
                        <span className="font-medium">{size}</span>
                        <span className="tabular font-bold">{qty}</span>
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    <div className="text-right">
                      <p className={cn('tabular text-2xl font-bold leading-none', LEVEL[headline].text)}>{product.totalStock}</p>
                      <p className="mt-1 text-[0.6875rem] text-ink-subtle">in stock</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setHistoryFor(product)} aria-label={`Stock history for ${product.name}`} title="History">
                        <History className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      {canEdit && (
                        <Button variant="outline" size="sm" onClick={() => setEditing(product)}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Update stock
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {data?.pagination && data.pagination.totalPages > 1 && (
          <Pagination
            pageSize={PRODUCTS_PER_PAGE}
            page={data.pagination.currentPage}
            totalPages={data.pagination.totalPages}
            total={data.pagination.totalItems}
            onChange={setPage}
          />
        )}
      </Panel>

      {editing && <StockEditor product={editing} threshold={threshold} onClose={() => setEditing(null)} />}

      <Modal isOpen={Boolean(historyFor)} onClose={() => setHistoryFor(null)} title={`Stock history — ${historyFor?.name ?? ''}`} size="lg">
        {historyLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((key) => <Skeleton key={key} className="h-12 w-full" />)}
          </div>
        ) : history?.history.length ? (
          <ol className="space-y-1">
            {history.history.map((entry, index) => (
              <li key={index} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-canvas">
                <span className={cn('tabular grid h-9 w-12 shrink-0 place-items-center rounded-lg text-sm font-bold', entry.delta >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                  {entry.delta >= 0 ? '+' : ''}{entry.delta}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="capitalize">{entry.type}</span> · now <strong>{entry.balanceAfter}</strong>
                  </p>
                  {entry.reason && <p className="truncate text-xs text-ink-muted">{entry.reason}</p>}
                </div>
                <span className="shrink-0 text-right text-xs text-ink-subtle">
                  {entry.adminUser?.name ?? 'System'}
                  <br />
                  {formatDateTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon={History} title="No stock changes yet" description="Saved counts will show up here." />
        )}
      </Modal>
    </>
  );
}

export default InventoryPage;
