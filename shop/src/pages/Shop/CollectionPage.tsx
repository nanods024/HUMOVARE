import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { COLLECTION_ROUTES } from '@/constants';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { ProductListing } from '@/components/shop/ProductListing';
import { NotFoundPage } from '@/pages/NotFound/NotFoundPage';

/**
 * One component serves every collection URL (/men, /t-shirts, /sale…) —
 * including any category created later in the admin, which reaches here
 * through the router's catch-all `/:slug` rather than a hardcoded list.
 *
 * Whether the slug is a real category or a virtual collection is decided by
 * COLLECTION_ROUTES, which also drives the API parameter name — so the server
 * resolves it the same way the router does. A slug outside that map (any
 * newly created category) still resolves correctly: the param name just
 * falls back to `category`, which is what a real category always needs.
 */
export function CollectionPage({ slug }: { slug: string }) {
  const route = COLLECTION_ROUTES[slug];

  const { data, isError, isLoading } = useQuery({
    queryKey: queryKeys.categories.detail(slug),
    queryFn: () => categoriesApi.detail(slug).then((res) => res.category),
  });

  const title = data?.name ?? route?.title ?? slug;
  const description = data?.description ?? '';

  // Hooks must run every render regardless of the branch below, so SEO is
  // set here and the 404 swap happens only in the returned JSX.
  useSeo({
    title: data?.seo?.title || title,
    description:
      data?.seo?.description || description || `Shop ${title} at HUMOVARE.`,
    image: data?.image?.url,
    canonicalPath: `/${slug}`,
  });

  // A slug that matches no known route and no real category is a dead link,
  // not an empty category — show the 404, not a page that quietly has zero
  // products in it.
  if (isError && !isLoading) return <NotFoundPage />;

  const scope = route?.param === 'collection' ? { collection: slug } : { category: slug };

  return (
    <div>
      <div className="container-page py-6 md:py-10">
        <Breadcrumbs items={[{ label: 'Shop', to: '/shop' }, { label: title }]} />

        <header className="my-6 md:my-8">
          <h1 className="text-display-md">{title}</h1>
        </header>

        {description && (
          <p className="mb-8 mt-4 max-w-prose text-sm leading-relaxed text-ink-muted">
            {description}
          </p>
        )}

        <ProductListing
          scope={scope}
          emptyTitle={`Nothing in ${title} matches those filters`}
        />
      </div>
    </div>
  );
}

/** `/:slug` — a category created in the admin after the route list was written. */
export function CategoryRoute() {
  const { slug } = useParams();
  return <CollectionPage slug={slug ?? ''} />;
}

export default CollectionPage;
