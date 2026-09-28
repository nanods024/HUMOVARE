import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';

/**
 * A search box whose value reaches the URL (`?search=`) once typing pauses.
 * Written from an effect — updating the URL while rendering makes React warn
 * and can loop.
 */
export function useDebouncedSearch(
  current: string | undefined,
  setParam: (key: string, value: string | undefined) => void,
) {
  const [input, setInput] = useState(current ?? '');
  const debounced = useDebounce(input);

  useEffect(() => {
    if (debounced !== (current ?? '')) setParam('search', debounced || undefined);
  }, [debounced, current, setParam]);

  return [input, setInput] as const;
}

/**
 * Keeps table state (page, search, filters) in the URL.
 *
 * That makes every list view shareable and back-button friendly, and means a
 * reload does not silently throw away the filters an operator just set.
 */
export function useTableQuery(defaults: Record<string, string> = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const merged: Record<string, string> = { ...defaults };
    searchParams.forEach((value, key) => {
      merged[key] = value;
    });
    return merged;
  }, [searchParams, defaults]);

  const page = Math.max(1, Number(params.page) || 1);

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      const next = new URLSearchParams(searchParams);

      if (!value) next.delete(key);
      else next.set(key, value);

      // Any filter change invalidates the current page number.
      if (key !== 'page') next.delete('page');

      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const setPage = useCallback((next: number) => setParam('page', String(next)), [setParam]);

  const reset = useCallback(() => setSearchParams(new URLSearchParams(), { replace: true }), [setSearchParams]);

  return { params, page, setParam, setPage, reset };
}
