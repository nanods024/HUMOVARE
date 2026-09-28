import { Truck, Check } from 'lucide-react';
import { formatPrice } from '@/utils/format';

interface FreeShippingMeterProps {
  subtotal: number;
  threshold: number;
}

/**
 * Progress toward free shipping. A concrete "₹X away" figure converts far
 * better than a bare percentage bar, so the number leads.
 */
export function FreeShippingMeter({ subtotal, threshold }: FreeShippingMeterProps) {
  const qualified = subtotal >= threshold;
  const remaining = Math.max(0, threshold - subtotal);
  const progress = Math.min(100, threshold > 0 ? (subtotal / threshold) * 100 : 0);

  return (
    <div>
      <p className="flex items-center gap-2 text-xs">
        {qualified ? (
          <>
            <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span className="font-medium text-success">You have unlocked free shipping</span>
          </>
        ) : (
          <>
            <Truck className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <span className="text-ink-muted">
              Add <span className="font-semibold text-ink">{formatPrice(remaining)}</span> more for
              free shipping
            </span>
          </>
        )}
      </p>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress toward free shipping"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-slow ease-brand ${qualified ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export default FreeShippingMeter;
