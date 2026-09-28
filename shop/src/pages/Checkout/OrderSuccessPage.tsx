import { useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Truck, PackageCheck, Home, MapPin, Receipt, CalendarDays, Navigation, ArrowRight } from 'lucide-react';
import { ordersApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { formatPrice, formatDate } from '@/utils/format';
import { ButtonLink } from '@/components/ui/Button';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';

export function OrderSuccessPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();

  useSeo({ title: 'Order confirmed', noindex: true });

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: () => ordersApi.detail(id).then((res) => res.order),
    enabled: Boolean(id),
  });

  // The bag was emptied server-side when the order was created; drop the
  // cached copy so the header count does not linger.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.cart });
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="container-page py-12">
        <ListSkeleton rows={3} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="We could not find that order"
        description="If you were charged, it will appear in your orders shortly."
      />
    );
  }

  // An online order is only "confirmed" once PhonePe has confirmed the money.
  if (data.paymentMethod === 'ONLINE' && data.orderStatus === 'PENDING') {
    return <Navigate to={`/payment/status?order=${data._id}`} replace />;
  }

  const estimatedDelivery = new Date(data.createdAt);
  estimatedDelivery.setDate(estimatedDelivery.getDate() + 6);

  const steps = [
    { label: 'Confirmed', icon: CheckCircle2, done: true },
    { label: 'Packed', icon: PackageCheck, done: false },
    { label: 'Shipped', icon: Truck, done: false },
    { label: 'Delivered', icon: Home, done: false },
  ];

  return (
    <div className="acct-scope container-page max-w-3xl py-10 md:py-16">
      {/* Celebration */}
      <div className="text-center">
        <div className="relative mx-auto h-24 w-24">
          <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-success/20 [animation-iteration-count:2]" />
          {SPARKS.map((spark, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="success-spark absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
              style={{
                background: spark.color,
                ['--dx' as string]: spark.dx,
                ['--dy' as string]: spark.dy,
                animationDelay: `${300 + index * 60}ms`,
              }}
            />
          ))}
          <span className="success-pop relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-success to-[#0f5c34] shadow-[0_18px_40px_-14px_rgb(var(--color-success)/0.8)]">
            <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" aria-hidden="true">
              <path className="success-draw" d="M5 12.5l4.5 4.5L19 7.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        <p className="mt-6 animate-fade-up text-[0.6875rem] font-bold uppercase tracking-[0.25em] text-success" style={{ animationDelay: '500ms' }}>
          Thank you{data.shippingAddress?.name ? `, ${data.shippingAddress.name.split(' ')[0]}` : ''}
        </p>
        <h1 className="mt-2 animate-fade-up text-display-sm uppercase md:text-display-md" style={{ animationDelay: '580ms' }}>
          Order confirmed
        </h1>
        <p className="mx-auto mt-3 max-w-md animate-fade-up text-sm text-ink-muted" style={{ animationDelay: '660ms' }}>
          We have your order and will email you the moment it ships.
        </p>
      </div>

      <div className="acct-stagger mt-10 space-y-5">
        {/* Order card */}
        <section className="acct-card overflow-hidden">
          <div className="grid grid-cols-1 gap-3 border-b border-line bg-surface/60 p-4 min-[480px]:grid-cols-3 sm:p-5">
            {[
              { label: 'Order number', value: data.orderNumber, strong: true },
              { label: 'Placed on', value: formatDate(data.createdAt), strong: false },
              { label: 'Total', value: formatPrice(data.total), strong: true },
            ].map((chip) => (
              <div key={chip.label} className="rounded-xl bg-canvas px-4 py-3 ring-1 ring-line">
                <p className="text-[0.625rem] font-bold uppercase tracking-[0.18em] text-ink-subtle">{chip.label}</p>
                <p className={chip.strong ? 'mt-1 truncate text-sm font-bold' : 'mt-1 truncate text-sm'}>{chip.value}</p>
              </div>
            ))}
          </div>

          <ul className="divide-y divide-line">
            {data.items.map((item) => (
              <li key={`${item.sku}-${item.size}`} className="group flex gap-4 p-4 sm:p-5">
                <span className="block h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-surface">
                  {item.image && (
                    <img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    <Link to={`/product/${item.slug}`} className="hover:text-primary">
                      {item.name}
                    </Link>
                  </p>
                  <p className="mt-2 flex flex-wrap gap-1.5 text-[0.6875rem] text-ink-muted">
                    <span className="rounded-full bg-surface px-2.5 py-1">{item.color}</span>
                    <span className="rounded-full bg-surface px-2.5 py-1">Size {item.size}</span>
                    <span className="rounded-full bg-surface px-2.5 py-1">Qty {item.quantity}</span>
                  </p>
                  <p className="mt-2 text-sm font-bold">{formatPrice(item.lineTotal)}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2 sm:p-5">
            <div className="rounded-2xl bg-surface/60 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                Delivering to
              </h2>
              <address className="text-sm not-italic leading-relaxed text-ink-muted">
                <span className="block font-semibold text-ink">{data.shippingAddress.name}</span>
                {data.shippingAddress.addressLine1}
                {data.shippingAddress.addressLine2 && <>, {data.shippingAddress.addressLine2}</>}
                <br />
                {data.shippingAddress.city}, {data.shippingAddress.state}{' '}
                {data.shippingAddress.postalCode}
                <br />
                {data.shippingAddress.phone}
              </address>
            </div>

            <div className="rounded-2xl bg-surface/60 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                Summary
              </h2>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Subtotal</dt>
                  <dd>{formatPrice(data.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Shipping</dt>
                  <dd className={data.shippingFee ? '' : 'text-success'}>{data.shippingFee ? formatPrice(data.shippingFee) : 'Free'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Payment</dt>
                  <dd>{data.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'}</dd>
                </div>
                <div className="mt-2 flex justify-between rounded-xl bg-canvas px-3 py-2.5 font-bold ring-1 ring-line">
                  <dt>Total</dt>
                  <dd>{formatPrice(data.total)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* What happens next */}
        <section className="acct-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider">What happens next</h2>
            <p className="flex items-center gap-1.5 text-xs text-ink-muted">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Arriving by <span className="font-semibold text-ink">{formatDate(estimatedDelivery)}</span>
            </p>
          </div>
          <ol className="mt-5 grid grid-cols-4 gap-1">
            {steps.map((step, index) => (
              <li key={step.label} className="relative flex flex-col items-center text-center">
                {index < steps.length - 1 && (
                  <span aria-hidden="true" className="absolute left-1/2 top-5 h-0.5 w-full bg-line">
                    {index === 0 && <span className="block h-full w-1/2 animate-pulse rounded-full bg-success" />}
                  </span>
                )}
                <span
                  className={
                    step.done
                      ? 'relative grid h-10 w-10 place-items-center rounded-full bg-success text-white shadow-[0_8px_18px_-8px_rgb(var(--color-success)/0.8)]'
                      : 'relative grid h-10 w-10 place-items-center rounded-full border border-line bg-canvas text-ink-subtle'
                  }
                >
                  <step.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className={step.done ? 'mt-2 text-[0.6875rem] font-semibold text-success' : 'mt-2 text-[0.6875rem] text-ink-muted'}>
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <ButtonLink
            to={`/account/orders/${data._id}`}
            variant="outline"
            className="group rounded-xl transition-all duration-300 hover:-translate-y-0.5"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Track this order
          </ButtonLink>
          <ButtonLink
            to="/shop"
            variant="primary"
            className="auth-shine group rounded-xl shadow-[0_14px_30px_-12px_rgb(var(--color-primary)/0.7)] transition-all duration-300 hover:-translate-y-0.5"
          >
            Continue shopping
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/** Little bursts around the tick: where each flies, and its colour. */
const SPARKS = [
  { dx: '-56px', dy: '-48px', color: 'rgb(var(--color-primary))' },
  { dx: '58px', dy: '-44px', color: 'rgb(var(--color-success))' },
  { dx: '-64px', dy: '8px', color: 'rgb(var(--color-success))' },
  { dx: '66px', dy: '12px', color: 'rgb(var(--color-primary))' },
  { dx: '-30px', dy: '-66px', color: 'rgb(var(--color-success))' },
  { dx: '34px', dy: '-68px', color: 'rgb(var(--color-primary))' },
];

export default OrderSuccessPage;
