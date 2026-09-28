import type { ProductColor } from '@/types';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Everything about the colours that would stop a save, in plain words.
 * Pages use it to disable Save and say why, instead of letting the server
 * answer with a field path.
 */
export function colourProblems(colors: ProductColor[]): string[] {
  const problems: string[] = [];
  if (colors.some((color) => !color.name.trim())) problems.push('Give every colour a name.');

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const color of colors) {
    const name = color.name.trim().toLowerCase();
    if (!name) continue;
    if (seen.has(name)) duplicates.add(color.name.trim());
    seen.add(name);
  }
  if (duplicates.size) problems.push(`Colour names must be different — "${[...duplicates][0]}" is used twice.`);

  const badHex = colors.find((color) => color.name.trim() && !HEX.test(color.hex.trim()));
  if (badHex) problems.push(`"${badHex.name.trim()}" needs a hex colour like #111111.`);
  return problems;
}

/** Colours as the API wants them — the server works out each slug from the name. */
export const colorsForApi = (colors: ProductColor[]) =>
  colors.map((color) => ({ name: color.name.trim(), hex: color.hex.trim() }));
