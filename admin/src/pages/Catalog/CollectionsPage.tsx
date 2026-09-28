import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Pencil, Trash2, ImageIcon } from 'lucide-react';

import { collectionsApi, productsApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { formatDate } from '@/utils/format';
import { ImageInput } from '@/components/common/ImageInput';
import { CollectionProductPicker } from '@/components/collections/CollectionProductPicker';
import { thumbUrl } from '@/utils/image';
import type { AdminProductRow, Collection, ContentStatus } from '@/types';
import {
  PageHeader, Panel, Button, Input, Textarea, Select, Badge, Modal,
  TableSkeleton, EmptyState, ErrorState, ConfirmDialog, Pagination,
} from '@/components/ui';
import { PAGE_SIZE } from '@/lib/pagination';
import { useTableQuery } from '@/hooks/useTableQuery';

const EMPTY = {
  name: '',
  description: '',
  image: '',
  // New collections go live straight away; Draft is an explicit choice.
  status: 'published' as ContentStatus,
  products: [] as string[],
};

const STATUS_TONES: Record<ContentStatus, 'success' | 'neutral' | 'info' | 'warning'> = {
  published: 'success',
  draft: 'neutral',
  scheduled: 'info',
  archived: 'warning',
};

/**
 * Curated product groupings.
 *
 * Distinct from categories: the ordering is the point, so products are picked
 * and arranged by hand rather than derived from a query.
 */
export function CollectionsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const canManage = can(P.COLLECTIONS_MANAGE);

  const [editing, setEditing] = useState<Collection | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [deleting, setDeleting] = useState<Collection | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { page, setPage } = useTableQuery();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.collections.list({ page }),
    queryFn: () => collectionsApi.list({ page, limit: PAGE_SIZE }),
  });

  // Loaded only while the editor is open. The picker needs the whole
  // catalogue, so every page is fetched (the API caps a page at 60).
  const { data: catalogue = [], isLoading: isCatalogueLoading } = useQuery({
    queryKey: queryKeys.products.list({ scope: 'collection-picker' }),
    queryFn: async () => {
      const first = await productsApi.list({ limit: 60, page: 1 });
      const pages = first.pagination?.totalPages ?? 1;
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, i) => productsApi.list({ limit: 60, page: i + 2 })),
      );
      return [first, ...rest].flatMap((result) => result.products) as AdminProductRow[];
    },
    enabled: isOpen,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? collectionsApi.update(editing._id, payload) : collectionsApi.create(payload),
    onSuccess: () => {
      toast.success(editing ? 'Collection updated' : 'Collection created');
      close();
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not save this collection')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => collectionsApi.remove(id),
    onSuccess: () => {
      toast.success('Collection deleted');
      setDeleting(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not delete this collection')),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setIsOpen(true);
  };

  const openEdit = async (collection: Collection) => {
    const full = await collectionsApi.get(collection._id);
    setEditing(collection);
    setForm({
      name: full.collection.name,
      description: full.collection.description ?? '',
      image: full.collection.image?.url ?? '',
      status: full.collection.status,
      products: (full.collection.products ?? []).map((entry) =>
        typeof entry.product === 'string' ? entry.product : entry.product._id,
      ),
    });
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setEditing(null);
  };

  const submit = () =>
    save.mutate({
      name: form.name,
      description: form.description,
      image: form.image ? { url: form.image } : null,
      status: form.status,
      products: form.products,
    });

  const collections = data?.collections ?? [];

  if (isError) return <ErrorState title="Could not load collections" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Collections"
        description="Hand-picked product groupings, published to the storefront at /collections."
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Collections' }]}
        actions={
          canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New collection
            </Button>
          )
        }
      />

      <Panel>
        {isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : collections.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No collections yet"
            description="Group products into a drop, a price band, or an editorial edit."
            action={canManage && <Button onClick={openCreate}>Create the first one</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50 text-left text-xs text-ink-muted">
                  <th scope="col" className="px-5 py-2.5 font-medium">Collection</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Products</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Updated</th>
                  <th scope="col" className="py-2.5 pr-5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {collections.map((collection) => (
                  <tr key={collection._id} className="hover:bg-canvas/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {collection.image?.url ? (
                          <img src={thumbUrl(collection.image.url)} alt="" loading="lazy" className="h-12 w-[4.5rem] shrink-0 rounded-lg object-cover ring-1 ring-line" />
                        ) : (
                          <div className="grid h-12 w-[4.5rem] shrink-0 place-items-center rounded-lg bg-canvas ring-1 ring-line" title="No image yet">
                            <ImageIcon className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{collection.name}</p>
                          <p className="truncate text-xs text-ink-subtle">/collections/{collection.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="tabular py-3 pr-4 text-ink-muted">{collection.productCount ?? 0}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={STATUS_TONES[collection.status]}>{collection.status}</Badge>
                      {collection.status !== 'published' && (
                        <p className="mt-1 text-[0.6875rem] text-ink-subtle">Not on the storefront</p>
                      )}
                      {collection.status === 'published' && (collection.productCount ?? 0) === 0 && (
                        <p className="mt-1 text-[0.6875rem] text-warning">Add products to show it</p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-ink-subtle">{formatDate(collection.updatedAt)}</td>
                    <td className="py-3 pr-5">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && (
                          <>
                            <button type="button" onClick={() => openEdit(collection)} aria-label={`Edit ${collection.name}`} className="rounded p-1.5 text-ink-muted hover:bg-canvas hover:text-ink">
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => setDeleting(collection)} aria-label={`Delete ${collection.name}`} className="rounded p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.pagination && (
          <Pagination
            pageSize={PAGE_SIZE}
            page={data.pagination.currentPage}
            totalPages={data.pagination.totalPages}
            total={data.pagination.totalItems}
            onChange={setPage}
          />
        )}
      </Panel>

      <Modal
        isOpen={isOpen}
        onClose={close}
        title={editing ? `Edit — ${editing.name}` : 'New collection'}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={submit} isLoading={save.isPending} disabled={!form.name.trim()}>
              {editing ? 'Save changes' : 'Create collection'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid gap-4 md:grid-cols-2">
            <ImageInput
              label="Image"
              value={form.image}
              onChange={(url) => setForm({ ...form, image: url })}
              folder="collections"
              aspect="aspect-[3/2]"
              size="large"
              showUrlField={false}
              hint="Image size: 3:2 ratio (1800 × 1200 px)"
            />
            <div className="space-y-4">
              <Select
                label="Status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ContentStatus })}
                hint="Only published collections are visible to customers."
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </div>
          </div>

          <div>
            <p className="field-label">Products</p>
            <CollectionProductPicker
              products={catalogue}
              selected={form.products}
              onChange={(products) => setForm((current) => ({ ...current, products }))}
              isLoading={isCatalogueLoading}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting._id)}
        title="Delete this collection?"
        message={`"${deleting?.name}" will be removed. The products in it are not affected.`}
        confirmLabel="Delete"
        isLoading={remove.isPending}
      />
    </>
  );
}

export default CollectionsPage;
