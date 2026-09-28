import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, TrendingUp, Clock, ArrowRight, ArrowUpRight, Loader2, SearchX } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Image } from '@/components/ui/Image';
import { useUIStore } from '@/store/uiStore';
import { useRecentStore } from '@/store/recentStore';
import { useDebounce } from '@/hooks/useDebounce';
import { productsApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { formatPrice } from '@/utils/format';
import { productImagePair } from '@/utils/image';
import { cn } from '@/utils/cn';

const TRENDING = ['Oversized tee', 'Hoodie', 'Black', 'Cargo', 'New drops'];
const MIN_QUERY_LENGTH = 2;

/** Bolds the part of a product name that matches what was typed. */
function Highlight({ text, term }: { text: string; term: string }) {
  const clean = term.trim();
  if (!clean) return <>{text}</>;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === clean.toLowerCase() ? (
          <mark key={index} className="rounded bg-primary/10 px-0.5 font-semibold text-primary">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function SearchOverlay() {
  const isOpen = useUIStore((state) => state.isSearchOpen);
  const close = useUIStore((state) => state.closeSearch);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [term, setTerm] = useState('');
  // Debounced so typing does not fire one request per keystroke.
  const debouncedTerm = useDebounce(term, 300);

  const recentSearches = useRecentStore((state) => state.searches);
  const recordSearch = useRecentStore((state) => state.recordSearch);
  const clearSearches = useRecentStore((state) => state.clearSearches);

  const isSearchable = debouncedTerm.trim().length >= MIN_QUERY_LENGTH;
  const isTyping = term.trim() !== debouncedTerm.trim() && term.trim().length >= MIN_QUERY_LENGTH;

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.products.search(debouncedTerm),
    queryFn: () => productsApi.search(debouncedTerm, 6),
    enabled: isOpen && isSearchable,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isOpen) {
      setTerm('');
      return undefined;
    }
    // After the panel has dropped in, so the caret lands in view.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const goToResults = (value: string) => {
    const clean = value.trim();
    if (clean.length < MIN_QUERY_LENGTH) return;

    recordSearch(clean);
    close();
    navigate(`/search?q=${encodeURIComponent(clean)}`);
  };

  const openProduct = (slug: string) => {
    recordSearch(debouncedTerm);
    close();
    navigate(`/product/${slug}`);
  };

  const products = data?.products ?? [];
  const busy = isTyping || (isFetching && isSearchable);

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      position="top"
      size="full"
      hideCloseButton
      className="h-[100dvh] rounded-none sm:h-auto sm:max-h-[85dvh] sm:rounded-b-3xl"
    >
      <div className="flex h-full flex-col bg-canvas">
        {/* Search field */}
        <div className="border-b border-line/70">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              goToResults(term);
            }}
            className="mx-auto flex w-full max-w-3xl items-center gap-3 px-gutter py-4 sm:py-6"
          >
            <label
              className={cn(
                'group flex h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface/70 px-4',
                'transition-[border-color,box-shadow,background-color] duration-300',
                'focus-within:border-primary focus-within:bg-canvas focus-within:shadow-[0_0_0_4px_rgb(var(--color-primary)/0.12)]',
              )}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <Search className="h-5 w-5 shrink-0 text-ink-muted transition-colors group-focus-within:text-primary" aria-hidden="true" />
              )}
              <input
                ref={inputRef}
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                type="search"
                enterKeyHint="search"
                placeholder="Search tees, hoodies, colours…"
                aria-label="Search products"
                className={cn(
                  'h-full min-w-0 flex-1 border-0 bg-transparent text-base text-ink placeholder:text-ink-subtle',
                  // The field's own frame shows focus; no second ring on the input.
                  'focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
                  '[&::-webkit-search-cancel-button]:appearance-none',
                )}
              />
              {term && (
                <button
                  type="button"
                  onClick={() => {
                    setTerm('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="grid h-7 w-7 shrink-0 animate-fade-in place-items-center rounded-full bg-ink/[0.07] text-ink-muted transition-colors hover:bg-ink hover:text-canvas"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </label>

            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition-all duration-300 hover:rotate-90 hover:border-ink hover:bg-ink hover:text-canvas"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>
        </div>

        {/* Suggestions or results */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-3xl px-gutter py-6 sm:py-8">
            {!isSearchable ? (
              <div className="search-stagger space-y-8">
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-ink-muted">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    Trending now
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {TRENDING.map((suggestion) => (
                      <li key={suggestion}>
                        <button
                          type="button"
                          onClick={() => goToResults(suggestion)}
                          className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-4 py-2 text-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-ink-black hover:bg-ink-black hover:text-canvas hover:shadow-lift active:scale-95"
                        >
                          {suggestion}
                          <ArrowUpRight className="h-3.5 w-3.5 opacity-50 transition-all duration-300 group-hover:opacity-100" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                {recentSearches.length > 0 && (
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-ink-muted">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        Recent searches
                      </h3>
                      <button
                        type="button"
                        onClick={clearSearches}
                        className="rounded-full px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                      >
                        Clear all
                      </button>
                    </div>
                    <ul className="-mx-3">
                      {recentSearches.map((recent) => (
                        <li key={recent}>
                          <button
                            type="button"
                            onClick={() => goToResults(recent)}
                            className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface"
                          >
                            <Clock className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{recent}</span>
                            <ArrowRight className="h-4 w-4 shrink-0 -translate-x-1 text-ink-subtle opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            ) : (
              <div aria-live="polite">
                {isFetching && !products.length ? (
                  <ul className="grid gap-3 sm:grid-cols-2" aria-label="Searching">
                    {[0, 1, 2, 3].map((key) => (
                      <li key={key} className="flex items-center gap-4 rounded-2xl p-2">
                        <span className="skeleton h-20 w-16 shrink-0" />
                        <span className="flex-1 space-y-2">
                          <span className="skeleton block h-3.5 w-3/4" />
                          <span className="skeleton block h-3 w-1/3" />
                          <span className="skeleton block h-3.5 w-1/4" />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : products.length ? (
                  <>
                    <p className="mb-4 text-sm text-ink-muted">
                      <span className="font-semibold text-ink">{products.length}</span> result{products.length === 1 ? '' : 's'} for “
                      <span className="font-semibold text-ink">{debouncedTerm}</span>”
                    </p>

                    <ul key={debouncedTerm} className="search-stagger grid gap-2 sm:grid-cols-2 sm:gap-3">
                      {products.map((product) => {
                        const { primary } = productImagePair(product);
                        return (
                          <li key={product._id}>
                            <button
                              type="button"
                              onClick={() => openProduct(product.slug)}
                              className="group flex w-full items-center gap-4 rounded-2xl border border-transparent p-2 text-left transition-all duration-300 hover:border-line hover:bg-canvas hover:shadow-[0_14px_30px_-20px_rgb(0_0_0/0.4)]"
                            >
                              <Image
                                image={primary}
                                alt=""
                                aspect={5 / 4}
                                width={120}
                                wrapperClassName="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-surface"
                                className="transition-transform duration-500 group-hover:scale-105"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink">
                                  <Highlight text={product.name} term={debouncedTerm} />
                                </span>
                                {product.category?.name && (
                                  <span className="mt-0.5 block text-xs text-ink-subtle">{product.category.name}</span>
                                )}
                                <span className="mt-1.5 flex items-baseline gap-2">
                                  <span className="text-sm font-bold">{formatPrice(product.price)}</span>
                                  {product.mrp > product.price && (
                                    <span className="text-xs text-ink-subtle line-through">{formatPrice(product.mrp)}</span>
                                  )}
                                  {product.discountPercentage > 0 && (
                                    <span className="text-[0.6875rem] font-semibold text-primary">{product.discountPercentage}% off</span>
                                  )}
                                </span>
                              </span>
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition-all duration-300 group-hover:bg-ink-black group-hover:text-canvas">
                                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    <button
                      type="button"
                      onClick={() => goToResults(debouncedTerm)}
                      className="group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-black py-3.5 text-xs font-semibold uppercase tracking-wider text-canvas transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary hover:shadow-[0_14px_30px_-14px_rgb(var(--color-primary)/0.8)] active:scale-[0.98]"
                    >
                      See all results for “{debouncedTerm}”
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <div className="flex animate-fade-up flex-col items-center py-10 text-center">
                    <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <SearchX className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <p className="mt-4 text-base font-semibold">Nothing matched “{debouncedTerm}”</p>
                    <p className="mt-1 text-sm text-ink-muted">Try a shorter word, or one of these:</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {TRENDING.slice(0, 4).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setTerm(suggestion)}
                          className="rounded-full border border-line px-4 py-2 text-sm transition-all duration-300 hover:border-ink-black hover:bg-ink-black hover:text-canvas"
                        >
                          {suggestion}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          close();
                          navigate('/shop');
                        }}
                        className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-primary-dark"
                      >
                        Shop everything
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default SearchOverlay;
