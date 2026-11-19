import { useEffect, useState } from 'react';

import { Textarea } from '@/components/ui';

export const HIGHLIGHTS_EXAMPLE = ['240 GSM combed cotton', 'Rhinestone chest graphic', 'Ribbed crew neck'].join('\n');
export const CARE_EXAMPLE = ['Machine wash cold, inside out', 'Do not bleach', 'Do not iron on print'].join('\n');

/** Turns textarea text into a clean list: one trimmed, non-empty item per line. */
export const toLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * A list of short strings edited as one item per line.
 *
 * The raw text is kept locally so blank lines and trailing spaces survive
 * while typing; only the cleaned list is reported upwards.
 */
export function LinesInput({
  label,
  value,
  onChange,
  hint,
  placeholder,
  rows = 5,
  disabled,
}: {
  label: string;
  value: string[] | undefined;
  onChange: (next: string[]) => void;
  hint?: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  const joined = (value ?? []).join('\n');
  const [text, setText] = useState(joined);

  // Follow outside changes (a save, a discard, another product) without
  // fighting the local text when it already says the same thing.
  useEffect(() => {
    setText((current) => (toLines(current).join('\n') === joined ? current : joined));
  }, [joined]);

  return (
    <Textarea
      label={label}
      rows={rows}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      hint={hint ?? 'One per line.'}
      onChange={(event) => {
        setText(event.target.value);
        onChange(toLines(event.target.value));
      }}
    />
  );
}
