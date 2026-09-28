import type { ProductCardData } from '@/types';
import { cn } from '@/utils/cn';
import { ProductCard } from './ProductCard';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/States';

interface ProductGridProps {
  products: ProductCardData[];
  isLoading?: boolean;
  skeletonCount?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/**
 * Responsive product grid: 2 columns on mobile, 3 on tablet, 4 on desktop,
 * as specified. The first four cards render eagerly since they are almost
 * always above the fold.
 */
export function ProductGrid({
  products,
  isLoading,
  skeletonCount = 8,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Try removing a filter or browse another collection.',
  className,
}: ProductGridProps) {
  if (isLoading) return <ProductGridSkeleton count={skeletonCount} />;

  if (!products.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={{ label: 'Shop all', to: '/shop' }} />;
  }

  return (
    <div className={cn('acct-stagger grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-4 sm:gap-y-10 md:grid-cols-3 xl:grid-cols-4', className)}>
      {products.map((product, index) => (
        <ProductCard key={product._id} product={product} priority={index < 4} />
      ))}
    </div>
  );
}

/** Horizontally scrolling rail used by the homepage sections on mobile. */
export function ProductRail({ products, isLoading }: { products: ProductCardData[]; isLoading?: boolean }) {
  if (isLoading) {
    return <ProductGridSkeleton count={4} />;
  }
  if (!products.length) return null;

  return (
    <>
      {/* Mobile: a snapping rail keeps four products reachable with a thumb. */}
      <div className="scroll-rail -mx-gutter gap-4 px-gutter pb-2 md:hidden">
        {products.map((product) => (
          <div key={product._id} className="w-[46%] shrink-0 snap-start">
            <ProductCard product={product} />
          </div>
        ))}
      </div>

      <div className="hidden grid-cols-3 gap-x-4 gap-y-10 md:grid xl:grid-cols-4">
        {products.slice(0, 8).map((product, index) => (
          <ProductCard key={product._id} product={product} priority={index < 2} />
        ))}
      </div>
    </>
  );
}

export default ProductGrid;
