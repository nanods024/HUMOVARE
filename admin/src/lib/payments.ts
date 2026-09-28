import type { PaymentStatus } from '@/types';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';

/** Payment status in words an operator reads at a glance. */
export const PAYMENT_STATUS_VIEW: Record<PaymentStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Awaiting payment', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Payment failed', tone: 'danger' },
  CANCELLED: { label: 'Not charged', tone: 'neutral' },
};

export const paymentStatusView = (status: string) =>
  PAYMENT_STATUS_VIEW[status as PaymentStatus] ?? { label: status, tone: 'neutral' as Tone };

/** Paise → "₹2,499.00". */
export const formatPaise = (paise: number | null | undefined) =>
  typeof paise === 'number'
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)
    : '—';
