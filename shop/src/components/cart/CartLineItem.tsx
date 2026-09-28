import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2, Heart } from 'lucide-react';
import type { CartLine } from '@/types';
import { cn } from '@/utils/cn';
import { formatPrice } from '@/utils/format';
import { useWishlist } from '@/hooks/useWishlist';

interface CartLineItemProps {
  line: CartLine;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  /** Compact is the drawer; the full cart page uses the roomier layout. */
  compact?: boolean;
}

export function CartLineItem({ line, onQuantityChange, onRemove, compact }: CartLineItemProps) {
  const { toggle, isWishlisted } = useWishlist();

  const atMax = line.quantity >= line.maxQuantity;
  const atMin = line.quantity <= 1;

  return (
    <div className={cn('flex gap-4', compact ? 'items-start' : 'items-start md:gap-6')}>
      <Link to={`/product/${line.slug}`} className="shrink-0">
        {line.image ? (
          <img
            src={line.image}
            alt=""
            loading="lazy"
            className={cn('rounded-xl bg-surface object-cover', compact ? 'h-24 w-20' : 'h-32 w-[6.5rem] md:h-40 md:w-32')}
          />
        ) : (
          <div className={cn('rounded-xl bg-surface', compact ? 'h-24 w-20' : 'h-32 w-[6.5rem] md:h-40 md:w-32')} />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-sans text-sm font-medium normal-case">
              <Link to={`/product/${line.slug}`} className="hover:text-primary">
                {line.name}
              </Link>
            </h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              {line.color} · Size {line.size}
            </p>
          </div>

          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${line.name} from bag`}
            className="-mt-1 -mr-1 rounded-full p-1.5 text-ink-subtle transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{formatPrice(line.price)}</span>
          {line.mrp > line.price && (
            <span className="text-xs text-ink-subtle line-through">{formatPrice(line.mrp)}</span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center border border-line overflow-hidden rounded-xl" role="group" aria-label="Quantity">
            <button
              type="button"
              onClick={() => onQuantityChange(line.quantity - 1)}
              disabled={atMin}
              aria-label="Decrease quantity"
              className="grid h-9 w-9 place-items-center transition-colors hover:bg-surface disabled:opacity-35"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <span className="w-9 text-center text-sm tabular-nums" aria-live="polite">
              {line.quantity}
            </span>

            <button
              type="button"
              onClick={() => onQuantityChange(line.quantity + 1)}
              disabled={atMax}
              aria-label="Increase quantity"
              className="grid h-9 w-9 place-items-center transition-colors hover:bg-surface disabled:opacity-35"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {!compact && (
            <button
              type="button"
              onClick={() => toggle(line.productId, line.name)}
              className="inline-flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-muted transition-colors hover:text-primary"
            >
              <Heart
                className={cn('h-3.5 w-3.5', isWishlisted(line.productId) && 'fill-primary text-primary')}
                aria-hidden="true"
              />
              {isWishlisted(line.productId) ? 'Saved' : 'Move to wishlist'}
            </button>
          )}

          <span className="ml-auto text-sm font-semibold">{formatPrice(line.lineTotal)}</span>
        </div>

        {atMax && (
          <p className="mt-1 text-[0.6875rem] text-warning">
            Only {line.maxQuantity} available in this size
          </p>
        )}
      </div>
    </div>
  );
}

export default CartLineItem;
