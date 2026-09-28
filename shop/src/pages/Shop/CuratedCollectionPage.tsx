import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { collectionsApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { ProductGrid } from '@/components/product/ProductGrid';
import { Image } from '@/components/ui/Image';
import { ErrorState } from '@/components/ui/States';
import { ButtonLink } from '@/components/ui/Button';

/**
 * One curated collection, in the order the merchandiser arranged it.
 *
 * Deliberately not the shared `ProductListing`: that engine filters and sorts,
 * and both of those would destroy the sequence, which is the whole point of a
 * collection. Customers who want to filter can use the collection facet on the
 * shop page instead — the link at the foot of the page takes them there.
 */
export function CuratedCollectionPage() {
  const { slug = '' } = useParams();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.collections.detail(slug),
    queryFn: () => collectionsApi.detail(slug).then((response) => response.collection),
    enabled: Boolean(slug),
  });

  useSeo({
    title: data?.seo?.title || data?.name || 'Collection',
    description:
      data?.seo?.description || data?.description || `Shop the ${data?.name ?? ''} collection at HUMOVARE.`,
    image: data?.image?.url,
    canonicalPath: `/collections/${slug}`,
  });

  if (isError) {
    return (
      <div className="container-page py-16">
        <ErrorState
          title="We could not find that collection"
          description="It may have been unpublished or renamed."
          onRetry={() => refetch()}
        />
        <div className="mt-6">
          <ButtonLink to="/shop" variant="outline">Shop everything</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div>
      {data?.image?.url && (
        <div className="relative h-44 overflow-hidden bg-canvas md:h-72">
          <Image
            image={data.image}
            alt=""
            aspect={0.3}
            sizes="100vw"
            priority
            width={1600}
            wrapperClassName="absolute inset-0"
            className="opacity-70"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/75 to-black/25" />

          <div className="container-page relative flex h-full flex-col justify-end pb-6">
            <p className="eyebrow text-white/70">Collection</p>
            <h1 className="mt-1 text-display-lg text-white">{data.name}</h1>
          </div>
        </div>
      )}

      <div className="container-page py-6 md:py-10">
        <Breadcrumbs
          items={[{ label: 'Collections', to: '/shop' }, { label: data?.name ?? 'Collection' }]}
        />

        {!data?.image?.url && (
          <header className="my-6 md:my-8">
            <p className="eyebrow mb-2">Collection</p>
            <h1 className="text-display-md">{data?.name ?? ''}</h1>
          </header>
        )}

        {data?.description && (
          <p className="mb-8 max-w-prose text-sm leading-relaxed text-ink-muted">
            {data.description}
          </p>
        )}

        <ProductGrid
          products={data?.products ?? []}
          isLoading={isLoading}
          skeletonCount={8}
          emptyTitle="Nothing in this collection yet"
          emptyDescription="Check back soon, or browse the full range."
        />

        <p className="mt-10 text-sm text-ink-muted">
          Want to narrow this down?{' '}
          <Link
            to={`/shop?collection=${slug}`}
            className="font-medium text-ink underline underline-offset-4 hover:text-primary"
          >
            Filter this collection on the shop page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export default CuratedCollectionPage;
