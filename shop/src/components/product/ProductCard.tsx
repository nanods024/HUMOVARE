import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, ShoppingBag } from 'lucide-react';
import type { ProductCardData } from '@/types';
import { cn } from '@/utils/cn';
import { formatPrice } from '@/utils/format';
import { productImagePair, GRID_SIZES } from '@/utils/image';
import { LOW_STOCK_THRESHOLD } from '@/constants';
import { Image } from '@/components/ui/Image';
import { Badge } from '@/components/ui/Badge';
import { WishlistButton } from './WishlistButton';
import { useUIStore } from '@/store/uiStore';
import { useCanHover } from '@/hooks/useMediaQuery';

interface ProductCardProps {
  product: ProductCardData;
  /** First row of the first page should not lazy-load. */
  priority?: boolean;
  className?: string;
}

/**
 * The single product tile used by every grid and rail in the storefront.
 *
 * Desktop gets a secondary-image hover and reveal actions; touch devices get
 * an always-visible quick-view button instead, because a hover-only affordance
 * is unreachable there.
 */
export const ProductCard = memo(function ProductCard({
  product,
  priority = false,
  className,
}: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const canHover = useCanHover();
  const openQuickView = useUIStore((state) => state.openQuickView);

  const { primary, secondary } = productImagePair(product);
  const isSoldOut = product.stock <= 0;
  const isLowStock = !isSoldOut && product.stock <= LOW_STOCK_THRESHOLD;
  const showSecondary = canHover && isHovered && secondary;

  return (
    <article
      className={cn('group relative flex flex-col', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative">
        <Link
          to={`/product/${product.slug}`}
          className="block focus-visible:outline-none"
          aria-label={product.name}
        >
          <div className="relative aspect-product overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow duration-500 group-hover:shadow-[0_22px_44px_-24px_rgb(0_0_0/0.45)]">
            {/* The two pictures are stacked layers, and the fade has to be on
                the layer rather than on the <img> inside it: each layer paints
                an opaque surface tint behind its picture, so fading only the
                image would leave that tint covering the one underneath — a
                card that shows nothing but flat grey. */}
            <Image
              image={primary}
              alt={product.name}
              aspect={5 / 4}
              sizes={GRID_SIZES}
              priority={priority}
              wrapperClassName={cn(
                'absolute inset-0 transition-opacity duration-slow ease-brand',
                showSecondary ? 'opacity-0' : 'opacity-100',
              )}
              className={cn(
                'transition-transform duration-slow ease-brand',
                !isSoldOut && canHover && 'group-hover:scale-[1.03]',
              )}
            />

            {secondary && canHover && (
              <Image
                image={secondary}
                alt=""
                aspect={5 / 4}
                sizes={GRID_SIZES}
                wrapperClassName={cn(
                  'absolute inset-0 transition-opacity duration-slow ease-brand',
                  showSecondary ? 'opacity-100' : 'opacity-0',
                )}
                className={cn(
                  'transition-transform duration-slow ease-brand',
                  !isSoldOut && 'group-hover:scale-[1.03]',
                )}
              />
            )}

            {isSoldOut && (
              <div className="absolute inset-0 grid place-items-center bg-canvas/65">
                <span className="rounded-full border border-ink-black bg-canvas px-4 py-2 text-[0.625rem] font-bold uppercase tracking-brand">
                  Sold out
                </span>
              </div>
            )}
          </div>
        </Link>

        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1.5">
          {product.discountPercentage > 0 && !isSoldOut && (
            <Badge variant="sale">{product.discountPercentage}% off</Badge>
          )}
          {product.isNewDrop && !isSoldOut && <Badge variant="new">New</Badge>}
          {product.isBestSeller && !product.isNewDrop && !isSoldOut && (
            <Badge variant="bestseller">Bestseller</Badge>
          )}
          {isLowStock && <Badge variant="lowstock">Only {product.stock} left</Badge>}
        </div>

        <WishlistButton
          productId={product._id}
          productName={product.name}
          className="absolute right-2 top-2"
        />

        {/* Quick view: revealed on hover for mouse users, always shown on touch. */}
        {!isSoldOut && (
          <button
            type="button"
            onClick={() => openQuickView(product.slug)}
            className={cn(
              'absolute inset-x-2 bottom-2 flex h-10 items-center justify-center gap-2 rounded-xl shadow-lift backdrop-blur',
              'bg-canvas/90 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-black',
              'transition-[opacity,transform,background-color,color] duration-300 ease-brand hover:bg-ink-black hover:text-canvas',
              canHover
                ? 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100'
                : 'opacity-100',
            )}
          >
            {canHover ? (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Quick view
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 px-0.5 pt-3">
        {product.category?.name && (
          <p className="text-[0.625rem] uppercase tracking-wider text-ink-subtle">
            {product.category.name}
          </p>
        )}

        <h3 className="line-clamp-2 font-sans text-sm font-medium normal-case leading-snug text-ink">
          <Link to={`/product/${product.slug}`} className="hover:text-primary">
            {product.name}
          </Link>
        </h3>

        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1">
          <span className="text-sm font-semibold text-ink">{formatPrice(product.price)}</span>
          {product.mrp > product.price && (
            <span className="text-xs text-ink-subtle line-through">{formatPrice(product.mrp)}</span>
          )}
        </div>

        {product.colors?.length > 1 && (
          <div className="flex items-center gap-1.5 pt-1.5" aria-label="Available colours">
            {product.colors.slice(0, 5).map((color) => (
              <span
                key={color.slug}
                title={color.name}
                className="h-3 w-3 rounded-full border border-line"
                style={{ backgroundColor: color.hex }}
              />
            ))}
            {product.colors.length > 5 && (
              <span className="text-[0.625rem] text-ink-subtle">+{product.colors.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
});

export default ProductCard;
