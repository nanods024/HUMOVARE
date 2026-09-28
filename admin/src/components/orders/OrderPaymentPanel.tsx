import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { ordersApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { paymentStatusView, formatPaise } from '@/lib/payments';
import { toast } from '@/store/toastStore';
import { formatDateTime } from '@/utils/format';
import type { AdminOrder } from '@/types';
import { Panel, Button, Badge } from '@/components/ui';

const ATTEMPT_TONE = {
  CREATED: 'neutral', PENDING: 'warning', PAID: 'success', FAILED: 'danger', EXPIRED: 'neutral', CANCELLED: 'neutral',
} as const;

/**
 * The money side of an online order: what PhonePe confirmed, every attempt
 * the customer made, and the audit trail.
 *
 * Everything shown comes from the server's own records; no gateway secret or
 * customer checkout link ever reaches this page. "Check with PhonePe" asks
 * PhonePe's status API from the server — it cannot be used to mark anything
 * paid that PhonePe has not confirmed.
 */
export function OrderPaymentPanel({ order, canVerify }: { order: AdminOrder; canVerify: boolean }) {
  const queryClient = useQueryClient();
  const [showEvents, setShowEvents] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.orders.payments(order._id),
    queryFn: () => ordersApi.payments(order._id),
  });

  const verify = useMutation({
    mutationFn: () => ordersApi.verifyPayment(order._id),
    onSuccess: ({ results }) => {
      if (!results.length) toast.success('Nothing open — the order is already settled');
      else toast.success(`Checked with PhonePe: ${results.map((r) => `${r.reference} → ${r.status}`).join(', ')}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not reach PhonePe')),
  });

  const status = paymentStatusView(order.paymentStatus);
  const pay = order.payment;
  const hasOpen = data?.attempts.some((a) => a.status === 'CREATED' || a.status === 'PENDING');

  return (
    <Panel
      title="Payment"
      actions={data?.environment === 'sandbox' ? <Badge tone="warning">PhonePe TEST</Badge> : undefined}
    >
      <div className="space-y-4 p-5">
        {pay?.needsReview && (
          <p className="flex gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Needs review: {data?.attempts.find((a) => a.needsReview)?.reviewReason
                || 'PhonePe reported something that does not match this order. Check the attempts below.'}
            </span>
          </p>
        )}

        <dl className="space-y-1.5 text-sm">
          <Row label="Gateway" value="PhonePe" />
          <Row label="Status" value={<Badge tone={status.tone}>{status.label}</Badge>} />
          <Row label="Order total" value={formatPaise(Math.round(order.total * 100))} />
          {pay?.amountPaid ? <Row label="Paid (confirmed by PhonePe)" value={formatPaise(pay.amountPaid)} /> : null}
          {pay?.reference && <Row label="Payment reference" value={<code className="text-xs">{pay.reference}</code>} />}
          {pay?.gatewayOrderId && <Row label="PhonePe order id" value={<code className="text-xs">{pay.gatewayOrderId}</code>} />}
          {pay?.transactionId && <Row label="Transaction" value={<code className="text-xs">{pay.transactionId}</code>} />}
          {pay?.paymentMode && <Row label="Mode" value={pay.paymentMode.replace(/_/g, ' ')} />}
          {pay?.paidAt && <Row label="Paid at" value={formatDateTime(pay.paidAt)} />}
          {pay?.lastAttemptAt && <Row label="Last attempt" value={formatDateTime(pay.lastAttemptAt)} />}
          {order.orderStatus === 'PENDING' && pay?.expiresAt && (
            <Row label="Stock held until" value={formatDateTime(pay.expiresAt)} />
          )}
        </dl>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Attempts {data ? `(${data.attempts.length})` : ''}
          </p>
          {isLoading ? (
            <p className="text-xs text-ink-muted">Loading…</p>
          ) : !data?.attempts.length ? (
            <p className="text-xs text-ink-muted">No PhonePe attempts yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.attempts.map((attempt) => (
                <li key={attempt._id} className="rounded-md border border-line p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <code className="break-all">{attempt.merchantOrderId}</code>
                    <Badge tone={ATTEMPT_TONE[attempt.status]}>{attempt.status.toLowerCase()}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-ink-muted">
                    <span>{formatPaise(attempt.amount)}</span>
                    <span>created {formatDateTime(attempt.createdAt)}</span>
                    <span>updated {formatDateTime(attempt.updatedAt)}</span>
                    {attempt.paymentMode && <span>{attempt.paymentMode.replace(/_/g, ' ')}</span>}
                    {attempt.transactionId && <span>txn {attempt.transactionId}</span>}
                    {attempt.errorCode && <span className="text-danger">{attempt.errorCode}{attempt.detailedErrorCode ? ` / ${attempt.detailedErrorCode}` : ''}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canVerify && (
          <Button fullWidth variant="outline" onClick={() => verify.mutate()} isLoading={verify.isPending}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {hasOpen ? 'Check with PhonePe now' : 'Check with PhonePe'}
          </Button>
        )}

        {Boolean(data?.events.length) && (
          <div>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setShowEvents((open) => !open)}
            >
              {showEvents ? 'Hide' : 'Show'} payment log ({data!.events.length})
            </button>
            {showEvents && (
              <ol className="mt-2 space-y-1.5 border-l border-line pl-3 text-xs">
                {data!.events.map((event) => (
                  <li key={event._id}>
                    <span className="font-medium">{event.type.replace(/_/g, ' ').toLowerCase()}</span>
                    <span className="text-ink-muted">
                      {' · '}{event.source}{event.status ? ` · ${event.status}` : ''}
                      {event.amount !== null ? ` · ${formatPaise(event.amount)}` : ''}
                      {' · '}{formatDateTime(event.createdAt)}
                    </span>
                    {event.detail && <div className="text-ink-subtle">{event.detail}</div>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
