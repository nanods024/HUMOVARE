import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ShoppingCart, Search, Trash2 } from 'lucide-react';

import { ordersApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/queryKeys';
import { TRANSITIONS } from '@/lib/orderStatus';
import { useTableQuery, useDebouncedSearch } from '@/hooks/useTableQuery';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { formatPrice, formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { AdminOrder } from '@/types';
import { PageHeader, Panel, Input, Badge, TableSkeleton, EmptyState, ErrorState, Pagination } from '@/components/ui';
import { OrderStatusBadge } from '@/components/common/OrderStatusBadge';
import { DeleteOrderDialog } from '@/components/orders/DeleteOrderDialog';
import { paymentStatusView } from '@/lib/payments';
import { PAGE_SIZE } from '@/lib/pagination';

/** Desktop grid: order, customer, status, total, actions. */
const ROW_COLUMNS = 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_7rem_2.5rem]';

export function OrdersPage() {
  const { can, isSuperAdmin } = usePermission();
  const canDelete = isSuperAdmin && can(P.ORDERS_DELETE);
  const [deleting, setDeleting] = useState<AdminOrder | null>(null);
  const { params, page, setParam, setPage } = useTableQuery();
  const [searchInput, setSearchInput] = useDebouncedSearch(params.search, setParam);


  const query = { page, limit: PAGE_SIZE, search: params.search, status: params.status };

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: queryKeys.orders.list(query),
    queryFn: () => ordersApi.list(query),
    placeholderData: keepPreviousData,
  });

  const orders = data?.orders ?? [];
  const pagination = data?.pagination;

  if (isError) return <ErrorState title="Could not load orders" onRetry={() => refetch()} />;

  const statuses = Object.keys(TRANSITIONS);
  const activeStatus = params.status ?? '';

  return (
    <>
      <PageHeader
        title="Orders"
        description={pagination ? `${pagination.totalItems} orders placed on the storefront.` : 'Every order placed on the storefront.'}
        breadcrumbs={[{ label: 'Operations' }, { label: 'Orders' }]}
      />

      <Panel>
        {/* Filters: search on top, status as swipeable pills. */}
        <div className="space-y-3 border-b border-line px-3 py-3 sm:px-5 sm:py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <Input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search order no., name or phone"
              aria-label="Search orders"
              className="h-11 rounded-xl pl-9 sm:h-10"
            />
          </div>

          <div
            role="radiogroup"
            aria-label="Filter by status"
            className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:-mx-5 sm:flex-wrap sm:overflow-visible sm:px-5 [&::-webkit-scrollbar]:hidden"
          >
            {['', ...statuses].map((status) => {
              const active = activeStatus === status;
              return (
                <button
                  key={status || 'all'}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setParam('status', status || undefined)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors',
                    active
                      ? 'border-primary bg-primary text-white'
                      : 'border-line bg-panel text-ink-muted hover:border-ink/30 hover:text-ink',
                  )}
                >
                  {status ? status.replace(/_/g, ' ').toLowerCase() : 'All'}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={4} />
        ) : orders.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No orders match those filters" />
        ) : (
          <div className={cn(isPlaceholderData && 'opacity-60 transition-opacity')}>
            {/* Column labels, only where the rows line up as columns. */}
            <div className={cn('hidden gap-4 border-b border-line bg-canvas/50 px-5 py-2.5 text-xs font-medium text-ink-muted lg:grid', ROW_COLUMNS)}>
              <span>Order</span>
              <span>Customer</span>
              <span>Status</span>
              <span className="text-right">Total</span>
              <span className="sr-only">Actions</span>
            </div>

            <ul className="divide-y divide-line">
              {orders.map((order) => {
                const payment = paymentStatusView(order.paymentStatus);
                const itemCount = order.items.length;
                const customer = order.shippingAddress?.name || order.user?.name || 'Guest';
                return (
                  <li
                    key={order._id}
                    className={cn(
                      'group relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 px-4 py-4 transition-colors hover:bg-canvas/60 sm:px-5 lg:items-center lg:gap-4 lg:py-3.5',
                      ROW_COLUMNS,
                    )}
                  >
                    {/* Order number and date. The link stretches over the whole row. */}
                    <div className="min-w-0">
                      <Link
                        to={`/orders/${order._id}`}
                        className="block truncate text-sm font-semibold text-ink after:absolute after:inset-0 group-hover:text-primary"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-subtle">
                        {formatDate(order.createdAt)} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
                      </p>
                    </div>

                    {/* Total: top-right on phones, its own column on desktop. */}
                    <p className="tabular text-right text-sm font-semibold text-ink lg:order-4">{formatPrice(order.total)}</p>

                    <div className="col-span-2 flex min-w-0 items-center gap-2.5 lg:order-2 lg:col-span-1">
                      <span
                        aria-hidden="true"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary"
                      >
                        {customer.trim().charAt(0) || '?'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{customer}</p>
                        <p className="truncate text-xs text-ink-subtle">{order.user?.email ?? 'Account deleted'}</p>
                      </div>
                    </div>

                    <div className="col-span-1 flex min-w-0 flex-wrap items-center gap-1.5 lg:order-3">
                      <OrderStatusBadge status={order.orderStatus} />
                      <Badge tone={payment.tone}>
                        {order.paymentMethod === 'ONLINE' ? 'PhonePe' : 'COD'} · {payment.label}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-end lg:order-5">
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setDeleting(order)}
                          aria-label={`Delete order ${order.orderNumber}`}
                          title="Delete order"
                          className="relative z-10 rounded-lg p-2 text-ink-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {pagination && (
          <Pagination
            pageSize={PAGE_SIZE}
            page={pagination.currentPage}
            totalPages={pagination.totalPages}
            total={pagination.totalItems}
            onChange={setPage}
          />
        )}
      </Panel>
      <DeleteOrderDialog order={deleting} onClose={() => setDeleting(null)} onDeleted={() => setDeleting(null)} />
    </>
  );
}

export default OrdersPage;
