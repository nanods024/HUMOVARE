import type { Category } from '@/types';

/**
 * A product's style (Oversized, Minimal…) lives in its `collections` list,
 * alongside any other non-product-type categories. These helpers read and
 * replace just the style entry without disturbing the rest.
 */

type Ref = string | { _id: string };

const idOf = (entry: Ref) => (typeof entry === 'string' ? entry : entry._id);

/** The style currently on the product, or '' for none. */
export function styleOf(collections: Ref[] | undefined, styles: Category[]): string {
  const styleIds = new Set(styles.map((style) => style._id));
  return (collections ?? []).map(idOf).find((id) => styleIds.has(id)) ?? '';
}

/** The collections list with its style swapped for `styleId` ('' removes it). */
export function withStyle(collections: Ref[] | undefined, styles: Category[], styleId: string): string[] {
  const styleIds = new Set(styles.map((style) => style._id));
  const rest = (collections ?? []).map(idOf).filter((id) => !styleIds.has(id));
  return styleId ? [...rest, styleId] : rest;
}
