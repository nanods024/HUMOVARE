import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Builds a compact page list: first, last, the current page and its
 * neighbours, with gaps collapsed to an ellipsis.
 */
function buildPages(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const output: (number | 'gap')[] = [];

  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) output.push('gap');
    output.push(page);
  });

  return output;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const pages = buildPages(currentPage, totalPages);

  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
        className="grid h-10 w-10 place-items-center border border-line transition-colors hover:border-ink-black disabled:opacity-35 disabled:hover:border-line rounded-xl"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      {pages.map((page, index) =>
        page === 'gap' ? (
          <span key={`gap-${index}`} className="px-2 text-sm text-ink-subtle" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? 'page' : undefined}
            className={cn(
              'h-10 min-w-10 rounded-xl border px-3 text-sm transition-all duration-300',
              page === currentPage
                ? 'border-ink-black bg-ink-black text-canvas'
                : 'border-line hover:border-ink-black',
            )}
          >
            {page}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
        className="grid h-10 w-10 place-items-center border border-line transition-colors hover:border-ink-black disabled:opacity-35 disabled:hover:border-line rounded-xl"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

export default Pagination;
