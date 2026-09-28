import { useEffect, useMemo } from 'react';
import { useTableQuery } from '@/hooks/useTableQuery';

/** Rows per page on every admin list. */
export const PAGE_SIZE = 20;

/**
 * Pages a list that is already fully loaded — categories, roles, homepage
 * sections, Instagram posts — the same way the server pages orders and
 * products: 20 at a time, with the page number in the URL.
 *
 * `entries` keeps each item's position in the whole list, so reorder and edit
 * controls keep working on the real index, across page boundaries too.
 */
export function usePagedList<T>(items: readonly T[], pageSize = PAGE_SIZE) {
  const { page: requested, setPage } = useTableQuery();

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, totalPages);

  // Deleting the last row of the last page must not strand the view on an
  // empty page.
  useEffect(() => {
    if (requested > totalPages) setPage(totalPages);
  }, [requested, totalPages, setPage]);

  const entries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize).map((item, i) => ({ item, index: start + i }));
  }, [items, page, pageSize]);

  return { entries, page, totalPages, total, pageSize, setPage };
}
