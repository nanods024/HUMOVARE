import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';

import { ordersApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from '@/store/toastStore';
import type { AdminOrder } from '@/types';
import { Panel, Button, Input } from '@/components/ui';

/**
 * Courier and tracking details for an order that has left the warehouse.
 *
 * Editing here fixes a typo or adds a link the courier sent later. It updates
 * what the customer sees on their order page, and sends no email — the
 * shipped email already went out when the status changed.
 */
export function OrderShipmentPanel({ order, canUpdate }: { order: AdminOrder; canUpdate: boolean }) {
  const queryClient = useQueryClient();

  const fromOrder = () => ({
    carrier: order.shipment?.carrier ?? '',
    trackingNumber: order.shipment?.trackingNumber ?? '',
    trackingUrl: order.shipment?.trackingUrl ?? '',
    estimatedDelivery: order.shipment?.estimatedDelivery?.slice(0, 10) ?? '',
  });

  const [form, setForm] = useState(fromOrder);
  // Keep the form in step when the order is refetched after a save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(fromOrder()), [order.shipment]);

  const saved = fromOrder();
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((key) => form[key] !== saved[key]);

  const save = useMutation({
    mutationFn: () =>
      ordersApi.updateShipment(order._id, { ...form, estimatedDelivery: form.estimatedDelivery || null }),
    onSuccess: () => {
      toast.success('Courier details saved · visible to the customer');
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not save courier details')),
  });

  const hasAny = saved.carrier || saved.trackingNumber || saved.trackingUrl || saved.estimatedDelivery;

  return (
    <Panel title="Courier & tracking">
      <div className="space-y-3 p-5">
        {!canUpdate ? (
          hasAny ? (
            <dl className="space-y-1.5 text-sm">
              {saved.carrier && <Row label="Courier" value={saved.carrier} />}
              {saved.trackingNumber && <Row label="Tracking number" value={saved.trackingNumber} />}
              {saved.estimatedDelivery && <Row label="Estimated delivery" value={saved.estimatedDelivery} />}
            </dl>
          ) : (
            <p className="text-sm text-ink-muted">No courier details recorded.</p>
          )
        ) : (
          <>
            <p className="text-xs text-ink-muted">
              Shown to the customer on their order page. Saving here sends no email.
            </p>
            <Input
              label="Courier"
              value={form.carrier}
              onChange={(event) => setForm({ ...form, carrier: event.target.value })}
              placeholder="Blue Dart, Delhivery…"
            />
            <Input
              label="Tracking number"
              value={form.trackingNumber}
              onChange={(event) => setForm({ ...form, trackingNumber: event.target.value })}
            />
            <Input
              label="Tracking link"
              value={form.trackingUrl}
              onChange={(event) => setForm({ ...form, trackingUrl: event.target.value })}
              placeholder="https://…"
            />
            <Input
              label="Estimated delivery"
              type="date"
              value={form.estimatedDelivery}
              onChange={(event) => setForm({ ...form, estimatedDelivery: event.target.value })}
            />
            <Button fullWidth onClick={() => save.mutate()} isLoading={save.isPending} disabled={!dirty}>
              Save courier details
            </Button>
          </>
        )}

        {saved.trackingUrl && (
          <a
            href={saved.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Open tracking page <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
