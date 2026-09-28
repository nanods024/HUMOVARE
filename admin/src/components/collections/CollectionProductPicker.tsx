import { useMemo, useState } from 'react';
import { Search, Check, X, ArrowUp, ArrowDown, ImageIcon, PackageSearch } from 'lucide-react';

import type { AdminProductRow } from '@/types';
import { thumbUrl } from '@/utils/image';
import { formatPrice } from '@/utils/format';
import { cn } from '@/utils/cn';

const ALL = '__all__';
const UNCATEGORISED = 'Uncategorised';

/**
 * Picks products for a collection, category by category.
 *
 * Left: the catalogue, filtered by a category tab and a search box, with a
 * "select all" per category. Right: what is in the collection, in the order
 * the storefront will show it, with controls to reorder or drop a product.
 */
export function CollectionProductPicker({
  products,
  selected,
  onChange,
  isLoading,
}: {
  products: AdminProductRow[];
  selected: string[];
  onChange: (next: string[]) => void;
  isLoading?: boolean;
}) {
  const [category, setCategory] = useState(ALL);
  const [search, setSearch] = useState('');

  const byId = useMemo(() => new Map(products.map((product) => [product._id, product])), [products]);

  // Category tabs in catalogue order, each with how many products it holds.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      const name = product.category?.name ?? UNCATEGORISED;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [products]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) => {
      const name = product.category?.name ?? UNCATEGORISED;
      if (category !== ALL && name !== category) return false;
      return !needle || product.name.toLowerCase().includes(needle);
    });
  }, [products, category, search]);

  // Grouped by category so "All" still reads as a catalogue, not a flat list.
  const groups = useMemo(() => {
    const map = new Map<string, AdminProductRow[]>();
    for (const product of visible) {
      const name = product.category?.name ?? UNCATEGORISED;
      map.set(name, [...(map.get(name) ?? []), product]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  const selectedSet = new Set(selected);

  const toggle = (id: string) =>
    onChange(selectedSet.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  const setGroup = (items: AdminProductRow[], on: boolean) => {
    const ids = items.map((item) => item._id);
    onChange(on
      ? [...selected, ...ids.filter((id) => !selectedSet.has(id))]
      : selected.filter((id) => !ids.includes(id)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      {/* ── Catalogue ─────────────────────────────────────────────── */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-line">
        <div className="space-y-3 border-b border-line bg-canvas/50 p-3">
          <label className="relative block">
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products…"
              className="h-9 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ink-subtle focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </label>

          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by category">
            {[[ALL, products.length] as const, ...categories].map(([name, count]) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={category === name}
                onClick={() => setCategory(name)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-all duration-150 active:scale-95',
                  category === name
                    ? 'bg-ink text-white ring-ink'
                    : 'bg-panel text-ink-muted ring-line hover:text-ink',
                )}
              >
                {name === ALL ? 'All' : name}
                <span className={cn('ml-1.5 tabular', category === name ? 'text-white/60' : 'text-ink-subtle')}>{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[22rem] overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-10 text-center text-sm text-ink-subtle">Loading products…</p>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <PackageSearch className="h-6 w-6 text-ink-subtle" aria-hidden="true" />
              <p className="mt-2 text-sm text-ink-muted">No products match.</p>
            </div>
          ) : (
            groups.map(([name, items]) => {
              const picked = items.filter((item) => selectedSet.has(item._id)).length;
              const allPicked = picked === items.length;
              return (
                <section key={name} aria-label={name}>
                  <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-panel/95 px-4 py-2 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                      {name} <span className="tabular font-normal normal-case">· {picked}/{items.length}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setGroup(items, !allPicked)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {allPicked ? 'Clear' : 'Select all'}
                    </button>
                  </header>

                  <ul className="grid gap-2 p-3 sm:grid-cols-2">
                    {items.map((product) => {
                      const isOn = selectedSet.has(product._id);
                      return (
                        <li key={product._id}>
                          <button
                            type="button"
                            onClick={() => toggle(product._id)}
                            aria-pressed={isOn}
                            className={cn(
                              'group flex w-full items-center gap-3 rounded-lg p-2 text-left ring-1 ring-inset transition-all duration-150',
                              isOn
                                ? 'bg-primary/5 ring-primary/40'
                                : 'bg-panel ring-line hover:bg-canvas hover:ring-ink/15',
                            )}
                          >
                            {product.thumbnail?.url ? (
                              <img src={thumbUrl(product.thumbnail.url)} alt="" loading="lazy" className="h-12 w-10 shrink-0 rounded-md object-cover ring-1 ring-line" />
                            ) : (
                              <span className="grid h-12 w-10 shrink-0 place-items-center rounded-md bg-canvas ring-1 ring-line">
                                <ImageIcon className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-[0.8125rem] font-medium leading-snug text-ink">{product.name}</span>
                              <span className="mt-0.5 block text-xs text-ink-subtle">
                                {formatPrice(product.price)}
                                {!product.isActive && <span className="ml-1.5 text-warning">· Hidden</span>}
                              </span>
                            </span>
                            <span
                              aria-hidden="true"
                              className={cn(
                                'grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-all duration-150',
                                isOn ? 'bg-primary text-white ring-primary' : 'ring-line text-transparent group-hover:ring-ink/30',
                              )}
                            >
                              <Check className="h-3 w-3" />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </div>

      {/* ── In this collection ────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas/50 px-3 py-2.5">
          <p className="text-xs font-semibold text-ink">
            In this collection <span className="tabular text-ink-subtle">({selected.length})</span>
          </p>
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-xs font-medium text-ink-muted hover:text-danger">
              Clear all
            </button>
          )}
        </div>

        {selected.length === 0 ? (
          <p className="flex-1 px-4 py-10 text-center text-xs leading-relaxed text-ink-subtle">
            Pick products on the left. They show on the storefront in this order.
          </p>
        ) : (
          <ol className="max-h-[22rem] flex-1 space-y-1 overflow-y-auto p-2 lg:max-h-[26rem]">
            {selected.map((id, index) => {
              const product = byId.get(id);
              return (
                <li key={id} className="group flex animate-fade-in items-center gap-2 rounded-lg bg-panel p-1.5 ring-1 ring-inset ring-line">
                  <span className="tabular w-5 shrink-0 text-center text-[0.6875rem] font-semibold text-ink-subtle">{index + 1}</span>
                  {product?.thumbnail?.url ? (
                    <img src={thumbUrl(product.thumbnail.url)} alt="" className="h-9 w-7 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="h-9 w-7 shrink-0 rounded bg-canvas" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                    {product?.name ?? 'Product no longer available'}
                  </span>
                  <span className="flex shrink-0 items-center">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="rounded p-1 text-ink-subtle hover:bg-canvas hover:text-ink disabled:opacity-30">
                      <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === selected.length - 1} aria-label="Move down" className="rounded p-1 text-ink-subtle hover:bg-canvas hover:text-ink disabled:opacity-30">
                      <ArrowDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${product?.name ?? 'product'}`} className="rounded p-1 text-ink-subtle hover:bg-danger/10 hover:text-danger">
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

export default CollectionProductPicker;
