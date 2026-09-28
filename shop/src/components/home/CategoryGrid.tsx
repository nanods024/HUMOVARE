import { Link } from 'react-router-dom';
import type { Category } from '@/types';
import { Image } from '@/components/ui/Image';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';

interface CategoryCardProps {
  category: Category;
  priority?: boolean;
}

export function CategoryCard({ category, priority }: CategoryCardProps) {
  return (
    <Link
      to={`/${category.slug}`}
      className="group relative block aspect-[4/5] overflow-hidden bg-surface rounded-2xl"
    >
      <Image
        image={category.image}
        alt={category.name}
        aspect={5 / 4}
        sizes="(min-width: 1024px) 24vw, (min-width: 640px) 46vw, 92vw"
        priority={priority}
        wrapperClassName="absolute inset-0"
        className="transition-transform duration-slow ease-brand group-hover:scale-[1.06]"
      />

      {/* Weighted to the bottom so the label always has something to sit on. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
      />

      <h3 className="absolute bottom-0 left-0 p-5 text-lg font-bold uppercase tracking-wide text-white md:text-xl">
        {category.name}
      </h3>
    </Link>
  );
}

/**
 * Category tiles — four across on desktop, two on mobile.
 * The label sits inside the image rather than beneath it, which keeps the row
 * reading as one band of photography.
 */
export function CategoryGrid({
  categories,
  isLoading,
  className,
}: {
  categories: Category[];
  isLoading?: boolean;
  className?: string;
}) {
  if (isLoading) {
    return (
      <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4', className)}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[4/5]" />
        ))}
      </div>
    );
  }

  if (!categories.length) return null;

  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4', className)}>
      {categories.map((category, index) => (
        <CategoryCard key={category.slug} category={category} priority={index < 2} />
      ))}
    </div>
  );
}

export default CategoryGrid;
