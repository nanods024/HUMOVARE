import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Save, ExternalLink } from 'lucide-react';

import { shopApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import type { ShopFilter, ShopSortOption } from '@/types';
import {
  PageHeader, Panel, Button, Input, Textarea, Select, Checkbox, Skeleton, ErrorState,
} from '@/components/ui';

const SITE_URL = import.meta.env.VITE_SITE_URL || (import.meta.env.PROD ? 'https://humovare.in' : 'http://localhost:5173');

/**
 * Shop page configuration.
 *
 * Note what this screen deliberately cannot do: add a filter. The list is
 * fixed to what `FilterSidebar` on the storefront implements, so the admin can
 * hide, rename and reorder — but never configure the page into a broken state.
 */
export function ShopConfigPage() {
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const readOnly = !can(P.SHOP_MANAGE);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.shop,
    // The page copies this into an editable draft; refetching on focus would
    // replace unsaved edits.
    refetchOnWindowFocus: false,
    queryFn: shopApi.get,
  });

  const [draft, setDraft] = useState<{
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
    pageSize: number;
    defaultSort: string;
    filters: ShopFilter[];
    sortOptions: ShopSortOption[];
  } | null>(null);

  // Seed the local draft once the saved config arrives.
  useEffect(() => {
    if (!data?.config) return;
    const config = data.config;
    setDraft({
      title: config.title,
      description: config.description,
      emptyTitle: config.emptyTitle,
      emptyDescription: config.emptyDescription,
      pageSize: config.pageSize,
      defaultSort: config.defaultSort,
      filters: [...config.filters].sort((a, b) => a.sortOrder - b.sortOrder),
      sortOptions: [...config.sortOptions].sort((a, b) => a.sortOrder - b.sortOrder),
    });
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: unknown) => shopApi.update(payload),
    onSuccess: () => {
      toast.success('Shop page saved');
      queryClient.invalidateQueries({ queryKey: queryKeys.shop });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not save the shop configuration')),
  });

  if (isError) return <ErrorState title="Could not load the shop configuration" onRetry={() => refetch()} />;
  if (isLoading || !draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  /** Reorders a list and renumbers `sortOrder` so the server stores intent. */
  function move<T extends { sortOrder: number }>(list: T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction;
    if (target < 0 || target >= list.length) return list;

    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next.map((item, i) => ({ ...item, sortOrder: i + 1 }));
  }

  const enabledSorts = draft.sortOptions.filter((option) => option.enabled);

  const handleSave = () => {
    save.mutate({
      title: draft.title,
      description: draft.description,
      emptyTitle: draft.emptyTitle,
      emptyDescription: draft.emptyDescription,
      pageSize: draft.pageSize,
      defaultSort: draft.defaultSort,
      filters: draft.filters,
      sortOptions: draft.sortOptions,
    });
  };

  return (
    <>
      <PageHeader
        title="Shop page"
        description="Controls the title, filters, sorting and page size on /shop and every collection page."
        breadcrumbs={[{ label: 'Storefront' }, { label: 'Shop page' }]}
        actions={
          <>
            <a
              href={`${SITE_URL}/shop`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm text-ink hover:bg-canvas"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              View live
            </a>
            <Button onClick={handleSave} isLoading={save.isPending} disabled={readOnly}>
              <Save className="h-4 w-4" aria-hidden="true" />
              Save changes
            </Button>
          </>
        }
      />

      {readOnly && (
        <p className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-4 py-2.5 text-sm text-warning">
          You have read-only access to storefront content.
        </p>
      )}

      <div className="stagger grid gap-4 xl:grid-cols-2">
        <Panel title="Page copy">
          <div className="space-y-4 p-5">
            <Input
              label="Page title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              disabled={readOnly}
            />
            <Textarea
              label="Introduction"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              disabled={readOnly}
            />
            <Input
              label="Empty state heading"
              value={draft.emptyTitle}
              onChange={(e) => setDraft({ ...draft, emptyTitle: e.target.value })}
              disabled={readOnly}
              hint="Shown when a filter combination returns nothing."
            />
            <Input
              label="Empty state message"
              value={draft.emptyDescription}
              onChange={(e) => setDraft({ ...draft, emptyDescription: e.target.value })}
              disabled={readOnly}
            />
          </div>
        </Panel>

        <Panel title="Results">
          <div className="space-y-4 p-5">
            <Input
              label="Products per page"
              type="number"
              min={8}
              max={60}
              value={String(draft.pageSize)}
              onChange={(e) => setDraft({ ...draft, pageSize: Number(e.target.value) })}
              disabled={readOnly}
              hint="Between 8 and 60. Filtering and paging happen on the server."
            />

            <Select
              label="Default sort"
              value={draft.defaultSort}
              onChange={(e) => setDraft({ ...draft, defaultSort: e.target.value })}
              disabled={readOnly}
              hint="Only enabled options can be the default."
            >
              {enabledSorts.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </Panel>

        <Panel title="Filters" description="Turn off or rename any filter. The order here is the order shoppers see.">
          <ul className="divide-y divide-line">
            {draft.filters.map((filter, index) => (
              <li key={filter.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, filters: move(draft.filters, index, -1) })}
                    disabled={index === 0 || readOnly}
                    aria-label={`Move ${filter.label} up`}
                    className="rounded p-0.5 text-ink-subtle hover:bg-canvas hover:text-ink disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, filters: move(draft.filters, index, 1) })}
                    disabled={index === draft.filters.length - 1 || readOnly}
                    aria-label={`Move ${filter.label} down`}
                    className="rounded p-0.5 text-ink-subtle hover:bg-canvas hover:text-ink disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <code className="w-24 shrink-0 text-xs text-ink-subtle">{filter.key}</code>

                <Input
                  aria-label={`Label for ${filter.key}`}
                  value={filter.label}
                  onChange={(e) => {
                    const next = [...draft.filters];
                    next[index] = { ...filter, label: e.target.value };
                    setDraft({ ...draft, filters: next });
                  }}
                  disabled={readOnly}
                  containerClassName="min-w-[8rem] flex-1"
                />

                <Checkbox
                  label="Open"
                  checked={Boolean(filter.defaultOpen)}
                  onChange={(e) => {
                    const next = [...draft.filters];
                    next[index] = { ...filter, defaultOpen: e.target.checked };
                    setDraft({ ...draft, filters: next });
                  }}
                  disabled={readOnly}
                />

                <Checkbox
                  label="Enabled"
                  checked={filter.enabled}
                  onChange={(e) => {
                    const next = [...draft.filters];
                    next[index] = { ...filter, enabled: e.target.checked };
                    setDraft({ ...draft, filters: next });
                  }}
                  disabled={readOnly}
                />
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-subtle">
            The available filters are fixed to what the storefront implements — you can hide or
            rename them, but not invent one the page cannot render.
          </p>
        </Panel>

        <Panel title="Sorting" description="Which sort options shoppers can choose, and in what order.">
          <ul className="divide-y divide-line">
            {draft.sortOptions.map((option, index) => (
              <li key={option.value} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, sortOptions: move(draft.sortOptions, index, -1) })}
                    disabled={index === 0 || readOnly}
                    aria-label={`Move ${option.label} up`}
                    className="rounded p-0.5 text-ink-subtle hover:bg-canvas hover:text-ink disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, sortOptions: move(draft.sortOptions, index, 1) })}
                    disabled={index === draft.sortOptions.length - 1 || readOnly}
                    aria-label={`Move ${option.label} down`}
                    className="rounded p-0.5 text-ink-subtle hover:bg-canvas hover:text-ink disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <code className="w-28 shrink-0 text-xs text-ink-subtle">{option.value}</code>

                <Input
                  aria-label={`Label for ${option.value}`}
                  value={option.label}
                  onChange={(e) => {
                    const next = [...draft.sortOptions];
                    next[index] = { ...option, label: e.target.value };
                    setDraft({ ...draft, sortOptions: next });
                  }}
                  disabled={readOnly}
                  containerClassName="min-w-[8rem] flex-1"
                />

                <Checkbox
                  label="Enabled"
                  checked={option.enabled}
                  onChange={(e) => {
                    const next = [...draft.sortOptions];
                    next[index] = { ...option, enabled: e.target.checked };
                    setDraft({ ...draft, sortOptions: next });
                  }}
                  disabled={readOnly}
                />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

export default ShopConfigPage;
