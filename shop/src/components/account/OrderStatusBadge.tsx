import { cn } from '@/utils/cn';
import { ORDER_STATUS_LABELS } from '@/constants';
import type { OrderStatus } from '@/types';

const TONE: Record<OrderStatus, string> = {
  PENDING: 'bg-surface text-ink-muted',
  CONFIRMED: 'bg-primary/10 text-primary',
  PROCESSING: 'bg-primary/10 text-primary',
  SHIPPED: 'bg-ink-black text-white',
  OUT_FOR_DELIVERY: 'bg-ink-black text-white',
  DELIVERED: 'bg-success/10 text-success',
  CANCELLED: 'bg-danger/10 text-danger',
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.625rem] font-bold uppercase tracking-wider',
        TONE[status],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 rounded-full bg-current',
          // A gentle pulse while the order is still moving.
          !['DELIVERED', 'CANCELLED'].includes(status) && 'auth-pulse',
        )}
      />
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default OrderStatusBadge;
