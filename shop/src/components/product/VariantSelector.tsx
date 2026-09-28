import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { ProductColor, ProductVariant } from '@/types';
import { cn } from '@/utils/cn';
import { SIZE_ORDER } from '@/constants';

interface ColorSelectorProps {
  colors: ProductColor[];
  variants: ProductVariant[];
  selected: string | null;
  onSelect: (colorSlug: string) => void;
}

export function ColorSelector({ colors, variants, selected, onSelect }: ColorSelectorProps) {
  /** A colour is only offered if at least one of its sizes is in stock. */
  const availability = useMemo(() => {
    const map = new Map<string, boolean>();
    colors.forEach((color) => {
      map.set(
        color.slug,
        variants.some((variant) => variant.colorSlug === color.slug && variant.stock > 0),
      );
    });
    return map;
  }, [colors, variants]);

  const activeColor = colors.find((color) => color.slug === selected);

  return (
    <fieldset>
      <legend className="mb-3 flex items-baseline gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider">
        Colour
        {activeColor && <span className="font-normal normal-case text-ink-muted">{activeColor.name}</span>}
      </legend>

      <div className="flex flex-wrap gap-2.5">
        {colors.map((color) => {
          const isAvailable = availability.get(color.slug) ?? false;
          const isSelected = color.slug === selected;

          return (
            <button
              key={color.slug}
              type="button"
              onClick={() => onSelect(color.slug)}
              disabled={!isAvailable}
              aria-pressed={isSelected}
              aria-label={`${color.name}${isAvailable ? '' : ' (sold out)'}`}
              title={color.name}
              className={cn(
                'relative grid h-9 w-9 place-items-center rounded-full border-2 transition-all duration-fast',
                isSelected ? 'border-ink-black' : 'border-line hover:border-ink-muted',
                !isAvailable && 'cursor-not-allowed opacity-35',
              )}
            >
              <span
                className="h-6 w-6 rounded-full border border-black/10"
                style={{ backgroundColor: color.hex }}
              />
              {isSelected && (
                <Check
                  className={cn(
                    'absolute h-3.5 w-3.5',
                    // Pick a check colour that survives on light and dark swatches.
                    isLightHex(color.hex) ? 'text-ink-black' : 'text-white',
                  )}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Relative luminance, used only to decide check-mark contrast. */
function isLightHex(hex: string): boolean {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

interface SizeSelectorProps {
  variants: ProductVariant[];
  colorSlug: string | null;
  selected: string | null;
  onSelect: (size: string) => void;
  error?: string;
  onOpenSizeGuide?: () => void;
}

export function SizeSelector({
  variants,
  colorSlug,
  selected,
  onSelect,
  error,
  onOpenSizeGuide,
}: SizeSelectorProps) {
  /** Sizes for the chosen colour, ordered by the canonical size scale. */
  const sizes = useMemo(() => {
    const relevant = colorSlug
      ? variants.filter((variant) => variant.colorSlug === colorSlug)
      : variants;

    const unique = new Map<string, { size: string; stock: number }>();
    relevant.forEach((variant) => {
      const existing = unique.get(variant.size);
      unique.set(variant.size, {
        size: variant.size,
        stock: Math.max(existing?.stock ?? 0, variant.stock),
      });
    });

    return [...unique.values()].sort((a, b) => {
      const indexA = SIZE_ORDER.indexOf(a.size);
      const indexB = SIZE_ORDER.indexOf(b.size);
      if (indexA === -1 || indexB === -1) return a.size.localeCompare(b.size);
      return indexA - indexB;
    });
  }, [variants, colorSlug]);

  return (
    <fieldset>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <legend className="text-[0.6875rem] font-semibold uppercase tracking-wider">Size</legend>
        {onOpenSizeGuide && (
          <button
            type="button"
            onClick={onOpenSizeGuide}
            className="text-[0.6875rem] uppercase tracking-wider text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
          >
            Size guide
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {sizes.map(({ size, stock }) => {
          const isSoldOut = stock <= 0;
          const isSelected = size === selected;

          return (
            <button
              key={size}
              type="button"
              onClick={() => onSelect(size)}
              disabled={isSoldOut}
              aria-pressed={isSelected}
              aria-label={`Size ${size}${isSoldOut ? ' (sold out)' : ''}`}
              className={cn(
                'relative min-w-[3rem] rounded-xl border px-3 py-2.5 text-xs font-semibold uppercase transition-all duration-300 active:scale-95',
                isSelected
                  ? 'border-ink-black bg-ink-black text-canvas'
                  : 'border-line hover:border-ink-black',
                isSoldOut &&
                  'cursor-not-allowed border-line text-ink-subtle hover:border-line ' +
                    // Diagonal strike marks the size as unavailable at a glance.
                    'bg-[linear-gradient(to_top_right,transparent_calc(50%-0.5px),currentColor_50%,transparent_calc(50%+0.5px))]',
              )}
            >
              {size}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
