import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Users, Search, ArrowLeft, Trash2 } from 'lucide-react';

import { customersApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { useTableQuery, useDebouncedSearch } from '@/hooks/useTableQuery';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { formatPrice, formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import {
  PageHeader, Panel, Button, Input, Badge, TableSkeleton, EmptyState, ErrorState,
  Pagination, Skeleton, ConfirmDialog, Checkbox,
} from '@/components/ui';
import { OrderStatusBadge } from '@/components/common/OrderStatusBadge';
import { TypeToConfirmDialog } from '@/components/common/TypeToConfirmDialog';
import { PAGE_SIZE } from '@/lib/pagination';

export function CustomersPage() {
  const { params, page, setParam, setPage } = useTableQuery();
  const [searchInput, setSearchInput] = useDebouncedSearch(params.search, setParam);


  const query = { page, limit: PAGE_SIZE, search: params.search };

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: queryKeys.customers.list(query),
    queryFn: () => customersApi.list(query),
    placeholderData: keepPreviousData,
  });

  const customers = data?.customers ?? [];
  const pagination = data?.pagination;

  if (isError) return <ErrorState title="Could not load customers" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Accounts that have registered on the storefront."
        breadcrumbs={[{ label: 'Operations' }, { label: 'Customers' }]}
      />

      <Panel>
        <div className="border-b border-line px-5 py-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name, email or phone…"
              aria-label="Search customers"
              className="pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : customers.length === 0 ? (
          <EmptyState icon={Users} title="No customers match that search" />
        ) : (
          <div className={cn('overflow-x-auto', isPlaceholderData && 'opacity-60 transition-opacity')}>
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50 text-left text-xs text-ink-muted">
                  <th scope="col" className="px-5 py-2.5 font-medium">Customer</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Orders</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Spent</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Joined</th>
                  <th scope="col" className="py-2.5 pr-5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-canvas/60">
                    <td className="px-5 py-3">
                      <Link to={`/customers/${customer.id}`} className="font-medium text-ink hover:text-primary">
                        {customer.name}
                      </Link>
                      <p className="text-xs text-ink-subtle">{customer.email}</p>
                    </td>
                    <td className="tabular py-3 pr-4 text-ink-muted">{customer.orderCount}</td>
                    <td className="tabular py-3 pr-4 font-medium">{formatPrice(customer.totalSpent)}</td>
                    <td className="py-3 pr-4 text-ink-subtle">{formatDate(customer.createdAt)}</td>
                    <td className="py-3 pr-5">
                      <Badge tone={customer.isActive ? 'success' : 'danger'}>
                        {customer.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </>
  );
}

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermission();
  const canDelete = isSuperAdmin && can(P.CUSTOMERS_DELETE);
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [alsoOrders, setAlsoOrders] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => customersApi.get(id),
    enabled: Boolean(id),
  });

  const setActive = useMutation({
    mutationFn: (isActive: boolean) => customersApi.setActive(id, isActive),
    onSuccess: () => {
      toast.success('Customer updated');
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update this customer')),
  });

  const remove = useMutation({
    mutationFn: () => customersApi.remove(id, alsoOrders),
    onSuccess: ({ ordersDeleted, ordersKept }) => {
      toast.success(
        ordersDeleted
          ? `Customer and ${ordersDeleted} order(s) deleted`
          : ordersKept
            ? `Customer deleted · ${ordersKept} order(s) kept`
            : 'Customer deleted',
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      navigate('/customers', { replace: true });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not delete this customer')),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data?.customer) return <ErrorState title="Customer not found" onRetry={() => refetch()} />;

  const customer = data.customer;

  return (
    <>
      <PageHeader
        title={customer.name}
        description={customer.email}
        breadcrumbs={[{ label: 'Operations' }, { label: 'Customers', to: '/customers' }, { label: customer.name }]}
        actions={
          <>
            {can(P.CUSTOMERS_UPDATE) && (
              <Button
                variant={customer.isActive ? 'outline' : 'primary'}
                onClick={() => setConfirming(true)}
              >
                {customer.isActive ? 'Disable account' : 'Enable account'}
              </Button>
            )}
            {canDelete && (
              <Button variant="danger" onClick={() => { setAlsoOrders(false); setIsDeleting(true); }}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete account
              </Button>
            )}
          </>
        }
      />

      <div className="stagger grid gap-4 lg:grid-cols-3">
        <Panel title="Profile">
          <dl className="space-y-2.5 p-5 text-sm">
            <div><dt className="text-xs text-ink-subtle">Email</dt><dd>{customer.email}</dd></div>
            <div><dt className="text-xs text-ink-subtle">Phone</dt><dd>{customer.phone || '—'}</dd></div>
            <div><dt className="text-xs text-ink-subtle">Joined</dt><dd>{formatDate(customer.createdAt)}</dd></div>
            <div>
              <dt className="text-xs text-ink-subtle">Last signed in</dt>
              <dd>{customer.lastLoginAt ? formatDate(customer.lastLoginAt) : 'Never'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Status</dt>
              <dd><Badge tone={customer.isActive ? 'success' : 'danger'}>{customer.isActive ? 'Active' : 'Disabled'}</Badge></dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Order history" className="lg:col-span-2">
          {customer.orders?.length ? (
            <ul className="divide-y divide-line">
              {customer.orders.map((order) => (
                <li key={order._id}>
                  <Link to={`/orders/${order._id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{order.orderNumber}</p>
                      <p className="text-xs text-ink-subtle">{formatDate(order.createdAt)}</p>
                    </div>
                    <OrderStatusBadge status={order.orderStatus} />
                    <span className="tabular w-20 text-right text-sm font-medium">{formatPrice(order.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No orders yet" />
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/customers')}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to customers
        </Button>
      </div>

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => setActive.mutate(!customer.isActive)}
        title={customer.isActive ? 'Disable this account?' : 'Enable this account?'}
        message={
          customer.isActive
            ? 'They will be signed out everywhere immediately and will not be able to sign in again. Their orders are kept.'
            : 'They will be able to sign in again.'
        }
        confirmLabel={customer.isActive ? 'Disable' : 'Enable'}
        tone={customer.isActive ? 'danger' : 'primary'}
        isLoading={setActive.isPending}
      />

      <TypeToConfirmDialog
        isOpen={isDeleting}
        onClose={() => setIsDeleting(false)}
        onConfirm={() => remove.mutate()}
        title="Delete this customer permanently?"
        confirmText={customer.email}
        isLoading={remove.isPending}
      >
        <p>
          <strong className="text-ink">{customer.name}</strong>&apos;s account is removed from the database with their
          saved addresses, cart, wishlist and messages. They are signed out at once and cannot sign in again.
          This cannot be undone.
        </p>
        {(customer.orders?.length ?? 0) > 0 && (
          <div className="rounded-md bg-panel p-2.5 ring-1 ring-inset ring-line">
            <Checkbox
              label="Also delete their orders"
              description={
                alsoOrders
                  ? 'Their orders are deleted too. Unshipped items go back into stock.'
                  : 'Off: their orders stay in Orders as business records.'
              }
              checked={alsoOrders}
              onChange={(event) => setAlsoOrders(event.target.checked)}
            />
          </div>
        )}
      </TypeToConfirmDialog>
    </>
  );
}

export default CustomersPage;
