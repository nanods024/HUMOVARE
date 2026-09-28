import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, ExternalLink, Truck, XCircle, MapPin, CreditCard, ShoppingBag, Navigation } from 'lucide-react';

import { ordersApi, getErrorMessage } from '@/api';
import { goToPhonePe } from '@/utils/phonepe';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { toast } from '@/store/toastStore';
import { formatPrice, formatDate, formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ORDER_TIMELINE, ORDER_STATUS_LABELS, CANCELLABLE_STATUSES } from '@/constants';
import { Button } from '@/components/ui/Button';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { OrderStatusBadge } from '@/components/account/OrderStatusBadge';
import type { Order } from '@/types';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: () => ordersApi.detail(id).then((res) => res.order),
    enabled: Boolean(id),
  });

  useSeo({ title: data ? `Order ${data.orderNumber}` : 'Order', noindex: true });

  const cancelOrder = useMutation({
    mutationFn: () => ordersApi.cancel(id, 'Cancelled from account'),
    onSuccess: ({ order }) => {
      queryClient.setQueryData(queryKeys.orders.detail(id), order);
      // The lists are stale; the detail was just set from the response.
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.lists });
      toast.success('Order cancelled');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not cancel this order')),
  });

  const payNow = useMutation({
    mutationFn: () => ordersApi.retryPayment(id).then((res) => res.payment),
    onSuccess: (payment) => {
      if (payment.status === 'redirect' && goToPhonePe(payment.redirectUrl)) return;
      if (payment.status === 'paid') toast.success('This order is already paid');
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(id) });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not start the payment')),
  });

  if (isLoading) return <ListSkeleton rows={4} />;
  if (isError || !data) {
    return <ErrorState title="Order not found" onRetry={() => refetch()} />;
  }

  const isCancelled = data.orderStatus === 'CANCELLED';
  const awaitingPayment = data.paymentMethod === 'ONLINE' && data.orderStatus === 'PENDING';
  // A paid online order is cancelled by support, not from here.
  const paidOnline = data.paymentMethod === 'ONLINE' && data.paymentStatus === 'PAID';
  const canCancel = CANCELLABLE_STATUSES.includes(data.orderStatus) && !paidOnline;
  const currentStep = ORDER_TIMELINE.indexOf(data.orderStatus as (typeof ORDER_TIMELINE)[number]);

  /** Most recent timestamp recorded for a given status, if it happened. */
  const timestampFor = (status: string) =>
    data.statusHistory.find((event) => event.status === status)?.at;

  const progress = isCancelled ? 0 : Math.max(0, ((currentStep + 1) / ORDER_TIMELINE.length) * 100);

  return (
    <div className="acct-stagger space-y-6">
      <Link
        to="/account/orders"
        className="group inline-flex w-fit items-center gap-2 rounded-full border border-line bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted transition-all duration-300 hover:border-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-0.5" aria-hidden="true" />
        All orders
      </Link>

      <header className="acct-card relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-ink-subtle">Order</p>
            <h2 className="mt-1 font-sans text-xl font-bold normal-case tracking-wide sm:text-2xl">{data.orderNumber}</h2>
            <p className="mt-1 text-sm text-ink-muted">Placed on {formatDate(data.createdAt)}</p>
          </div>
          <div className="text-right">
            <OrderStatusBadge status={data.orderStatus} />
            <p className="mt-3 text-[0.6875rem] uppercase tracking-wider text-ink-subtle">Total</p>
            <p className="text-lg font-bold">{formatPrice(data.total)}</p>
          </div>
        </div>
        {!isCancelled && (
          <div className="relative mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-dark to-primary transition-[width] duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {currentStep >= 0 ? ORDER_STATUS_LABELS[ORDER_TIMELINE[currentStep]] : 'Awaiting confirmation'}
            </p>
          </div>
        )}
      </header>

      {awaitingPayment && (
        <section className="rounded-[1.25rem] border border-warning/40 bg-warning/5 p-5 sm:p-6">
          <p className="text-sm font-semibold">
            {data.paymentStatus === 'FAILED' ? 'Payment was not completed' : 'Waiting for your PhonePe payment'}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Your items are held for you. If you have already paid, this updates on its own within a minute.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => payNow.mutate()} isLoading={payNow.isPending}>
              {data.paymentStatus === 'FAILED' ? 'Retry payment' : 'Complete payment'}
            </Button>
            <Link to={`/payment/status?order=${data._id}`} className="self-center text-sm underline">
              Check payment status
            </Link>
          </div>
        </section>
      )}

      {/* Tracking stepper. A cancelled order shows its history instead. */}
      <section aria-labelledby="tracking-heading" className="acct-card p-5 sm:p-6">
        <h3 id="tracking-heading" className="mb-6 flex items-center gap-3 text-sm font-bold uppercase tracking-wider">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Navigation className="h-4 w-4" aria-hidden="true" />
          </span>
          Tracking
        </h3>

        {isCancelled ? (
          <p className="flex items-center gap-3 text-sm text-danger">
            <XCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            This order was cancelled
            {data.cancelledAt && ` on ${formatDate(data.cancelledAt)}`}.
          </p>
        ) : (
          <ol className="relative space-y-6">
            {ORDER_TIMELINE.map((status, index) => {
              const isDone = index <= currentStep;
              const isCurrent = index === currentStep;
              const at = timestampFor(status);

              return (
                <li key={status} className="relative flex gap-4 pl-1">
                  {/* Connector line between steps. */}
                  {index < ORDER_TIMELINE.length - 1 && (
                    <span aria-hidden="true" className="absolute left-[0.9375rem] top-8 h-[calc(100%-0.5rem)] w-0.5 overflow-hidden rounded-full bg-line">
                      <span
                        className={cn(
                          'block w-full rounded-full bg-primary transition-[height] duration-700 ease-out',
                          index < currentStep ? 'h-full' : 'h-0',
                        )}
                        style={{ transitionDelay: `${index * 150}ms` }}
                      />
                    </span>
                  )}

                  <span
                    className={cn(
                      'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-all duration-500',
                      isDone
                        ? 'border-primary bg-primary text-white shadow-[0_6px_16px_-6px_rgb(var(--color-primary)/0.8)]'
                        : 'border-line bg-canvas text-ink-subtle',
                      isCurrent && 'ring-4 ring-primary/15',
                    )}
                  >
                    {isDone ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                    )}
                    {isCurrent && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-primary/25" />}
                  </span>

                  <span className="flex-1 pt-1">
                    <span
                      className={cn(
                        'block text-sm',
                        isCurrent ? 'font-semibold text-ink' : isDone ? 'text-ink' : 'text-ink-subtle',
                      )}
                    >
                      {ORDER_STATUS_LABELS[status]}
                    </span>
                    {at && (
                      <span className="block text-xs text-ink-muted">{formatDateTime(at)}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {!isCancelled && <ShipmentCard shipment={data.shipment} />}

      <section aria-labelledby="items-heading" className="acct-card overflow-hidden">
        <h3 id="items-heading" className="flex items-center gap-3 border-b border-line px-5 py-4 text-sm font-bold uppercase tracking-wider sm:px-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          </span>
          Items
          <span className="ml-auto text-xs font-medium normal-case tracking-normal text-ink-muted">{data.items.length} total</span>
        </h3>

        <ul className="divide-y divide-line">
          {data.items.map((item, index) => (
            <li key={`${item.sku}-${index}`} className="group flex gap-4 p-5 transition-colors hover:bg-surface/50 sm:px-6">
              {item.image ? (
                <span className="block h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-surface">
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </span>
              ) : (
                <div className="h-24 w-20 shrink-0 rounded-xl bg-surface" />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  <Link to={`/product/${item.slug}`} className="hover:text-primary">
                    {item.name}
                  </Link>
                </p>
                <p className="mt-2 flex flex-wrap gap-1.5 text-[0.6875rem] text-ink-muted">
                  <span className="rounded-full bg-surface px-2.5 py-1">{item.color}</span>
                  <span className="rounded-full bg-surface px-2.5 py-1">Size {item.size}</span>
                  <span className="rounded-full bg-surface px-2.5 py-1">Qty {item.quantity}</span>
                </p>
                <p className="mt-2 text-sm font-semibold">{formatPrice(item.lineTotal)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="address-heading" className="acct-card p-5 sm:p-6">
          <h3 id="address-heading" className="mb-4 flex items-center gap-3 text-sm font-bold uppercase tracking-wider">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </span>
            Delivery address
          </h3>
          <address className="text-sm not-italic leading-relaxed text-ink-muted">
            <span className="block font-medium text-ink">{data.shippingAddress.name}</span>
            {data.shippingAddress.addressLine1}
            {data.shippingAddress.addressLine2 && <>, {data.shippingAddress.addressLine2}</>}
            <br />
            {data.shippingAddress.city}, {data.shippingAddress.state}{' '}
            {data.shippingAddress.postalCode}
            <br />
            {data.shippingAddress.country}
            <br />
            {data.shippingAddress.phone}
          </address>
        </section>

        <section aria-labelledby="payment-heading" className="acct-card p-5 sm:p-6">
          <h3 id="payment-heading" className="mb-4 flex items-center gap-3 text-sm font-bold uppercase tracking-wider">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
            </span>
            Payment
          </h3>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd>{formatPrice(data.subtotal)}</dd>
            </div>
            {data.discount > 0 && (
              <div className="flex justify-between text-primary">
                <dt>Discount</dt>
                <dd>−{formatPrice(data.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-muted">Shipping</dt>
              <dd>{data.shippingFee ? formatPrice(data.shippingFee) : 'Free'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Method</dt>
              <dd>{data.paymentMethod === 'COD' ? 'Cash on delivery' : 'PhonePe'}</dd>
            </div>
            {data.payment?.reference && data.paymentMethod === 'ONLINE' && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Reference</dt>
                <dd className="break-all text-right font-mono text-xs">{data.payment.reference}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-muted">Status</dt>
              <dd>{PAYMENT_STATUS_LABELS[data.paymentStatus] ?? data.paymentStatus}</dd>
            </div>
            <div className="mt-2 flex justify-between rounded-xl bg-surface px-3 py-2.5 font-bold">
              <dt>Total</dt>
              <dd>{formatPrice(data.total)}</dd>
            </div>
          </dl>
        </section>
      </div>

      {canCancel && (
        <div className="acct-card p-5 sm:p-6">
          <Button
            variant="outline"
            onClick={() => cancelOrder.mutate()}
            isLoading={cancelOrder.isPending}
          >
            Cancel this order
          </Button>
          <p className="mt-2 text-xs text-ink-muted">
            You can cancel until the parcel is handed to the courier. After that, start a return
            instead.
          </p>
        </div>
      )}
    </div>
  );
}

/** Only ever link out to an ordinary web page. */
const isWebLink = (url?: string) => Boolean(url && /^https?:\/\/[^\s"'<>]+$/i.test(url));

/**
 * Courier, tracking number and a link to the courier's own tracking page.
 * Hidden until the shop has recorded at least one of them.
 */
function ShipmentCard({ shipment }: { shipment?: Order['shipment'] }) {
  const [copied, setCopied] = useState(false);
  if (!shipment) return null;

  const { carrier, trackingNumber, trackingUrl, estimatedDelivery, shippedAt } = shipment;
  const link = isWebLink(trackingUrl) ? trackingUrl : undefined;
  if (!carrier && !trackingNumber && !link && !estimatedDelivery) return null;

  const copy = async () => {
    if (!trackingNumber) return;
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the number instead');
    }
  };

  return (
    <section aria-labelledby="shipment-heading" className="acct-card p-5 sm:p-6">
      <h3 id="shipment-heading" className="mb-5 flex items-center gap-3 text-sm font-bold uppercase tracking-wider">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Truck className="h-4 w-4" aria-hidden="true" />
        </span>
        Shipment
      </h3>

      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        {carrier && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-muted">Courier</dt>
            <dd className="mt-1 font-medium">{carrier}</dd>
          </div>
        )}

        {trackingNumber && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-muted">Tracking number</dt>
            <dd className="mt-1 flex items-center gap-2">
              <span className="break-all font-mono font-medium">{trackingNumber}</span>
              <button
                type="button"
                onClick={copy}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted hover:text-ink"
                aria-label="Copy tracking number"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </dd>
          </div>
        )}

        {shippedAt && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-muted">Shipped on</dt>
            <dd className="mt-1">{formatDate(shippedAt)}</dd>
          </div>
        )}

        {estimatedDelivery && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-muted">Estimated delivery</dt>
            <dd className="mt-1">{formatDate(estimatedDelivery)}</dd>
          </div>
        )}
      </dl>

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="auth-shine mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold uppercase tracking-wider text-white shadow-[0_12px_26px_-12px_rgb(var(--color-primary)/0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-dark sm:w-auto"
        >
          Track your parcel
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </section>
  );
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Awaiting payment',
  PAID: 'Paid',
  FAILED: 'Not completed',
  CANCELLED: 'Not charged',
};

export default OrderDetailPage;
