import { Link } from 'react-router-dom';

import type { CollectionSummary } from '@/api/collections';
import { Image } from '@/components/ui/Image';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';

/**
 * A curated collection tile.
 *
 * Wider than a category tile on purpose — a collection is an edit with a point
 * of view, so it gets room for its name and a line of copy rather than a label
 * stamped on a photograph.
 */
export function CollectionCard({
  collection,
  priority,
}: {
  collection: CollectionSummary;
  priority?: boolean;
}) {
  return (
    <Link
      to={`/collections/${collection.slug}`}
      className="group relative block aspect-[3/2] overflow-hidden bg-surface rounded-2xl"
    >
      <Image
        image={collection.image}
        alt={collection.name}
        aspect={2 / 3}
        sizes="(min-width: 1024px) 32vw, (min-width: 640px) 46vw, 92vw"
        priority={priority}
        wrapperClassName="absolute inset-0"
        className="transition-transform duration-slow ease-brand group-hover:scale-[1.05]"
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"
      />

      <div className="absolute inset-x-0 bottom-0 p-5">
        <h3 className="text-lg font-bold uppercase tracking-wide text-white md:text-xl">
          {collection.name}
        </h3>

        {collection.description && (
          <p className="mt-1 line-clamp-2 max-w-sm text-xs leading-relaxed text-white/75">
            {collection.description}
          </p>
        )}

        {typeof collection.productCount === 'number' && (
          <p className="mt-2 text-[0.625rem] font-semibold uppercase tracking-wider text-white/60">
            {collection.productCount} {collection.productCount === 1 ? 'piece' : 'pieces'}
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * The collections a merchandiser has published, as a row of tiles.
 *
 * Renders nothing at all when there are none: an empty heading on the home
 * page is worse than the section simply not being there.
 */
export function CollectionGrid({
  collections,
  isLoading,
  className,
}: {
  collections: CollectionSummary[];
  isLoading?: boolean;
  className?: string;
}) {
  if (isLoading) {
    return (
      <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4', className)}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[3/2]" />
        ))}
      </div>
    );
  }

  if (collections.length === 0) return null;

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4', className)}>
      {collections.map((collection, index) => (
        <CollectionCard key={collection._id} collection={collection} priority={index === 0} />
      ))}
    </div>
  );
}

export default CollectionGrid;
