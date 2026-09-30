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
import { PageHeader, Panel, Input, Select, Badge, TableSkeleton, EmptyState, ErrorState, Pagination } from '@/components/ui';
import { OrderStatusBadge } from '@/components/common/OrderStatusBadge';
import { DeleteOrderDialog } from '@/components/orders/DeleteOrderDialog';
import { paymentStatusView } from '@/lib/payments';
import { PAGE_SIZE } from '@/lib/pagination';

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

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order placed on the storefront."
        breadcrumbs={[{ label: 'Operations' }, { label: 'Orders' }]}
      />

      <Panel>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by order number, name or phone…"
              aria-label="Search orders"
              className="pl-9"
            />
          </div>

          <Select
            value={params.status ?? ''}
            onChange={(event) => setParam('status', event.target.value || undefined)}
            aria-label="Filter by status"
            className="w-full sm:w-44"
          >
            <option value="">All statuses</option>
            {Object.keys(TRANSITIONS).map((status) => (
              <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : orders.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No orders match those filters" />
        ) : (
          <div className={cn(isPlaceholderData && 'opacity-60 transition-opacity')}>
            {/* Phones and tablets: one card per order, so nothing needs sideways scrolling. */}
            <ul className="grid divide-y divide-line sm:grid-cols-2 sm:gap-px sm:divide-y-0 sm:bg-line xl:hidden">
              {orders.map((order) => {
                const payment = paymentStatusView(order.paymentStatus);
                return (
                  <li key={order._id} className="flex flex-col bg-panel px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/orders/${order._id}`} className="break-all text-sm font-semibold text-ink hover:text-primary">
                          {order.orderNumber}
                        </Link>
                        <p className="text-xs text-ink-subtle">{formatDate(order.createdAt)}</p>
                      </div>
                      <p className="tabular shrink-0 text-sm font-semibold text-ink">{formatPrice(order.total)}</p>
                    </div>

                    <p className="mt-2 truncate text-sm text-ink">{order.shippingAddress?.name}</p>
                    <p className="truncate text-xs text-ink-subtle">{order.user?.email ?? 'Account deleted'}</p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <OrderStatusBadge status={order.orderStatus} />
                      <Badge tone={payment.tone}>
                        {order.paymentMethod === 'ONLINE' ? 'PhonePe' : 'COD'} · {payment.label}
                      </Badge>
                      <span className="text-xs text-ink-muted">
                        {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>

                    <div className="mt-auto flex items-center gap-2 pt-3">
                      <Link
                        to={`/orders/${order._id}`}
                        className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
                      >
                        View order
                      </Link>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setDeleting(order)}
                          aria-label={`Delete order ${order.orderNumber}`}
                          className="ml-auto rounded-md p-1.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="relative hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50 text-left text-xs text-ink-muted">
                  <th scope="col" className="px-5 py-2.5 font-medium">Order</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Customer</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Items</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Payment</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2.5 pr-5 text-right font-medium">Total</th>
                  {canDelete && (
                    <th scope="col" className="w-px py-2.5 pr-5">
                      <span className="sr-only">Delete</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((order) => (
                  <tr key={order._id} className="hover:bg-canvas/60">
                    <td className="px-5 py-3">
                      <Link to={`/orders/${order._id}`} className="whitespace-nowrap font-medium text-ink hover:text-primary">
                        {order.orderNumber}
                      </Link>
                      <p className="text-xs text-ink-subtle">{formatDate(order.createdAt)}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-ink">{order.shippingAddress?.name}</p>
                      <p className="text-xs text-ink-subtle">{order.user?.email ?? 'Account deleted'}</p>
                    </td>
                    <td className="tabular py-3 pr-4 text-ink-muted">{order.items.length}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={paymentStatusView(order.paymentStatus).tone}>
                        {order.paymentMethod === 'ONLINE' ? 'PhonePe' : 'COD'} · {paymentStatusView(order.paymentStatus).label}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4"><OrderStatusBadge status={order.orderStatus} /></td>
                    <td className="tabular py-3 pr-5 text-right font-medium">{formatPrice(order.total)}</td>
                    {canDelete && (
                      <td className="py-3 pr-5 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleting(order)}
                          aria-label={`Delete order ${order.orderNumber}`}
                          title="Delete order"
                          className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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
