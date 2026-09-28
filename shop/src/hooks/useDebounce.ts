import { useEffect, useState } from 'react';

/**
 * Delays a value until it stops changing for `delay` ms.
 * Used by the search overlay so typing does not fire a request per keystroke.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
