import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, Home, Pencil, ExternalLink } from 'lucide-react';

import { homepageApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { formatDateTime } from '@/utils/format';
import type { ContentStatus, HomepageSection } from '@/types';
import {
  PageHeader, Panel, Button, Badge, Skeleton, ErrorState, EmptyState, Select, Pagination,
} from '@/components/ui';
import { SectionEditor } from './SectionEditor';
import { PAGE_SIZE, usePagedList } from '@/lib/pagination';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'http://localhost:5173';

const STATUS_TONES: Record<ContentStatus, 'success' | 'neutral' | 'info' | 'warning'> = {
  published: 'success',
  draft: 'neutral',
  scheduled: 'info',
  archived: 'warning',
};

/** Short, human description of what each section type renders. */
const TYPE_HINTS: Record<string, string> = {
  hero: 'Full-bleed banner at the top of the page',
  collections: 'Grid of your published collections',
  categories: 'Grid of category tiles',
  productRail: 'Horizontal row of products',
  brandStory: 'Image + long-form copy split',
  styleRail: 'Editorial style tiles',
  quality: 'Inverted block with quality pillars',
  community: 'Instagram-style image wall',
  trust: 'Service and assurance strip',
};

export function HomepagePage() {
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const canManage = can(P.HOMEPAGE_MANAGE);

  const [editing, setEditing] = useState<HomepageSection | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.homepage,
    queryFn: homepageApi.list,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.homepage });

  const reorder = useMutation({
    mutationFn: (order: string[]) => homepageApi.reorder(order),
    onSuccess: () => {
      toast.success('Order saved');
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not reorder sections')),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      homepageApi.update(id, { status }),
    onSuccess: () => {
      toast.success('Section updated');
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update that section')),
  });

  const sections = data?.sections ?? [];
  const sectionPage = usePagedList(sections);

  /** Swaps a section with its neighbour and persists the whole order. */
  const move = (index: number, direction: -1 | 1) => {
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;

    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((section) => section._id));
  };

  if (isError) return <ErrorState title="Could not load the home page" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Home page"
        description="Sections render top to bottom in this order. Only published sections reach customers."
        breadcrumbs={[{ label: 'Storefront' }, { label: 'Home page' }]}
        actions={
          <a
            href={SITE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm text-ink hover:bg-canvas"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            View live page
          </a>
        }
      />

      {!canManage && (
        <p className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-4 py-2.5 text-sm text-warning">
          You have read-only access to storefront content.
        </p>
      )}

      <Panel>
        {isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : sections.length === 0 ? (
          <EmptyState icon={Home} title="No sections yet" description="Run the seeder to load the current home page." />
        ) : (
          <ul className="divide-y divide-line">
            {sectionPage.entries.map(({ item: section, index }) => (
              <li key={section._id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-canvas/50">
                {/* Reorder controls sit first — position is the main thing
                    being managed on this screen. */}
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || !canManage || reorder.isPending}
                    aria-label={`Move ${section.name} up`}
                    className="rounded p-0.5 text-ink-subtle hover:bg-canvas hover:text-ink disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === sections.length - 1 || !canManage || reorder.isPending}
                    aria-label={`Move ${section.name} down`}
                    className="rounded p-0.5 text-ink-subtle hover:bg-canvas hover:text-ink disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <span className="tabular w-6 shrink-0 text-xs text-ink-subtle">{index + 1}</span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{section.name}</p>
                  <p className="truncate text-xs text-ink-subtle">
                    {TYPE_HINTS[section.type] ?? section.type}
                    {section.title && ` · “${section.title}”`}
                  </p>
                </div>

                <span className="hidden text-xs text-ink-subtle lg:block">
                  {formatDateTime(section.updatedAt)}
                </span>

                <Badge tone={STATUS_TONES[section.status]}>{section.status}</Badge>

                {canManage && (
                  <Select
                    value={section.status}
                    onChange={(event) =>
                      updateStatus.mutate({ id: section._id, status: event.target.value as ContentStatus })
                    }
                    aria-label={`Status for ${section.name}`}
                    className="h-8 w-32 text-xs"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="archived">Archived</option>
                  </Select>
                )}

                <Button size="sm" variant="outline" onClick={() => setEditing(section)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
        {sections.length > 0 && (
          <Pagination
            pageSize={PAGE_SIZE}
            page={sectionPage.page}
            totalPages={sectionPage.totalPages}
            total={sectionPage.total}
            onChange={sectionPage.setPage}
          />
        )}
      </Panel>

      <p className="mt-4 flex items-start gap-2 text-xs text-ink-subtle">
        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Draft and archived sections are hidden from customers immediately. Scheduled sections appear
        only inside their date window. No redeploy is needed for any of this.
      </p>

      {editing && (
        <SectionEditor
          section={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
          readOnly={!canManage}
        />
      )}
    </>
  );
}

export default HomepagePage;
