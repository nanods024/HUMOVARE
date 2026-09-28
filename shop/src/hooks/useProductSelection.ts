import { useEffect, useMemo, useState } from 'react';
import type { Product, ProductVariant } from '@/types';

/**
 * Owns colour/size/quantity selection for a product.
 *
 * Both the product page and the quick-view modal need exactly this logic, so
 * it lives here rather than being written twice. Selecting a colour that does
 * not carry the current size clears the size instead of silently leaving an
 * impossible combination selected.
 */
export function useProductSelection(product: Product | undefined) {
  const [colorSlug, setColorSlug] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sizeError, setSizeError] = useState('');

  // Default to the first colour that has any stock at all.
  useEffect(() => {
    if (!product) return;

    const firstAvailable =
      product.colors.find((color) =>
        product.variants.some((variant) => variant.colorSlug === color.slug && variant.stock > 0),
      ) ?? product.colors[0];

    setColorSlug(firstAvailable?.slug ?? null);
    setSize(null);
    setQuantity(1);
    setSizeError('');
  }, [product]);

  const selectedVariant: ProductVariant | null = useMemo(() => {
    if (!product || !colorSlug || !size) return null;
    return (
      product.variants.find(
        (variant) => variant.colorSlug === colorSlug && variant.size === size,
      ) ?? null
    );
  }, [product, colorSlug, size]);

  const maxQuantity = Math.min(selectedVariant?.stock ?? 10, 10);

  const chooseColor = (nextColor: string) => {
    setColorSlug(nextColor);

    // Keep the size only if the new colour actually offers it in stock.
    if (size && product) {
      const stillAvailable = product.variants.some(
        (variant) => variant.colorSlug === nextColor && variant.size === size && variant.stock > 0,
      );
      if (!stillAvailable) setSize(null);
    }
    setQuantity(1);
  };

  const chooseSize = (nextSize: string) => {
    setSize(nextSize);
    setSizeError('');
    setQuantity(1);
  };

  /** Returns true when a variant is chosen; otherwise raises the inline error. */
  const requireSize = () => {
    if (selectedVariant) return true;
    setSizeError('Please select a size');
    return false;
  };

  const price = selectedVariant?.price ?? product?.price ?? 0;

  return {
    colorSlug,
    size,
    quantity,
    sizeError,
    selectedVariant,
    maxQuantity,
    price,
    isSoldOut: (product?.stock ?? 0) <= 0,
    chooseColor,
    chooseSize,
    setQuantity: (next: number) => setQuantity(Math.max(1, Math.min(next, maxQuantity))),
    requireSize,
  };
}
