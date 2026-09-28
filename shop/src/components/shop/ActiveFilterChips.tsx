import { X } from 'lucide-react';
import type { FilterState } from './FilterSidebar';
import { formatPrice } from '@/utils/format';
import { FIT_LABELS } from '@/constants';

interface ActiveFilterChipsProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  onClear: () => void;
}

/**
 * Removable chips for whatever is currently filtered. Without these it is easy
 * to forget a filter is on and assume the catalogue is empty.
 */
export function ActiveFilterChips({ value, onChange, onClear }: ActiveFilterChipsProps) {
  const chips: { key: string; label: string; remove: () => void }[] = [];

  (['size', 'color', 'fit', 'collection'] as const).forEach((key) => {
    value[key].forEach((item) => {
      chips.push({
        key: `${key}-${item}`,
        label: key === 'fit' ? (FIT_LABELS[item] ?? item) : item.replace(/-/g, ' '),
        remove: () => onChange({ ...value, [key]: value[key].filter((entry) => entry !== item) }),
      });
    });
  });

  if (value.gender) {
    chips.push({
      key: 'gender',
      label: value.gender,
      remove: () => onChange({ ...value, gender: undefined }),
    });
  }

  if (value.maxPrice !== undefined) {
    chips.push({
      key: 'maxPrice',
      label: `Under ${formatPrice(value.maxPrice)}`,
      remove: () => onChange({ ...value, maxPrice: undefined }),
    });
  }

  if (value.inStock) {
    chips.push({
      key: 'inStock',
      label: 'In stock',
      remove: () => onChange({ ...value, inStock: undefined }),
    });
  }

  if (value.onSale) {
    chips.push({
      key: 'onSale',
      label: 'On sale',
      remove: () => onChange({ ...value, onSale: undefined }),
    });
  }

  if (!chips.length) return null;

  return (
    <ul className="mb-6 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={chip.remove}
            className="inline-flex items-center gap-1.5 border border-line bg-surface px-3 py-1.5 text-xs capitalize transition-colors hover:border-ink-black rounded-full"
          >
            {chip.label}
            <X className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Remove filter</span>
          </button>
        </li>
      ))}

      <li>
        <button
          type="button"
          onClick={onClear}
          className="px-2 py-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-muted underline underline-offset-4 hover:text-primary"
        >
          Clear all
        </button>
      </li>
    </ul>
  );
}

export default ActiveFilterChips;
