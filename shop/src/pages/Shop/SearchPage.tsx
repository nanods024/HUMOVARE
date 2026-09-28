import { useSearchParams } from 'react-router-dom';
import { useSeo } from '@/hooks/useSeo';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { ProductListing } from '@/components/shop/ProductListing';
import { EmptyState } from '@/components/ui/States';
import { useUIStore } from '@/store/uiStore';

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const term = (searchParams.get('q') ?? '').trim();
  const openSearch = useUIStore((state) => state.openSearch);

  useSeo({
    title: term ? `Search: ${term}` : 'Search',
    description: term ? `HUMOVARE search results for “${term}”.` : 'Search the HUMOVARE catalogue.',
    // Search result pages are thin content; keep them out of the index.
    noindex: true,
  });

  return (
    <div className="container-page py-6 md:py-10">
      <Breadcrumbs items={[{ label: 'Search' }]} />

      <header className="my-6 md:my-8">
        <h1 className="text-display-md">{term ? `Results for “${term}”` : 'Search'}</h1>
      </header>

      {term ? (
        <ProductListing
          searchTerm={term}
          emptyTitle={`Nothing matched “${term}”`}
        />
      ) : (
        <EmptyState
          title="What are you looking for?"
          description="Search by product name, colour or category."
          action={{ label: 'Browse everything', to: '/shop' }}
        />
      )}

      {!term && (
        <div className="flex justify-center pb-10">
          <button
            type="button"
            onClick={openSearch}
            className="text-xs uppercase tracking-wider underline underline-offset-4"
          >
            Open search
          </button>
        </div>
      )}
    </div>
  );
}

export default SearchPage;
