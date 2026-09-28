import { useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Banknote, Bike, Check, CheckCircle2, Clock, Copy, Home, Info, Mail, MapPin, MessageSquare,
  Package, Phone, Receipt, Smartphone, StickyNote, Trash2, Truck, User, XCircle, type LucideIcon,
} from 'lucide-react';

import { ordersApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { TRANSITIONS } from '@/lib/orderStatus';
import { paymentStatusView } from '@/lib/payments';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { formatPrice, formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { AdminOrder, OrderStatus } from '@/types';
import { PageHeader, Panel, Button, Input, Badge, Textarea, ErrorState, Skeleton } from '@/components/ui';
import { OrderStatusBadge } from '@/components/common/OrderStatusBadge';
import { DeleteOrderDialog } from '@/components/orders/DeleteOrderDialog';
import { OrderEmailsPanel } from '@/components/orders/OrderEmailsPanel';
import { OrderShipmentPanel } from '@/components/orders/OrderShipmentPanel';
import { OrderPaymentPanel } from '@/components/orders/OrderPaymentPanel';

/** The journey a parcel takes, left to right. */
const STEPS: { status: OrderStatus; label: string; icon: LucideIcon }[] = [
  { status: 'PENDING', label: 'Placed', icon: Receipt },
  { status: 'CONFIRMED', label: 'Confirmed', icon: CheckCircle2 },
  { status: 'PROCESSING', label: 'Packing', icon: Package },
  { status: 'SHIPPED', label: 'Shipped', icon: Truck },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery', icon: Bike },
  { status: 'DELIVERED', label: 'Delivered', icon: Home },
];

/** Each move, as the button an operator presses and what it means. */
const MOVES: Record<OrderStatus, { action: string; hint: string; icon: LucideIcon }> = {
  PENDING: { action: 'Pending', hint: '', icon: Clock },
  CONFIRMED: { action: 'Confirm order', hint: 'Payment is sorted — ready to pack.', icon: CheckCircle2 },
  PROCESSING: { action: 'Start packing', hint: 'The items are being picked and packed.', icon: Package },
  SHIPPED: { action: 'Mark as shipped', hint: 'Handed to the courier. Add tracking so the customer can follow it.', icon: Truck },
  OUT_FOR_DELIVERY: { action: 'Out for delivery', hint: 'With the delivery partner, arriving soon.', icon: Bike },
  DELIVERED: { action: 'Mark as delivered', hint: 'The customer has received the parcel.', icon: Home },
  CANCELLED: { action: 'Cancel order', hint: 'Stops the order. The customer is emailed the reason.', icon: XCircle },
};

const DOT: Record<OrderStatus, string> = {
  PENDING: 'bg-warning',
  CONFIRMED: 'bg-info',
  PROCESSING: 'bg-info',
  SHIPPED: 'bg-primary',
  OUT_FOR_DELIVERY: 'bg-primary',
  DELIVERED: 'bg-success',
  CANCELLED: 'bg-danger',
};

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
const TILE: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  neutral: 'bg-ink/[0.06] text-ink-muted',
};

function Stat({ icon: Icon, label, tone = 'neutral', children }: {
  icon: LucideIcon;
  label: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div className="panel flex items-start gap-3 p-4">
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', TILE[tone])} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

/** When the order first reached a status, from its history. */
const reachedAt = (order: AdminOrder, status: OrderStatus) =>
  status === 'PENDING' ? order.createdAt : order.statusHistory.find((event) => event.status === status)?.at;

function Progress({ order }: { order: AdminOrder }) {
  const cancelled = order.orderStatus === 'CANCELLED';
  // A cancelled order stopped at the last step it reached before that.
  const reached = cancelled
    ? [...order.statusHistory].reverse().find((event) => event.status !== 'CANCELLED')?.status ?? 'PENDING'
    : order.orderStatus;
  const current = STEPS.findIndex((step) => step.status === reached);
  const cancelEvent = cancelled ? [...order.statusHistory].reverse().find((event) => event.status === 'CANCELLED') : null;
  const awaitingPhonePe = order.orderStatus === 'PENDING' && order.paymentMethod === 'ONLINE' && order.paymentStatus !== 'PAID';

  return (
    <Panel>
      {cancelled && (
        <div className="flex items-start gap-3 border-b border-danger/20 bg-danger/[0.06] px-5 py-3.5 text-sm">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="font-semibold text-danger">
              Cancelled{cancelEvent ? ` · ${formatDateTime(cancelEvent.at)}` : ''}
            </p>
            {cancelEvent?.note && <p className="mt-0.5 text-ink-muted">Reason: {cancelEvent.note}</p>}
          </div>
        </div>
      )}
      {awaitingPhonePe && (
        <div className="flex items-start gap-3 border-b border-warning/20 bg-warning/[0.07] px-5 py-3.5 text-sm">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-ink">
            <span className="font-semibold">Waiting for PhonePe.</span>{' '}
            <span className="text-ink-muted">The order confirms itself the moment the payment is confirmed.</span>
          </p>
        </div>
      )}

      <div className="overflow-x-auto px-5 py-5">
        <ol className="grid min-w-[36rem] grid-cols-6">
          {STEPS.map((step, index) => {
            const done = index <= current;
            const isCurrent = index === current && !cancelled;
            const at = reachedAt(order, step.status);
            const Icon = step.icon;
            return (
              <li key={step.status} className="relative flex flex-col items-center text-center">
                {index < STEPS.length - 1 && (
                  <span aria-hidden="true" className="absolute left-1/2 top-5 h-0.5 w-full bg-line">
                    <span
                      className={cn(
                        'block h-full rounded-full transition-all duration-700',
                        index < current ? (cancelled ? 'w-full bg-ink-subtle' : 'w-full bg-success') : 'w-0',
                      )}
                    />
                  </span>
                )}
                <span
                  className={cn(
                    'relative grid h-10 w-10 place-items-center rounded-full border-2 transition-all duration-300',
                    isCurrent
                      ? 'border-primary bg-primary text-white shadow-[0_8px_20px_-8px_rgb(var(--admin-primary)/0.8)]'
                      : done
                        ? cancelled
                          ? 'border-ink-subtle bg-ink-subtle text-white'
                          : 'border-success bg-success text-white'
                        : 'border-line bg-panel text-ink-subtle',
                  )}
                >
                  {isCurrent && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-primary/30 [animation-iteration-count:3]" />}
                  {done && !isCurrent ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className={cn('mt-2 text-xs font-semibold', isCurrent ? 'text-primary' : done ? 'text-ink' : 'text-ink-subtle')}>
                  {step.label}
                </span>
                <span className="mt-0.5 text-[0.6875rem] text-ink-subtle">
                  {at ? formatDateTime(at) : done && index > 0 ? 'Skipped' : ''}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermission();
  const canUpdate = can(P.ORDERS_UPDATE);
  const canDelete = isSuperAdmin && can(P.ORDERS_DELETE);
  const [isDeleting, setIsDeleting] = useState(false);

  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');
  const [teamNote, setTeamNote] = useState('');
  const [shipment, setShipment] = useState<{ carrier: string; trackingNumber: string; trackingUrl: string; estimatedDelivery: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: () => ordersApi.get(id),
    enabled: Boolean(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
  };

  // Courier details belong to the move that puts the parcel in transit.
  const takesShipment = nextStatus === 'SHIPPED' || nextStatus === 'OUT_FOR_DELIVERY';

  const updateStatus = useMutation({
    mutationFn: () =>
      ordersApi.updateStatus(
        id,
        nextStatus,
        statusNote,
        takesShipment && shipment
          ? { ...shipment, estimatedDelivery: shipment.estimatedDelivery || null }
          : undefined,
      ),
    onSuccess: ({ email }) => {
      // The status change stands either way; say what happened to the email.
      if (email?.status === 'sent') toast.success('Order updated · customer emailed');
      else if (email?.status === 'failed') toast.error('Order updated — the customer email could not be sent. Retry it from Customer emails.');
      else if (email?.status === 'queued') toast.success('Order updated · email is on its way');
      else toast.success('Order status updated');
      setStatusNote('');
      setNextStatus('');
      setShipment(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update this order')),
  });

  const addNote = useMutation({
    mutationFn: () => ordersApi.addNote(id, teamNote),
    onSuccess: () => {
      toast.success('Note added to the history');
      setTeamNote('');
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not add that note')),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-20 w-full" />)}
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data?.order) return <ErrorState title="Order not found" onRetry={() => refetch()} />;

  const order = data.order;
  const address = order.shippingAddress;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const payment = paymentStatusView(order.paymentStatus);
  const isCod = order.paymentMethod === 'COD';
  const lastUpdate = order.statusHistory[order.statusHistory.length - 1]?.at ?? order.createdAt;
  const customerNote = (order as AdminOrder & { customerNote?: string }).customerNote;

  // Online orders are confirmed by PhonePe, not by hand.
  const awaitingPhonePe = order.paymentMethod === 'ONLINE' && order.paymentStatus !== 'PAID';
  const moves = (TRANSITIONS[order.orderStatus] ?? []).map((status) => ({
    status,
    blocked: status === 'CONFIRMED' && awaitingPhonePe ? 'Confirmed automatically once PhonePe confirms the payment.' : null,
  }));
  const suggested = moves.find((move) => move.status !== 'CANCELLED' && !move.blocked)?.status;

  const choose = (status: OrderStatus) => {
    setNextStatus(status);
    // Prefill from what is already on the order, so moving on to Out for
    // delivery keeps the tracking number.
    if ((status === 'SHIPPED' || status === 'OUT_FOR_DELIVERY') && !shipment) {
      setShipment({
        carrier: order.shipment?.carrier ?? '',
        trackingNumber: order.shipment?.trackingNumber ?? '',
        trackingUrl: order.shipment?.trackingUrl ?? '',
        estimatedDelivery: order.shipment?.estimatedDelivery?.slice(0, 10) ?? '',
      });
    }
  };

  const fullAddress = [
    address.name,
    [address.addressLine1, address.addressLine2].filter(Boolean).join(', '),
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.phone,
  ].join('\n');

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(fullAddress);
      toast.success('Address copied');
    } catch {
      toast.error('Could not copy — select the address instead');
    }
  };

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDateTime(order.createdAt)} · ${itemCount} item${itemCount === 1 ? '' : 's'}`}
        breadcrumbs={[{ label: 'Operations' }, { label: 'Orders', to: '/orders' }, { label: order.orderNumber }]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/orders')}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              All orders
            </Button>
            {canDelete && (
              <Button variant="outline" size="sm" onClick={() => setIsDeleting(true)} className="text-danger hover:bg-danger/5">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </Button>
            )}
          </>
        }
      />

      <div className="stagger space-y-4">
        {/* At a glance */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={CheckCircle2} label="Status" tone={order.orderStatus === 'CANCELLED' ? 'danger' : order.orderStatus === 'DELIVERED' ? 'success' : 'primary'}>
            <OrderStatusBadge status={order.orderStatus} />
            <p className="mt-1.5 text-xs text-ink-subtle">Updated {formatDateTime(lastUpdate)}</p>
          </Stat>
          <Stat icon={isCod ? Banknote : Smartphone} label="Payment" tone={payment.tone === 'success' ? 'success' : payment.tone === 'danger' ? 'danger' : 'warning'}>
            <p className="text-sm font-semibold text-ink">{isCod ? 'Cash on Delivery' : 'PhonePe (online)'}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={payment.tone}>{payment.label}</Badge>
              {isCod && order.paymentStatus !== 'PAID' && order.orderStatus !== 'CANCELLED' && (
                <span className="text-xs text-ink-muted">Collect {formatPrice(order.total)}</span>
              )}
            </div>
          </Stat>
          <Stat icon={Receipt} label="Order total" tone="info">
            <p className="tabular text-xl font-bold text-ink">{formatPrice(order.total)}</p>
            <p className="text-xs text-ink-subtle">
              {itemCount} item{itemCount === 1 ? '' : 's'} · shipping {order.shippingFee ? formatPrice(order.shippingFee) : 'free'}
            </p>
          </Stat>
          <Stat icon={User} label="Customer">
            <p className="truncate text-sm font-semibold text-ink">{order.user?.name || address.name}</p>
            <p className="truncate text-xs text-ink-subtle">{order.user?.email ?? 'Account deleted'}</p>
          </Stat>
        </div>

        <Progress order={order} />

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Right column first in the page, so on a phone the actions come before the long lists. */}
          <div className="space-y-4 lg:col-start-3 lg:row-start-1">
            {canUpdate && (
              <Panel title="What's next?" description={moves.length ? 'Pick where this order goes now.' : undefined}>
                <div className="space-y-3 p-5">
                  {moves.length === 0 ? (
                    <div className="flex items-start gap-3 rounded-xl bg-canvas p-4 text-sm">
                      {order.orderStatus === 'DELIVERED' ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                      ) : (
                        <Info className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
                      )}
                      <p className="text-ink-muted">
                        {order.orderStatus === 'DELIVERED'
                          ? 'Delivered — nothing more to do on this order.'
                          : 'This order is cancelled and cannot be changed.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div role="radiogroup" aria-label="Next status" className="space-y-2">
                        {moves.map(({ status, blocked }) => {
                          const move = MOVES[status];
                          const Icon = move.icon;
                          const selected = nextStatus === status;
                          const danger = status === 'CANCELLED';
                          return (
                            <button
                              key={status}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              disabled={Boolean(blocked)}
                              onClick={() => choose(status)}
                              className={cn(
                                'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200',
                                blocked && 'cursor-not-allowed opacity-55',
                                selected
                                  ? danger
                                    ? 'border-danger bg-danger/[0.05] ring-1 ring-danger'
                                    : 'border-primary bg-primary/[0.05] ring-1 ring-primary'
                                  : 'border-line bg-panel hover:border-ink-subtle/60 hover:bg-canvas',
                              )}
                            >
                              <span
                                className={cn(
                                  'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                                  danger ? 'bg-danger/10 text-danger' : selected ? 'bg-primary text-white' : 'bg-canvas text-ink-muted',
                                )}
                                aria-hidden="true"
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className={cn('text-sm font-semibold', danger ? 'text-danger' : 'text-ink')}>{move.action}</span>
                                  {status === suggested && (
                                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-success">
                                      Next step
                                    </span>
                                  )}
                                </span>
                                <span className="mt-0.5 block text-xs text-ink-muted">
                                  {blocked ?? (status === 'DELIVERED' && isCod ? 'The customer received it and paid the courier.' : move.hint)}
                                </span>
                              </span>
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2',
                                  selected ? (danger ? 'border-danger bg-danger text-white' : 'border-primary bg-primary text-white') : 'border-line',
                                )}
                              >
                                {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {takesShipment && shipment && (
                        <div className="animate-page-in space-y-3 rounded-xl border border-line bg-canvas p-4">
                          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                            <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
                            Courier details
                          </p>
                          <p className="text-xs text-ink-muted">
                            Shown to the customer in their email and order page. All optional.
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                            <Input
                              label="Courier"
                              value={shipment.carrier}
                              onChange={(event) => setShipment({ ...shipment, carrier: event.target.value })}
                              placeholder="Delhivery, Blue Dart…"
                            />
                            <Input
                              label="Tracking number"
                              value={shipment.trackingNumber}
                              onChange={(event) => setShipment({ ...shipment, trackingNumber: event.target.value })}
                            />
                          </div>
                          <Input
                            label="Tracking link"
                            value={shipment.trackingUrl}
                            onChange={(event) => setShipment({ ...shipment, trackingUrl: event.target.value })}
                            placeholder="https://…"
                          />
                          <Input
                            label="Estimated delivery"
                            type="date"
                            value={shipment.estimatedDelivery}
                            onChange={(event) => setShipment({ ...shipment, estimatedDelivery: event.target.value })}
                          />
                        </div>
                      )}

                      {nextStatus && (
                        <div className="animate-page-in space-y-3">
                          <Textarea
                            label={nextStatus === 'CANCELLED' ? 'Reason (shown to the customer)' : 'Note (optional)'}
                            rows={2}
                            value={statusNote}
                            onChange={(event) => setStatusNote(event.target.value)}
                            placeholder={nextStatus === 'CANCELLED' ? 'Why the order was cancelled' : 'Anything worth remembering about this step'}
                          />
                          {nextStatus !== 'PENDING' && (
                            <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
                              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                              The customer is emailed automatically.
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              fullWidth
                              variant={nextStatus === 'CANCELLED' ? 'danger' : 'primary'}
                              onClick={() => updateStatus.mutate()}
                              isLoading={updateStatus.isPending}
                            >
                              {MOVES[nextStatus].action}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setNextStatus('');
                                setStatusNote('');
                              }}
                              disabled={updateStatus.isPending}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Panel>
            )}

            <Panel
              title="Customer & delivery"
              actions={
                <Button variant="ghost" size="sm" onClick={copyAddress}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy
                </Button>
              }
            >
              <div className="space-y-3 p-5 text-sm">
                <div className="flex items-start gap-3 rounded-xl bg-canvas p-4">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <address className="not-italic leading-relaxed text-ink-muted">
                    <span className="block font-semibold text-ink">{address.name}</span>
                    {address.addressLine1}
                    {address.addressLine2 && <>, {address.addressLine2}</>}
                    <br />
                    {address.city}, {address.state} <span className="font-medium text-ink">{address.postalCode}</span>
                  </address>
                </div>
                {address.phone && (
                  <a href={`tel:${address.phone}`} className="flex items-center gap-3 rounded-lg px-1 py-1 text-ink transition-colors hover:text-primary">
                    <Phone className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
                    {address.phone}
                  </a>
                )}
                {order.user?.email && (
                  <a href={`mailto:${order.user.email}`} className="flex items-center gap-3 rounded-lg px-1 py-1 text-ink transition-colors hover:text-primary">
                    <Mail className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
                    <span className="truncate">{order.user.email}</span>
                  </a>
                )}
                {customerNote && (
                  <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/[0.07] p-3">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    <p>
                      <span className="block text-xs font-semibold text-ink">Note from the customer</span>
                      <span className="text-ink-muted">{customerNote}</span>
                    </p>
                  </div>
                )}
              </div>
            </Panel>

            {['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.orderStatus) && (
              <OrderShipmentPanel order={order} canUpdate={canUpdate} />
            )}
            {order.paymentMethod === 'ONLINE' && <OrderPaymentPanel order={order} canVerify={canUpdate} />}
          </div>

          <div className="space-y-4 lg:col-span-2 lg:col-start-1 lg:row-start-1">
            <Panel title="Items" description={`${itemCount} item${itemCount === 1 ? '' : 's'} in this order`}>
              <ul className="divide-y divide-line">
                {order.items.map((item, index) => (
                  <li key={`${item.sku}-${index}`} className="flex items-center gap-4 px-5 py-4">
                    {item.image ? (
                      <img src={item.image} alt="" loading="lazy" className="h-20 w-16 shrink-0 rounded-lg object-cover ring-1 ring-line" />
                    ) : (
                      <div className="h-20 w-16 shrink-0 rounded-lg bg-canvas ring-1 ring-line" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                        <span className="rounded-md bg-canvas px-2 py-0.5 text-ink-muted ring-1 ring-line">{item.color}</span>
                        <span className="rounded-md bg-canvas px-2 py-0.5 text-ink-muted ring-1 ring-line">Size {item.size}</span>
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">Qty {item.quantity}</span>
                      </div>
                      <p className="mt-1.5 truncate font-mono text-[0.6875rem] text-ink-subtle">{item.sku}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-sm font-semibold text-ink">{formatPrice(item.lineTotal)}</p>
                      {item.quantity > 1 && (
                        <p className="tabular text-xs text-ink-subtle">
                          {formatPrice(item.price)} × {item.quantity}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <dl className="space-y-2 border-t border-line bg-canvas/40 px-5 py-4 text-sm">
                <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd className="tabular">{formatPrice(order.subtotal)}</dd></div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-primary"><dt>Discount</dt><dd className="tabular">−{formatPrice(order.discount)}</dd></div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Shipping</dt>
                  <dd className={cn('tabular', !order.shippingFee && 'text-success')}>{order.shippingFee ? formatPrice(order.shippingFee) : 'Free'}</dd>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-3">
                  <dt className="font-semibold text-ink">Total</dt>
                  <dd className="tabular text-lg font-bold text-ink">{formatPrice(order.total)}</dd>
                </div>
              </dl>
            </Panel>

            <Panel title="History" description="Every step this order has taken, newest first.">
              <ol className="px-5 py-4">
                {[...order.statusHistory].reverse().map((event, index, list) => (
                  <li key={index} className="relative flex gap-4 pb-5 last:pb-0">
                    {index < list.length - 1 && (
                      <span aria-hidden="true" className="absolute left-[0.4375rem] top-5 h-[calc(100%-1rem)] w-px bg-line" />
                    )}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ring-4',
                        DOT[event.status] ?? 'bg-ink-subtle',
                        index === 0 ? 'ring-primary/15' : 'ring-panel',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <OrderStatusBadge status={event.status} />
                        <span className="text-xs text-ink-subtle">{formatDateTime(event.at)}</span>
                      </div>
                      {event.note && <p className="mt-1.5 text-sm text-ink">{event.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>

              {canUpdate && (
                <div className="border-t border-line bg-canvas/40 p-5">
                  <Textarea
                    label="Add a team note"
                    hint="Saved to the history. The customer is not emailed."
                    rows={2}
                    value={teamNote}
                    onChange={(event) => setTeamNote(event.target.value)}
                    placeholder="Called the customer, asked to leave at the gate…"
                  />
                  <div className="mt-3 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => addNote.mutate()} isLoading={addNote.isPending} disabled={!teamNote.trim()}>
                      <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                      Save note
                    </Button>
                  </div>
                </div>
              )}
            </Panel>

            <OrderEmailsPanel orderId={order._id} canRetry={canUpdate} />
          </div>
        </div>
      </div>

      <DeleteOrderDialog
        order={isDeleting ? order : null}
        onClose={() => setIsDeleting(false)}
        onDeleted={() => navigate('/orders', { replace: true })}
      />
    </>
  );
}

export default OrderDetailPage;
