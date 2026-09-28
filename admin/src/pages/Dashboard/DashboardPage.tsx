import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { IndianRupee, ShoppingCart, Users, Package, TriangleAlert, ArrowRight, ChevronRight } from 'lucide-react';

import { dashboardApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/queryKeys';
import { formatPrice, formatNumber, formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import { PageHeader, Panel, Badge, Skeleton, ErrorState, EmptyState } from '@/components/ui';
import { OrderStatusBadge } from '@/components/common/OrderStatusBadge';

/** Each stat's accent: the icon chip and the soft glow behind it. */
const STAT_TONES = [
  'from-primary/15 to-primary/5 text-primary',
  'from-info/15 to-info/5 text-info',
  'from-success/15 to-success/5 text-success',
  'from-warning/20 to-warning/5 text-warning',
];

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: '1px solid rgb(var(--admin-border))',
  boxShadow: '0 12px 24px -8px rgb(16 24 40 / 0.18)',
  padding: '8px 12px',
};

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last-7-days', label: 'Last 7 days' },
  { value: 'last-30-days', label: 'Last 30 days' },
  { value: 'this-month', label: 'This month' },
];

export function DashboardPage() {
  const [range, setRange] = useState('last-30-days');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.dashboard({ range }),
    queryFn: () => dashboardApi.get({ range }),
  });

  if (isError) return <ErrorState title="Could not load the dashboard" onRetry={() => refetch()} />;

  const totals = data?.totals;
  const products = data?.products;

  const stats = [
    {
      label: 'Revenue',
      value: totals ? formatPrice(totals.revenue) : '—',
      icon: IndianRupee,
      hint: totals ? `${formatNumber(totals.itemsSold)} items sold` : '',
    },
    {
      label: 'Orders',
      value: totals ? formatNumber(totals.orders) : '—',
      icon: ShoppingCart,
      hint: totals ? `${formatPrice(totals.averageOrderValue)} average` : '',
    },
    {
      label: 'Customers',
      value: totals ? formatNumber(totals.customers) : '—',
      icon: Users,
      hint: totals ? `${formatNumber(totals.newCustomers)} new this period` : '',
    },
    {
      label: 'Products',
      value: products ? formatNumber(products.active) : '—',
      icon: Package,
      hint: products ? `${formatNumber(products.total)} total` : '',
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything below is calculated from live order and catalogue data."
        actions={
          <div className="flex flex-wrap gap-1 rounded-xl border border-line/80 bg-panel p-1 shadow-panel" role="group" aria-label="Date range">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                aria-pressed={range === option.value}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-smooth active:scale-95',
                  range === option.value
                    ? 'bg-ink text-white shadow-sm'
                    : 'text-ink-muted hover:bg-ink/[0.05] hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => (
          <div key={stat.label} className="panel panel-interactive group relative overflow-hidden p-5">
            {/* A soft wash in the stat's colour, strongest on hover. */}
            <div
              className={cn(
                'pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100',
                STAT_TONES[index % STAT_TONES.length],
              )}
              aria-hidden="true"
            />
            <div className="relative flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{stat.label}</p>
              <span
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br transition-transform duration-300 ease-smooth group-hover:scale-110 group-hover:-rotate-6',
                  STAT_TONES[index % STAT_TONES.length],
                )}
              >
                <stat.icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="relative mt-3 h-8 w-28" />
            ) : (
              <p key={`${range}-${stat.value}`} className="tabular relative mt-2 animate-fade-in text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
                {stat.value}
              </p>
            )}
            {stat.hint && <p className="relative mt-1 text-xs text-ink-muted">{stat.hint}</p>}
          </div>
        ))}
      </div>

      {/* Inventory alerts earn a place at the top — they are the numbers that
          need acting on today. */}
      {products && (products.outOfStock > 0 || products.lowStock > 0) && (
        <div className="mt-4 flex animate-page-in flex-wrap items-center gap-3 rounded-panel border border-warning/25 bg-gradient-to-r from-warning/10 via-warning/5 to-transparent px-4 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warning/15">
            <TriangleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
          </span>
          <p className="text-sm text-ink">
            <strong className="font-semibold">{products.lowStock}</strong> low on stock ·{' '}
            <strong className="font-semibold">{products.outOfStock}</strong> out of stock
          </p>
          <Link to="/inventory?status=low" className="group ml-auto flex items-center gap-1 text-xs font-semibold text-primary">
            Review inventory
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      <div className="stagger mt-6 grid gap-4 xl:grid-cols-3">
        <Panel title="Revenue & orders" className="xl:col-span-2">
          <div className="h-72 p-4">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : data?.charts.trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.charts.trend} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--admin-primary))" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="rgb(var(--admin-primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--admin-border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'rgb(var(--admin-subtle))' }}
                    tickFormatter={(value) => String(value).slice(5)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'rgb(var(--admin-subtle))' }}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                    tickFormatter={(value) => formatPrice(Number(value))}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ stroke: 'rgb(var(--admin-primary))', strokeOpacity: 0.25, strokeWidth: 1 }}
                    formatter={(value: number, name) =>
                      name === 'revenue' ? [formatPrice(value), 'Revenue'] : [value, 'Orders']
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="rgb(var(--admin-primary))"
                    strokeWidth={2.25}
                    fill="url(#revenueFill)"
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--admin-panel))' }}
                    animationDuration={700}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No orders in this period" description="Pick a wider date range to see a trend." />
            )}
          </div>
        </Panel>

        <Panel title="Top products" description="By units sold in this period">
          <div className="h-72 p-4">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : data?.charts.topProducts.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.charts.topProducts.slice(0, 6)}
                  layout="vertical"
                  margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--admin-border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'rgb(var(--admin-subtle))' }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 10, fill: 'rgb(var(--admin-subtle))' }}
                    tickFormatter={(value) => String(value).replace('HUMOVARE ', '').slice(0, 18)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: 'rgb(var(--admin-canvas))' }}
                    formatter={(value: number) => [value, 'Units']}
                  />
                  <Bar dataKey="unitsSold" fill="rgb(var(--admin-primary))" radius={[0, 6, 6, 0]} barSize={14} animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Nothing sold yet" />
            )}
          </div>
        </Panel>
      </div>

      <div className="stagger mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Recent orders"
          actions={
            <Link to="/orders" className="group flex items-center gap-1 text-xs font-semibold text-primary">
              All orders <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          }
        >
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : data?.recentOrders.length ? (
            <ul className="divide-y divide-line">
              {data.recentOrders.map((order) => (
                <li key={order._id}>
                  <Link to={`/orders/${order._id}`} className="group flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-canvas/70">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{order.orderNumber}</p>
                      <p className="truncate text-xs text-ink-subtle">
                        {order.shippingAddress?.name} · {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.orderStatus} />
                    <span className="tabular w-20 text-right text-sm font-semibold text-ink">
                      {formatPrice(order.total)}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No orders yet" description="Orders will appear here as they come in." />
          )}
        </Panel>

        <Panel
          title="Low stock"
          actions={
            <Link to="/inventory?status=low" className="group flex items-center gap-1 text-xs font-semibold text-primary">
              Inventory <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          }
        >
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : data?.lowStock.length ? (
            <ul className="divide-y divide-line">
              {data.lowStock.map((product) => (
                <li key={product._id} className="flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-canvas/70">
                  {product.thumbnail?.url ? (
                    <img src={product.thumbnail.url} alt="" loading="lazy" className="h-11 w-9 shrink-0 rounded-lg object-cover ring-1 ring-line" />
                  ) : (
                    <div className="h-11 w-9 shrink-0 rounded-lg bg-canvas ring-1 ring-line" />
                  )}
                  <p className="min-w-0 flex-1 truncate text-sm text-ink">{product.name}</p>
                  <Badge tone={product.stock <= 2 ? 'danger' : 'warning'}>{product.stock} left</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Stock levels are healthy" description="Nothing is running low right now." />
          )}
        </Panel>
      </div>
    </>
  );
}

export default DashboardPage;
