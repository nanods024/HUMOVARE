import { useMemo, useState } from 'react';
import { Plus, X, SlidersHorizontal, AlertTriangle, Trash2 } from 'lucide-react';

import { cn } from '@/utils/cn';
import type { ProductColor } from '@/types';
import { colourProblems } from '@/lib/productColours';
import { Button, Input } from '@/components/ui';

/** A variant as the form holds it — `_id` and `sku` come back from the server. */
export interface VariantDraft {
  _id?: string;
  sku?: string;
  size: string;
  color: string;
  colorSlug?: string;
  stock: number;
  price?: number | null;
}

/** Offered as chips so the common sizes are one click rather than typed. */
const SUGGESTED_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38'];

const key = (color: string, size: string) => `${color.toLowerCase()}::${size.toLowerCase()}`;

/**
 * Colours × sizes, with one stock box per combination.
 *
 * A variant is what is actually sold, but nobody thinks in variants — they
 * think "this tee comes in black and white, S to XL". So the form asks for
 * colours and sizes, and the grid underneath is the product of the two. Adding
 * a colour adds a column of boxes rather than making you invent five rows.
 *
 * Price overrides are real but rare, so they sit behind a disclosure instead
 * of putting an empty box next to every stock figure.
 */
export function VariantsEditor({
  colors,
  variants,
  onColorsChange,
  onVariantsChange,
  disabled,
}: {
  colors: ProductColor[];
  variants: VariantDraft[];
  onColorsChange: (next: ProductColor[]) => void;
  onVariantsChange: (next: VariantDraft[]) => void;
  disabled?: boolean;
}) {
  // Sizes are derived from the variants (the server recomputes them on save),
  // so the grid stays correct for a product that was created elsewhere.
  const sizes = useMemo(() => {
    const seen: string[] = [];
    for (const variant of variants) {
      if (!seen.includes(variant.size)) seen.push(variant.size);
    }
    return seen.sort((a, b) => {
      const indexA = SUGGESTED_SIZES.indexOf(a);
      const indexB = SUGGESTED_SIZES.indexOf(b);
      if (indexA === -1 || indexB === -1) return a.localeCompare(b);
      return indexA - indexB;
    });
  }, [variants]);

  const [newSize, setNewSize] = useState('');
  const [showOverrides, setShowOverrides] = useState(false);
  // A colour that still holds stock needs a second click to remove, so a
  // stray click cannot wipe out counts.
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const byKey = useMemo(() => {
    const map = new Map<string, VariantDraft>();
    for (const variant of variants) map.set(key(variant.color, variant.size), variant);
    return map;
  }, [variants]);

  /** Rebuilds the grid, keeping every stock figure that still has a home. */
  const rebuild = (nextColors: ProductColor[], nextSizes: string[]) => {
    const next: VariantDraft[] = [];
    for (const color of nextColors) {
      for (const size of nextSizes) {
        const existing = byKey.get(key(color.name, size));
        next.push(existing ? { ...existing, color: color.name } : { size, color: color.name, stock: 0 });
      }
    }
    onVariantsChange(next);
  };

  const addColor = () => {
    // No slug: the server derives it from the name when the product is saved.
    const next = [...colors, { name: '', hex: '#111111' } as ProductColor];
    onColorsChange(next);
    if (sizes.length > 0) rebuild(next, sizes);
  };

  const setColor = (index: number, field: 'name' | 'hex', value: string) => {
    const previous = colors[index];
    const next = colors.map((color, i) => {
      if (i !== index) return color;
      if (field === 'hex') return { ...color, hex: value };
      // A renamed colour gets a fresh slug from its new name on save.
      const { slug: _stale, ...rest } = color;
      return { ...rest, name: value } as ProductColor;
    });
    onColorsChange(next);

    if (field === 'name') {
      // Rename in place so the stock already entered under the old name follows.
      onVariantsChange(
        variants.map((variant) =>
          variant.color === previous.name ? { ...variant, color: value, colorSlug: undefined, sku: undefined } : variant,
        ),
      );
    }
  };

  const removeColor = (index: number) => {
    setConfirmRemove(null);
    const removed = colors[index];
    const next = colors.filter((_, i) => i !== index);
    onColorsChange(next);
    onVariantsChange(variants.filter((variant) => variant.color !== removed.name));
  };

  const addSize = (size: string) => {
    const clean = size.trim().toUpperCase();
    if (!clean || sizes.includes(clean)) return;
    rebuild(colors, [...sizes, clean]);
    setNewSize('');
  };

  const removeSize = (size: string) => onVariantsChange(variants.filter((variant) => variant.size !== size));

  const setStock = (color: string, size: string, stock: number) => {
    const exists = byKey.has(key(color, size));
    onVariantsChange(
      exists
        ? variants.map((variant) =>
            variant.color === color && variant.size === size ? { ...variant, stock } : variant,
          )
        : [...variants, { color, size, stock }],
    );
  };

  const setOverride = (color: string, size: string, price: number | null) =>
    onVariantsChange(
      variants.map((variant) =>
        variant.color === color && variant.size === size ? { ...variant, price } : variant,
      ),
    );

  const totalStock = variants.reduce((total, variant) => total + (Number(variant.stock) || 0), 0);
  const problems = colourProblems(colors);

  return (
    <div className="space-y-6">
      {/* ── Colours ───────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">1 · Colours</h3>
            <p className="text-xs text-ink-muted">The swatch customers tap on the product page.</p>
          </div>
          <Button size="sm" variant="outline" onClick={addColor} disabled={disabled}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add colour
          </Button>
        </div>

        {colors.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
            Add a colour to begin. Every product needs at least one.
          </p>
        ) : (
          <ul className="space-y-2">
            {colors.map((color, index) => (
              <li key={index} className="flex items-end gap-2">
                <Input
                  label={index === 0 ? 'Name' : undefined}
                  aria-label={`Colour ${index + 1} name`}
                  value={color.name}
                  onChange={(event) => setColor(index, 'name', event.target.value)}
                  placeholder="Oxblood"
                  disabled={disabled}
                  containerClassName="flex-1"
                />
                <div>
                  {index === 0 && <p className="field-label">Swatch</p>}
                  <input
                    type="color"
                    aria-label={`Colour ${index + 1} swatch`}
                    value={/^#[0-9a-fA-F]{6}$/.test(color.hex) ? color.hex : '#111111'}
                    onChange={(event) => setColor(index, 'hex', event.target.value)}
                    disabled={disabled}
                    className="h-9 w-14 cursor-pointer rounded-md border border-line bg-panel p-1"
                  />
                </div>
                <Input
                  label={index === 0 ? 'Hex' : undefined}
                  aria-label={`Colour ${index + 1} hex`}
                  value={color.hex}
                  onChange={(event) => setColor(index, 'hex', event.target.value)}
                  disabled={disabled}
                  containerClassName="w-28"
                />
                <button
                  type="button"
                  onClick={() => removeColor(index)}
                  disabled={disabled}
                  aria-label={`Remove ${color.name || `colour ${index + 1}`}`}
                  className="mb-0.5 rounded p-2 text-ink-muted hover:bg-danger/10 hover:text-danger"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {problems.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-lg bg-warning/10 px-3 py-2" role="alert">
            {problems.map((problem) => (
              <li key={problem} className="flex items-center gap-1.5 text-xs font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {problem}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Sizes ─────────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-ink">2 · Sizes</h3>
        <p className="mb-2 text-xs text-ink-muted">Tap the sizes this piece is made in.</p>

        <div className="flex flex-wrap gap-2">
          {SUGGESTED_SIZES.map((size) => {
            const isOn = sizes.includes(size);
            return (
              <button
                key={size}
                type="button"
                onClick={() => (isOn ? removeSize(size) : addSize(size))}
                disabled={disabled || colors.length === 0}
                aria-pressed={isOn}
                className={cn(
                  'min-w-[3rem] rounded-md border px-3 py-2 text-xs font-semibold uppercase transition-colors disabled:opacity-40',
                  isOn ? 'border-primary bg-primary text-white' : 'border-line text-ink-muted hover:border-ink',
                )}
              >
                {size}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-end gap-2">
          <Input
            aria-label="Custom size"
            value={newSize}
            onChange={(event) => setNewSize(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addSize(newSize);
              }
            }}
            placeholder="Another size, e.g. 3XL"
            disabled={disabled || colors.length === 0}
            containerClassName="w-56"
          />
          <Button size="sm" variant="outline" onClick={() => addSize(newSize)} disabled={disabled || !newSize.trim()}>
            Add
          </Button>
        </div>

        {colors.length === 0 && (
          <p className="mt-2 text-xs text-ink-subtle">Add a colour first — sizes are counted per colour.</p>
        )}
      </section>

      {/* ── Stock grid ────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">3 · Stock</h3>
            <p className="text-xs text-ink-muted">
              How many of each combination you hold. {totalStock} in total.
            </p>
          </div>
          {variants.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowOverrides((open) => !open)} disabled={disabled}>
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              {showOverrides ? 'Hide' : 'Price overrides'}
            </Button>
          )}
        </div>

        {colors.length === 0 || sizes.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
            Pick colours and sizes above and the grid appears here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50 text-xs text-ink-muted">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Colour</th>
                  {sizes.map((size) => (
                    <th key={size} scope="col" className="px-2 py-2.5 text-center font-medium">
                      {size}
                    </th>
                  ))}
                  <th scope="col" className="w-px px-3 py-2.5">
                    <span className="sr-only">Remove colour</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {colors.map((color, colorIndex) => (
                  <tr key={color.name || color.hex}>
                    <th scope="row" className="px-4 py-2 text-left font-medium text-ink">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 rounded-full border border-line"
                          style={{ backgroundColor: color.hex }}
                        />
                        {color.name || <span className="text-ink-subtle">Unnamed</span>}
                      </span>
                    </th>
                    {sizes.map((size) => {
                      const variant = byKey.get(key(color.name, size));
                      return (
                        <td key={size} className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            aria-label={`Stock for ${color.name} ${size}`}
                            value={String(variant?.stock ?? 0)}
                            onChange={(event) => setStock(color.name, size, Math.max(0, Number(event.target.value)))}
                            disabled={disabled}
                            className={cn(
                              'tabular h-9 w-16 rounded-md border bg-panel text-center text-sm focus:border-primary focus:outline-none',
                              (variant?.stock ?? 0) === 0 ? 'border-line text-ink-subtle' : 'border-line text-ink',
                            )}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      {confirmRemove === colorIndex ? (
                        <span className="inline-flex animate-fade-in items-center gap-1">
                          <button
                            type="button"
                            onClick={() => removeColor(colorIndex)}
                            className="rounded-md bg-danger px-2.5 py-1 text-xs font-semibold text-white hover:bg-danger/90"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemove(null)}
                            aria-label="Keep this colour"
                            className="rounded-md p-1 text-ink-muted hover:bg-canvas hover:text-ink"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const held = variants
                              .filter((variant) => variant.color === color.name)
                              .reduce((total, variant) => total + (Number(variant.stock) || 0), 0);
                            if (held > 0) setConfirmRemove(colorIndex);
                            else removeColor(colorIndex);
                          }}
                          disabled={disabled}
                          aria-label={`Remove ${color.name || 'this colour'}`}
                          title="Remove this colour"
                          className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showOverrides && variants.length > 0 && (
          <div className="mt-3 space-y-2 rounded-md border border-line bg-canvas p-3">
            <p className="text-xs text-ink-muted">
              Leave blank to charge the product price. Only fill these in when one
              combination genuinely costs more.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {variants.map((variant) => (
                <li key={`${variant.color}-${variant.size}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                    {variant.color} · {variant.size}
                  </span>
                  <input
                    type="number"
                    min={0}
                    aria-label={`Price override for ${variant.color} ${variant.size}`}
                    value={variant.price == null ? '' : String(variant.price)}
                    onChange={(event) =>
                      setOverride(
                        variant.color,
                        variant.size,
                        event.target.value === '' ? null : Number(event.target.value),
                      )
                    }
                    disabled={disabled}
                    placeholder="—"
                    className="tabular h-9 w-24 rounded-md border border-line bg-panel px-2 text-right text-sm focus:border-primary focus:outline-none"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

export default VariantsEditor;
