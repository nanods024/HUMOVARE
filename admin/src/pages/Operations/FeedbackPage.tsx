import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Inbox, Search, Mail, Archive, Trash2, CheckCheck } from 'lucide-react';

import { feedbackApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { useTableQuery, useDebouncedSearch } from '@/hooks/useTableQuery';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { formatDateTime, timeAgo } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { FeedbackMessage, FeedbackStatus } from '@/types';
import {
  PageHeader, Panel, Button, Input, Select, Textarea, Badge, Modal, TableSkeleton,
  EmptyState, ErrorState, Pagination, ConfirmDialog,
} from '@/components/ui';
import { PAGE_SIZE } from '@/lib/pagination';

const STATUS_TONES: Record<FeedbackStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  new: 'warning',
  read: 'info',
  replied: 'success',
  archived: 'neutral',
};

/**
 * The contact-form inbox.
 *
 * Replies go out from a real mail client, not from here — a message the shop
 * sends should come from the address customers already write to, and building
 * a second outbox would only split the thread. This screen is therefore about
 * triage: what has arrived, what has been dealt with, and a private note about
 * why.
 */
export function FeedbackPage() {
  const { params, page, setParam, setPage } = useTableQuery();
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const canManage = can(P.FEEDBACK_MANAGE);

  const [searchInput, setSearchInput] = useDebouncedSearch(params.search, setParam);
  const [reading, setReading] = useState<FeedbackMessage | null>(null);
  const [note, setNote] = useState('');
  const [deleting, setDeleting] = useState<FeedbackMessage | null>(null);


  const query = { page, limit: PAGE_SIZE, status: params.status, topic: params.topic, search: params.search };

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: queryKeys.feedback.list(query),
    queryFn: () => feedbackApi.list(query),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status?: FeedbackStatus; note?: string } }) =>
      feedbackApi.update(id, payload),
    onSuccess: () => {
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update this message')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => feedbackApi.remove(id),
    onSuccess: () => {
      toast.success('Message deleted');
      setDeleting(null);
      setReading(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not delete this message')),
  });

  /** Opening a new message marks it read — the same as any other inbox. */
  const open = (message: FeedbackMessage) => {
    setReading(message);
    setNote(message.note ?? '');
    if (message.status === 'new' && canManage) {
      update.mutate({ id: message._id, payload: { status: 'read' } });
    }
  };

  const messages = data?.messages ?? [];
  const pagination = data?.pagination;

  if (isError) return <ErrorState title="Could not load the inbox" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Everything sent through the contact form on the storefront."
        breadcrumbs={[{ label: 'Operations' }, { label: 'Feedback' }]}
        actions={data && data.unread > 0 ? <Badge tone="warning">{data.unread} new</Badge> : undefined}
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name, email or wording…"
              aria-label="Search messages"
              className="pl-9"
            />
          </div>

          <Select
            value={params.status ?? ''}
            onChange={(event) => setParam('status', event.target.value || undefined)}
            aria-label="Filter by status"
            className="w-40"
          >
            <option value="">All messages</option>
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="replied">Replied</option>
            <option value="archived">Archived</option>
          </Select>

          <Select
            value={params.topic ?? ''}
            onChange={(event) => setParam('topic', event.target.value || undefined)}
            aria-label="Filter by topic"
            className="w-40"
          >
            <option value="">Any topic</option>
            <option value="general">General</option>
            <option value="order">Order</option>
            <option value="product">Product</option>
            <option value="returns">Returns</option>
            <option value="wholesale">Wholesale</option>
          </Select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={4} />
        ) : messages.length === 0 ? (
          <EmptyState icon={Inbox} title="Nothing here" description="Messages from the contact form land in this inbox." />
        ) : (
          <ul className={cn('divide-y divide-line', isPlaceholderData && 'opacity-60 transition-opacity')}>
            {messages.map((message) => (
              <li key={message._id}>
                <button
                  type="button"
                  onClick={() => open(message)}
                  className="flex w-full items-start gap-4 px-5 py-3.5 text-left hover:bg-canvas/60"
                >
                  <Mail
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      message.status === 'new' ? 'text-primary' : 'text-ink-subtle',
                    )}
                    aria-hidden="true"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-sm', message.status === 'new' ? 'font-semibold text-ink' : 'text-ink')}>
                        {message.name}
                      </span>
                      <span className="text-xs text-ink-subtle">{message.email}</span>
                      <Badge tone={STATUS_TONES[message.status as FeedbackStatus]}>{message.status}</Badge>
                      <Badge tone="neutral">{message.topic}</Badge>
                    </div>

                    <p className="mt-0.5 truncate text-sm text-ink-muted">
                      {message.subject ? `${message.subject} — ` : ''}
                      {message.message}
                    </p>
                  </div>

                  <span className="shrink-0 text-xs text-ink-subtle">{timeAgo(message.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
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

      <Modal
        isOpen={Boolean(reading)}
        onClose={() => setReading(null)}
        title={reading ? `${reading.name} · ${reading.topic}` : ''}
        size="lg"
        footer={
          canManage && reading ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setDeleting(reading)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
              <Button
                variant="outline"
                onClick={() => update.mutate({ id: reading._id, payload: { status: 'archived', note } })}
                isLoading={update.isPending}
              >
                <Archive className="h-4 w-4" aria-hidden="true" />
                Archive
              </Button>
              <Button
                onClick={() => update.mutate({ id: reading._id, payload: { status: 'replied', note } })}
                isLoading={update.isPending}
              >
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                Mark replied
              </Button>
            </>
          ) : undefined
        }
      >
        {reading && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-subtle">Reply to</dt>
                <dd>
                  <a href={`mailto:${reading.email}`} className="text-info underline underline-offset-2">
                    {reading.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-subtle">Received</dt>
                <dd>{formatDateTime(reading.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-subtle">Account</dt>
                <dd>{reading.user ? `${reading.user.name} (signed in)` : 'Not signed in'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-subtle">Last handled by</dt>
                <dd>{reading.handledBy?.name ?? '—'}</dd>
              </div>
            </dl>

            {reading.subject && <p className="font-medium text-ink">{reading.subject}</p>}

            <p className="whitespace-pre-line rounded-md bg-canvas px-3 py-2.5 leading-relaxed text-ink">
              {reading.message}
            </p>

            <Textarea
              label="Internal note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={!canManage}
              hint="Saved when you archive or mark this replied. The customer never sees it."
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting._id)}
        title="Delete this message?"
        message="It is removed permanently. Archive it instead if you only want it out of the way."
        confirmLabel="Delete"
        isLoading={remove.isPending}
      />
    </>
  );
}

export default FeedbackPage;
