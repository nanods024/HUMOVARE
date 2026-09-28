import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, ChevronRight, CalendarDays, ShoppingBag } from 'lucide-react';
import { ordersApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { formatPrice, formatDate, pluralise } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { OrderStatusBadge } from '@/components/account/OrderStatusBadge';

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'active', label: 'In progress', match: (s: string) => !['DELIVERED', 'CANCELLED'].includes(s) },
  { key: 'delivered', label: 'Delivered', match: (s: string) => s === 'DELIVERED' },
  { key: 'cancelled', label: 'Cancelled', match: (s: string) => s === 'CANCELLED' },
] as const;

export function OrdersPage() {
  useSeo({ title: 'Your orders', noindex: true });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.orders.list({ page: 1 }),
    queryFn: () => ordersApi.list({ limit: 20 }),
  });

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, orders.filter((o) => f.match(o.orderStatus)).length])),
    [orders],
  );
  const visible = orders.filter((order) => FILTERS.find((f) => f.key === filter)!.match(order.orderStatus));

  if (isLoading) return <ListSkeleton rows={3} />;
  if (isError) return <ErrorState title="Could not load your orders" onRetry={() => refetch()} />;

  if (!orders.length) {
    return (
      <div className="acct-card">
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="Once you place an order it will show up here, with tracking."
          action={{ label: 'Start shopping', to: '/shop' }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wider">Order history</h2>
          <p className="mt-1 text-sm text-ink-muted">{pluralise(orders.length, 'order')} placed with HUMOVARE</p>
        </div>

        <div role="tablist" aria-label="Filter orders" className="scroll-rail gap-1 rounded-2xl border border-line bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-300',
                filter === f.key ? 'bg-canvas text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
              )}
            >
              {f.label}
              <span className={cn('ml-1.5 tabular-nums', filter === f.key ? 'text-primary' : 'text-ink-subtle')}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="acct-card animate-fade-in px-6 py-14 text-center text-sm text-ink-muted">
          No orders here yet.
        </div>
      ) : (
        <ul key={filter} className="acct-stagger space-y-4">
          {visible.map((order) => (
            <li key={order._id}>
              <Link
                to={`/account/orders/${order._id}`}
                className="acct-card acct-card-hover group flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5"
              >
                <ul className="flex shrink-0 -space-x-4">
                  {order.items.slice(0, 3).map((item, index) => (
                    <li key={`${item.sku}-${index}`} style={{ zIndex: 10 - index }}>
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          loading="lazy"
                          className="h-20 w-16 rounded-xl border-2 border-canvas bg-surface object-cover shadow-sm transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <span className="grid h-20 w-16 place-items-center rounded-xl border-2 border-canvas bg-surface">
                          <ShoppingBag className="h-5 w-5 text-ink-subtle" aria-hidden="true" />
                        </span>
                      )}
                    </li>
                  ))}
                  {order.items.length > 3 && (
                    <li className="grid h-20 w-16 place-items-center rounded-xl border-2 border-canvas bg-ink-black text-xs font-bold text-white">
                      +{order.items.length - 3}
                    </li>
                  )}
                </ul>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="text-sm font-bold tracking-wide">{order.orderNumber}</p>
                    <OrderStatusBadge status={order.orderStatus} />
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    Placed {formatDate(order.createdAt)}
                    <span aria-hidden="true">·</span>
                    {pluralise(order.items.length, 'item')}
                  </p>
                  <p className="mt-1 truncate text-xs text-ink-subtle">
                    {order.items.map((item) => item.name).join(', ')}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-line pt-3 sm:border-0 sm:pt-0 sm:text-right">
                  <div>
                    <p className="text-[0.6875rem] uppercase tracking-wider text-ink-subtle">Total</p>
                    <p className="text-base font-bold">{formatPrice(order.total)}</p>
                  </div>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-surface transition-all duration-300 group-hover:bg-primary group-hover:text-white">
                    <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default OrdersPage;
