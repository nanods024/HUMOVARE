import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { Gender, ProductFacets } from '@/types';
import { cn } from '@/utils/cn';
import { formatPrice } from '@/utils/format';
import { FIT_LABELS, SIZE_ORDER } from '@/constants';
import { collectionsApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { AccordionItem } from '@/components/ui/Accordion';
import { Button } from '@/components/ui/Button';

export interface FilterState {
  size: string[];
  color: string[];
  fit: string[];
  /** Curated collection slugs. Several narrow to their intersection. */
  collection: string[];
  /**
   * No longer offered as a facet — the range is menswear-only. Kept on the
   * state so an old deep link carrying `?gender=` still round-trips and can
   * be cleared from the active-filter chips.
   */
  gender?: Gender;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
}

export interface ShopFilterConfig {
  key: string;
  label: string;
  defaultOpen?: boolean;
}

/**
 * Which panels appear, what they are called and which start open is
 * admin-managed. This list is the fallback used until the config loads, and
 * it matches what the server seeds, so the sidebar never flickers.
 */
const DEFAULT_FILTERS: ShopFilterConfig[] = [
  { key: 'availability', label: 'Availability', defaultOpen: true },
  { key: 'size', label: 'Size', defaultOpen: true },
  { key: 'colour', label: 'Colour', defaultOpen: true },
  { key: 'price', label: 'Price', defaultOpen: true },
  { key: 'fit', label: 'Fit' },
  { key: 'collection', label: 'Collection' },
];

interface FilterSidebarProps {
  facets?: ProductFacets;
  value: FilterState;
  onChange: (next: FilterState) => void;
  onClear: () => void;
  className?: string;
  /** Enabled filters in the admin's order; falls back to DEFAULT_FILTERS. */
  filters?: ShopFilterConfig[];
}

/**
 * AccordionItem takes `defaultOpen` as initial state only, and the sidebar
 * renders once against DEFAULT_FILTERS before the config arrives. Folding the
 * flag into the key remounts a panel whose configured state disagrees with
 * the fallback, so "start collapsed" is honoured rather than silently lost.
 */
const panelKey = (config: ShopFilterConfig) =>
  `${config.key}:${config.defaultOpen ? 1 : 0}`;

/** Toggles a value in/out of a multi-select facet. */
const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export function FilterSidebar({ facets, value, onChange, onClear, className, filters }: FilterSidebarProps) {
  const [priceDraft, setPriceDraft] = useState<number | undefined>(value.maxPrice);

  const activeCount =
    value.size.length +
    value.color.length +
    value.fit.length +
    value.collection.length +
    (value.gender ? 1 : 0) +
    (value.maxPrice !== undefined ? 1 : 0) +
    (value.inStock ? 1 : 0) +
    (value.onSale ? 1 : 0);

  const sizes = [...(facets?.sizes ?? [])].sort((a, b) => {
    const indexA = SIZE_ORDER.indexOf(a.value);
    const indexB = SIZE_ORDER.indexOf(b.value);
    if (indexA === -1 || indexB === -1) return a.value.localeCompare(b.value);
    return indexA - indexB;
  });

  // The collection list is its own endpoint rather than a product facet: a
  // collection is a curated list, so it exists whether or not anything in the
  // current result set belongs to it.
  const { data: collectionData } = useQuery({
    queryKey: queryKeys.collections.all,
    queryFn: () => collectionsApi.list().then((response) => response.collections),
    staleTime: 10 * 60 * 1000,
  });
  const collections = collectionData ?? [];

  const priceMin = facets?.price.min ?? 0;
  const priceMax = facets?.price.max ?? 5000;

  // One renderer per supported key. A key the sidebar has no code for renders
  // nothing, so a stale config can never break the page.
  const panels: Record<string, (config: ShopFilterConfig) => JSX.Element | null> = {
    availability: (config) => (
      <AccordionItem
          key={panelKey(config)}
          title={config.label}
          defaultOpen={config.defaultOpen}
        >
        <div className="space-y-2.5">
          <Checkbox
            label="In stock only"
            checked={Boolean(value.inStock)}
            onChange={(checked) => onChange({ ...value, inStock: checked || undefined })}
          />
          <Checkbox
            label="On sale"
            checked={Boolean(value.onSale)}
            onChange={(checked) => onChange({ ...value, onSale: checked || undefined })}
          />
        </div>
      </AccordionItem>
    ),

    size: (config) =>
      sizes.length === 0 ? null : (
        <AccordionItem
          key={panelKey(config)}
          title={config.label}
          defaultOpen={config.defaultOpen}
        >
          <div className="flex flex-wrap gap-2">
            {sizes.map((facet) => {
              const isActive = value.size.includes(facet.value);
              return (
                <button
                  key={facet.value}
                  type="button"
                  onClick={() => onChange({ ...value, size: toggle(value.size, facet.value) })}
                  aria-pressed={isActive}
                  className={cn(
                    'min-w-[2.75rem] rounded-xl border px-3 py-2 text-xs font-semibold uppercase transition-all duration-300 active:scale-95',
                    isActive
                      ? 'border-ink-black bg-ink-black text-canvas'
                      : 'border-line hover:border-ink-black',
                  )}
                >
                  {facet.value}
                </button>
              );
            })}
          </div>
        </AccordionItem>
      ),

    colour: (config) =>
      (facets?.colors?.length ?? 0) === 0 ? null : (
        <AccordionItem
          key={panelKey(config)}
          title={config.label}
          defaultOpen={config.defaultOpen}
        >
          <ul className="space-y-2.5">
            {facets!.colors.map((facet) => (
              <li key={facet.value}>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={value.color.includes(facet.value)}
                    onChange={() => onChange({ ...value, color: toggle(value.color, facet.value) })}
                    className="h-4 w-4 accent-[rgb(var(--color-primary))]"
                  />
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-line"
                    style={{ backgroundColor: facet.hex }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-ink">{facet.name ?? facet.value}</span>
                  <span className="text-xs text-ink-subtle">{facet.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </AccordionItem>
      ),

    price: (config) => (
      <AccordionItem
          key={panelKey(config)}
          title={config.label}
          defaultOpen={config.defaultOpen}
        >
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>{formatPrice(priceMin)}</span>
            <span className="font-medium text-ink">
              Up to {formatPrice(priceDraft ?? priceMax)}
            </span>
          </div>

          <input
            type="range"
            min={priceMin}
            max={priceMax}
            step={100}
            value={priceDraft ?? priceMax}
            onChange={(event) => setPriceDraft(Number(event.target.value))}
            // Commit on release, not on every pixel of drag.
            onMouseUp={() => onChange({ ...value, maxPrice: priceDraft })}
            onTouchEnd={() => onChange({ ...value, maxPrice: priceDraft })}
            onKeyUp={() => onChange({ ...value, maxPrice: priceDraft })}
            aria-label="Maximum price"
            className="w-full accent-[rgb(var(--color-primary))]"
          />
        </div>
      </AccordionItem>
    ),

    collection: (config) =>
      collections.length === 0 ? null : (
        <AccordionItem
          key={panelKey(config)}
          title={config.label}
          defaultOpen={config.defaultOpen}
        >
          <ul className="space-y-2.5">
            {collections.map((collection) => (
              <li key={collection.slug}>
                <Checkbox
                  label={collection.name}
                  checked={value.collection.includes(collection.slug)}
                  onChange={() =>
                    onChange({ ...value, collection: toggle(value.collection, collection.slug) })
                  }
                />
              </li>
            ))}
          </ul>
        </AccordionItem>
      ),

    fit: (config) =>
      (facets?.fits?.length ?? 0) === 0 ? null : (
        <AccordionItem
          key={panelKey(config)}
          title={config.label}
          defaultOpen={config.defaultOpen}
        >
          <ul className="space-y-2.5">
            {facets!.fits.map((facet) => (
              <li key={facet.value}>
                <Checkbox
                  label={FIT_LABELS[facet.value] ?? facet.value}
                  count={facet.count}
                  checked={value.fit.includes(facet.value)}
                  onChange={() => onChange({ ...value, fit: toggle(value.fit, facet.value) })}
                />
              </li>
            ))}
          </ul>
        </AccordionItem>
      ),

  };

  const panelConfig = filters?.length ? filters : DEFAULT_FILTERS;

  return (
    <aside className={cn('w-full', className)} aria-label="Filters">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider">
          Filters {activeCount > 0 && <span className="text-primary">({activeCount})</span>}
        </h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setPriceDraft(undefined);
              onClear();
            }}
            className="flex items-center gap-1 text-[0.6875rem] uppercase tracking-wider text-ink-muted underline underline-offset-4 hover:text-primary"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Clear all
          </button>
        )}
      </div>

      <div className="border-t border-line">
        {panelConfig.map((config) => panels[config.key]?.(config) ?? null)}
      </div>
    </aside>
  );
}

function Checkbox({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm capitalize">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[rgb(var(--color-primary))]"
      />
      <span className="flex-1 text-ink">{label}</span>
      {count !== undefined && <span className="text-xs text-ink-subtle">{count}</span>}
    </label>
  );
}

/** Mobile bottom-sheet wrapper around the same filter controls. */
export function MobileFilterSheet({
  isOpen,
  onClose,
  resultCount,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  resultCount: number;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] lg:hidden">
      <div className="absolute inset-0 bg-ink-black/50" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col bg-canvas"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Filters</h2>
          <button type="button" onClick={onClose} aria-label="Close filters" className="-mr-2 p-2">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <footer className="shrink-0 border-t border-line p-4">
          <Button variant="primary" fullWidth onClick={onClose}>
            Show {resultCount} result{resultCount === 1 ? '' : 's'}
          </Button>
        </footer>
      </div>
    </div>
  );
}

export default FilterSidebar;
