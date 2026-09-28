import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, RotateCcw } from 'lucide-react';

import { ordersApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from '@/store/toastStore';
import { formatDateTime } from '@/utils/format';
import type { OrderEmailEvent } from '@/types';
import { Panel, Badge, Button, Skeleton } from '@/components/ui';

const TYPE_LABELS: Record<string, string> = {
  ORDER_CONFIRMATION: 'Order confirmation',
  PAYMENT_SUCCESS: 'Payment received',
  PAYMENT_FAILED: 'Payment failed',
  ORDER_PROCESSING: 'Processing',
  ORDER_SHIPPED: 'Shipped',
  ORDER_OUT_FOR_DELIVERY: 'Out for delivery',
  ORDER_DELIVERED: 'Delivered',
  ORDER_CANCELLED: 'Cancelled',
};

const STATUS_TONES = {
  sent: 'success',
  failed: 'danger',
  sending: 'info',
  skipped: 'neutral',
} as const;

/** Plain-language reasons, so an operator knows what to do next. */
const CATEGORY_HINTS: Record<string, string> = {
  configuration: 'Email is misconfigured on the server — check the Resend key and sender domain.',
  invalid_request: 'The provider refused this email as malformed.',
  rate_limited: 'The provider asked us to slow down.',
  quota: 'The provider’s sending quota was reached.',
  provider_error: 'The provider had a temporary problem.',
  network: 'The provider could not be reached.',
  render: 'The email could not be built. This needs a developer.',
  superseded: 'The order moved on before this could go out, so it was dropped.',
  disabled: 'Email sending is switched off on this server.',
  no_recipient: 'The customer has no valid email address.',
};

/**
 * Every customer email for one order: what went, when, and what did not.
 *
 * The provider message id is the handle to look an email up in Resend's own
 * dashboard. Bodies are never stored, so there is nothing more to show — which
 * is deliberate: they carry the customer's address and name.
 */
export function OrderEmailsPanel({ orderId, canRetry }: { orderId: string; canRetry: boolean }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.orders.emails(orderId),
    queryFn: () => ordersApi.emails(orderId),
  });

  const retry = useMutation({
    mutationFn: (eventId: string) => ordersApi.retryEmail(orderId, eventId),
    onSuccess: ({ result }) => {
      if (result.status === 'sent') toast.success('Email sent');
      else if (result.status === 'superseded') toast.info('Not sent — the order has moved on since');
      else toast.error(`Email ${result.status}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.emails(orderId) });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not retry that email')),
  });

  const emails = data?.emails ?? [];

  return (
    <Panel title="Customer emails" description="Sent automatically as the order moves. Each one goes at most once.">
      {isLoading ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : emails.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-ink-muted">
          <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
          No emails yet for this order.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {emails.map((email: OrderEmailEvent) => {
            const canResend =
              canRetry && (email.status === 'failed' || email.status === 'skipped') &&
              email.retryable && email.errorCategory !== 'superseded';

            return (
              <li key={email._id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {TYPE_LABELS[email.type] ?? email.type}
                  </span>
                  <Badge tone={STATUS_TONES[email.status] ?? 'neutral'}>{email.status}</Badge>
                  {email.attempts > 1 && (
                    <span className="text-xs text-ink-subtle">{email.attempts} attempts</span>
                  )}
                </div>

                <p className="mt-0.5 text-xs text-ink-subtle">
                  {email.sentAt
                    ? `Sent ${formatDateTime(email.sentAt)}`
                    : email.lastAttemptAt
                      ? `Last tried ${formatDateTime(email.lastAttemptAt)}`
                      : formatDateTime(email.createdAt)}
                  {' · '}
                  {email.recipient}
                </p>

                {email.providerMessageId && (
                  <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-ink-subtle" title={email.providerMessageId}>
                    {email.providerMessageId}
                  </p>
                )}

                {email.status !== 'sent' && email.errorCategory && (
                  <p className="mt-1.5 rounded bg-canvas px-2.5 py-1.5 text-xs text-ink-muted">
                    {CATEGORY_HINTS[email.errorCategory] ?? email.errorMessage ?? email.errorCategory}
                    {email.nextAttemptAt && email.status === 'failed' && (
                      <> Will retry automatically around {formatDateTime(email.nextAttemptAt)}.</>
                    )}
                  </p>
                )}

                {canResend && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => retry.mutate(email._id)}
                    isLoading={retry.isPending && retry.variables === email._id}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Retry now
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export default OrderEmailsPanel;
