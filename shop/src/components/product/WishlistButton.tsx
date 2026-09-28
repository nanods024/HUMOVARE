import { Heart } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useWishlist } from '@/hooks/useWishlist';

interface WishlistButtonProps {
  productId: string;
  productName?: string;
  className?: string;
  size?: 'sm' | 'md';
}

/** The heart control. Filled + brand red once saved. */
export function WishlistButton({
  productId,
  productName,
  className,
  size = 'md',
}: WishlistButtonProps) {
  const { isWishlisted, toggle } = useWishlist();
  const saved = isWishlisted(productId);

  return (
    <button
      type="button"
      onClick={(event) => {
        // The card is wrapped in a link; do not navigate when hearting.
        event.preventDefault();
        event.stopPropagation();
        toggle(productId, productName);
      }}
      aria-pressed={saved}
      aria-label={
        saved
          ? `Remove ${productName ?? 'product'} from wishlist`
          : `Save ${productName ?? 'product'} to wishlist`
      }
      className={cn(
        'grid place-items-center rounded-full bg-canvas/90 text-ink shadow-sm backdrop-blur transition-all duration-300 hover:scale-110 hover:bg-canvas active:scale-[0.86] active:duration-150',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        className,
      )}
    >
      <Heart
        className={cn(
          size === 'sm' ? 'h-4 w-4' : 'h-[1.125rem] w-[1.125rem]',
          'transition-colors duration-fast',
          saved ? 'fill-primary text-primary' : 'text-ink',
        )}
        aria-hidden="true"
      />
    </button>
  );
}

export default WishlistButton;
