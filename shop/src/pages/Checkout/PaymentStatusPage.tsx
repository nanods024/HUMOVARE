import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

import { ordersApi, getErrorMessage } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { toast } from '@/store/toastStore';
import { formatPrice } from '@/utils/format';
import { goToPhonePe } from '@/utils/phonepe';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';

/** Poll every 3 s for up to 2 minutes while PhonePe is still processing. */
const POLL_MS = 3000;
const POLL_FOR_MS = 2 * 60 * 1000;

/**
 * Where PhonePe sends the shopper back to (/payment/status?order=<id>).
 *
 * This page decides nothing. It asks the API for the order's payment state;
 * the API answers from its own records, checking with PhonePe's status API
 * when a payment is still open. Refreshing it, or arriving here without
 * paying, can never mark an order paid.
 */
export function PaymentStatusPage() {
  useSeo({ title: 'Payment', noindex: true });

  const [params] = useSearchParams();
  const orderId = params.get('order') ?? '';
  const validId = /^[0-9a-f]{24}$/i.test(orderId);
  const queryClient = useQueryClient();
  const startedAt = useRef(Date.now());
  const [redirecting, setRedirecting] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: queryKeys.orders.paymentStatus(orderId),
    queryFn: () => ordersApi.paymentStatus(orderId).then((res) => res.payment),
    enabled: validId,
    refetchInterval: (query) =>
      query.state.data?.state === 'PENDING' && Date.now() - startedAt.current < POLL_FOR_MS ? POLL_MS : false,
    refetchOnWindowFocus: true,
  });

  // Once settled, the bag and order views are stale.
  useEffect(() => {
    if (data && data.state !== 'PENDING') {
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    }
  }, [data, queryClient]);

  const retry = useMutation({
    mutationFn: () => ordersApi.retryPayment(orderId).then((res) => res.payment),
    onSuccess: (payment) => {
      if (payment.status === 'redirect') {
        setRedirecting(true);
        if (!goToPhonePe(payment.redirectUrl)) {
          setRedirecting(false);
          toast.error('We could not open PhonePe. Please try again.');
        }
        return;
      }
      if (payment.status === 'paid') toast.success('This order is already paid');
      refetch();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not start the payment')),
  });

  if (!validId) {
    return <ErrorState title="We could not find that payment" description="Open the order from your account to see its status." />;
  }
  if (isError) {
    return <ErrorState title="We could not load your payment" description="Your payment is safe. Please try again in a moment." onRetry={() => refetch()} />;
  }

  if (isLoading || !data || redirecting) {
    return (
      <Shell
        icon={<Loader2 className="h-12 w-12 animate-spin text-ink-muted" aria-hidden="true" />}
        title={redirecting ? 'Redirecting to PhonePe…' : 'Verifying your payment…'}
        body={redirecting ? 'Please do not close this window.' : 'This only takes a moment.'}
      />
    );
  }

  const summary = (
    <dl className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-4 border border-line bg-surface p-5 text-left text-sm rounded-2xl">
      <div>
        <dt className="eyebrow mb-1">Order number</dt>
        <dd className="font-semibold">{data.orderNumber}</dd>
      </div>
      <div>
        <dt className="eyebrow mb-1">Amount</dt>
        <dd className="font-semibold">{formatPrice(data.amount)}</dd>
      </div>
    </dl>
  );

  if (data.state === 'PAID') {
    return (
      <Shell
        icon={<CheckCircle2 className="h-14 w-14 text-success" strokeWidth={1.25} aria-hidden="true" />}
        title="Payment successful"
        body="Thank you — your order is confirmed. A receipt is on its way to your email."
      >
        {summary}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink to={`/account/orders/${data.orderId}`} variant="primary">View order details</ButtonLink>
          <ButtonLink to="/shop" variant="outline">Continue shopping</ButtonLink>
        </div>
      </Shell>
    );
  }

  if (data.state === 'PENDING') {
    const stillPolling = Date.now() - startedAt.current < POLL_FOR_MS;
    return (
      <Shell
        icon={<Clock className="h-14 w-14 text-ink-muted" strokeWidth={1.25} aria-hidden="true" />}
        title="Your payment is being verified"
        body={stillPolling
          ? 'We are confirming it with PhonePe. This page updates by itself.'
          : 'PhonePe has not confirmed it yet. If money left your account, the order will confirm automatically — you do not need to pay again.'}
      >
        {summary}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={() => refetch()} isLoading={isFetching}>Check again</Button>
          {!stillPolling && data.canRetry && (
            <Button variant="ghost" onClick={() => retry.mutate()} isLoading={retry.isPending}>
              I didn't pay — try again
            </Button>
          )}
        </div>
      </Shell>
    );
  }

  if (data.state === 'CANCELLED') {
    return (
      <Shell
        icon={<XCircle className="h-14 w-14 text-danger" strokeWidth={1.25} aria-hidden="true" />}
        title="This order was cancelled"
        body="The payment was not completed in time, so the items were released. You have not been charged."
      >
        {summary}
        <div className="mt-8 flex justify-center">
          <ButtonLink to="/shop" variant="primary">Shop again</ButtonLink>
        </div>
      </Shell>
    );
  }

  if (data.state === 'COD') {
    return (
      <Shell icon={<CheckCircle2 className="h-14 w-14 text-success" strokeWidth={1.25} aria-hidden="true" />} title="Cash on delivery" body="This order is paid when it arrives.">
        {summary}
        <div className="mt-8 flex justify-center">
          <ButtonLink to={`/account/orders/${data.orderId}`} variant="primary">View order</ButtonLink>
        </div>
      </Shell>
    );
  }

  // FAILED
  return (
    <Shell
      icon={<XCircle className="h-14 w-14 text-danger" strokeWidth={1.25} aria-hidden="true" />}
      title="Payment was not completed"
      body="No money was taken for this attempt. Your order and items are saved — you can try again."
    >
      {summary}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {data.canRetry ? (
          <Button variant="primary" onClick={() => retry.mutate()} isLoading={retry.isPending} disabled={retry.isPending}>
            Retry payment
          </Button>
        ) : (
          <ButtonLink to="/shop" variant="primary">Shop again</ButtonLink>
        )}
        <ButtonLink to={`/account/orders/${data.orderId}`} variant="outline">View order</ButtonLink>
      </div>
      <p className="mt-6 text-xs text-ink-subtle">
        Charged but seeing this? It can take a minute to confirm — <Link to={`/account/orders/${data.orderId}`} className="underline">check your order</Link> before paying again.
      </p>
    </Shell>
  );
}

function Shell({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="container-page max-w-2xl py-16 text-center md:py-24" aria-live="polite">
      <div className="flex justify-center">{icon}</div>
      <h1 className="mt-6 text-display-md">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">{body}</p>
      {children}
    </div>
  );
}

export default PaymentStatusPage;
