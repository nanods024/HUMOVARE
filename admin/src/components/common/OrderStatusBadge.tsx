import { Badge } from '@/components/ui';
import type { OrderStatus } from '@/types';

const LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const TONES: Record<OrderStatus, 'neutral' | 'info' | 'primary' | 'success' | 'danger' | 'warning'> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  PROCESSING: 'info',
  SHIPPED: 'primary',
  OUT_FOR_DELIVERY: 'primary',
  DELIVERED: 'success',
  CANCELLED: 'danger',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONES[status] ?? 'neutral'}>{LABELS[status] ?? status}</Badge>;
}

export default OrderStatusBadge;
