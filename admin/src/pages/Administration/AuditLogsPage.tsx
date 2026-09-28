import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ScrollText, Search, Lock } from 'lucide-react';

import { auditApi } from '@/api/endpoints';
import { queryKeys } from '@/lib/queryKeys';
import { useTableQuery, useDebouncedSearch } from '@/hooks/useTableQuery';
import { formatDateTime, timeAgo } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { AuditLogEntry } from '@/types';
import {
  PageHeader, Panel, Input, Select, Badge, Modal, TableSkeleton, EmptyState,
  ErrorState, Pagination,
} from '@/components/ui';
import { PAGE_SIZE } from '@/lib/pagination';

/** Grouped so the filter reads as categories rather than a wall of constants. */
const ACTION_GROUPS: { label: string; actions: string[] }[] = [
  { label: 'Authentication', actions: ['ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED', 'ADMIN_LOGOUT'] },
  { label: 'Catalogue', actions: ['PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'PRICE_CHANGED', 'STOCK_CHANGED', 'PRODUCT_BULK_UPDATED'] },
  { label: 'Storefront', actions: ['HOMEPAGE_SECTION_UPDATED', 'HOMEPAGE_SECTION_CREATED', 'HOMEPAGE_REORDERED', 'SHOP_CONFIG_UPDATED'] },
  { label: 'Orders', actions: ['ORDER_STATUS_CHANGED', 'ORDER_NOTE_ADDED'] },
  { label: 'Administration', actions: ['ADMIN_CREATED', 'ADMIN_UPDATED', 'ADMIN_DISABLED', 'ADMIN_ENABLED', 'ADMIN_PASSWORD_RESET', 'ROLE_UPDATED', 'SETTINGS_UPDATED'] },
];

/** Anything destructive or security-relevant is coloured, not just listed. */
const TONE_FOR_ACTION = (action: string) => {
  if (action.includes('FAILED') || action.includes('DELETED') || action.includes('DISABLED')) return 'danger';
  if (action.includes('CREATED')) return 'success';
  if (action.includes('LOGIN') || action.includes('LOGOUT')) return 'info';
  return 'neutral';
};

export function AuditLogsPage() {
  const { params, page, setParam, setPage } = useTableQuery();
  const [searchInput, setSearchInput] = useDebouncedSearch(params.search, setParam);
  const [inspecting, setInspecting] = useState<AuditLogEntry | null>(null);


  const query = { page, limit: PAGE_SIZE, search: params.search, action: params.action, resource: params.resource };

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: queryKeys.auditLogs(query),
    queryFn: () => auditApi.list(query),
    placeholderData: keepPreviousData,
  });

  const logs = data?.logs ?? [];
  const pagination = data?.pagination;
  const retentionDays = data?.retentionDays ?? 3;
  const retentionLabel = retentionDays === 1 ? '1 day' : `${retentionDays} days`;

  if (isError) return <ErrorState title="Could not load the audit trail" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Audit logs"
        description={`Every administrative action from the last ${retentionLabel}. No route can edit or delete an entry early — older entries are removed automatically to keep this trail from growing without bound.`}
        breadcrumbs={[{ label: 'Administration' }, { label: 'Audit logs' }]}
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by admin, description or record id…"
              aria-label="Search audit logs"
              className="pl-9"
            />
          </div>

          <Select
            value={params.action ?? ''}
            onChange={(event) => setParam('action', event.target.value || undefined)}
            aria-label="Filter by action"
            className="w-56"
          >
            <option value="">All actions</option>
            {ACTION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.actions.map((action) => (
                  <option key={action} value={action}>{action.replace(/_/g, ' ').toLowerCase()}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={12} cols={4} />
        ) : logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="No matching activity" description="Try a wider filter." />
        ) : (
          <div className={cn('overflow-x-auto', isPlaceholderData && 'opacity-60 transition-opacity')}>
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50 text-left text-xs text-ink-muted">
                  <th scope="col" className="px-5 py-2.5 font-medium">When</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Admin</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Action</th>
                  <th scope="col" className="py-2.5 pr-5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.map((log) => (
                  <tr
                    key={log._id}
                    onClick={() => setInspecting(log)}
                    className="cursor-pointer hover:bg-canvas/60"
                  >
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <p className="text-ink">{timeAgo(log.createdAt)}</p>
                      <p className="text-xs text-ink-subtle">{formatDateTime(log.createdAt)}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <p className="text-ink">{log.adminUser?.name ?? '—'}</p>
                      <p className="text-xs text-ink-subtle">{log.adminEmail || 'unknown'}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={TONE_FOR_ACTION(log.action)}>
                        {log.action.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-5">
                      <p className="text-ink">{log.description || '—'}</p>
                      {log.ip && <p className="text-xs text-ink-subtle">{log.ip}</p>}
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

      <p className="mt-4 flex items-start gap-2 text-xs text-ink-subtle">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Only super admins can read this trail, and passwords and tokens are redacted before an entry
        is written. Entries older than {retentionLabel} are permanently deleted to save space —
        nobody, including a super admin, can remove one before then.
      </p>

      <Modal
        isOpen={Boolean(inspecting)}
        onClose={() => setInspecting(null)}
        title={inspecting?.action.replace(/_/g, ' ') ?? ''}
        size="lg"
      >
        {inspecting && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-xs text-ink-subtle">Admin</dt><dd>{inspecting.adminEmail || '—'}</dd></div>
              <div><dt className="text-xs text-ink-subtle">When</dt><dd>{formatDateTime(inspecting.createdAt)}</dd></div>
              <div><dt className="text-xs text-ink-subtle">Resource</dt><dd>{inspecting.resource || '—'}</dd></div>
              <div><dt className="text-xs text-ink-subtle">Record id</dt><dd className="font-mono text-xs">{inspecting.resourceId || '—'}</dd></div>
              <div><dt className="text-xs text-ink-subtle">IP address</dt><dd>{inspecting.ip || '—'}</dd></div>
              <div><dt className="text-xs text-ink-subtle">Outcome</dt><dd><Badge tone={inspecting.status === 'success' ? 'success' : 'danger'}>{inspecting.status}</Badge></dd></div>
            </dl>

            {inspecting.description && (
              <p className="rounded-md bg-canvas px-3 py-2.5 text-ink">{inspecting.description}</p>
            )}

            {/* Before/after make a change reconstructable months later. */}
            {Boolean(inspecting.before || inspecting.after) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-ink-muted">Before</p>
                  <pre className="overflow-x-auto rounded-md bg-canvas p-3 text-xs text-ink-muted">
                    {String(JSON.stringify(inspecting.before, null, 2) ?? '—')}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-ink-muted">After</p>
                  <pre className="overflow-x-auto rounded-md bg-canvas p-3 text-xs text-ink-muted">
                    {String(JSON.stringify(inspecting.after, null, 2) ?? '—')}
                  </pre>
                </div>
              </div>
            )}

            {inspecting.metadata ? (
              <div>
                <p className="mb-1 text-xs font-medium text-ink-muted">Metadata</p>
                <pre className="overflow-x-auto rounded-md bg-canvas p-3 text-xs text-ink-muted">
                  {String(JSON.stringify(inspecting.metadata, null, 2) ?? '')}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
}

export default AuditLogsPage;
