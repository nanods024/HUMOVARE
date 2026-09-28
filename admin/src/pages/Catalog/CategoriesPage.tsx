import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tags, Pencil, Trash2, Plus, ImageIcon, Palette, Check, Menu } from 'lucide-react';

import { categoriesApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { ImageInput } from '@/components/common/ImageInput';
import type { Category } from '@/types';
import {
  PageHeader, Panel, Button, Input, Textarea, Checkbox, Badge, Modal,
  TableSkeleton, Skeleton, EmptyState, ErrorState, ConfirmDialog, Pagination,
} from '@/components/ui';
import { PAGE_SIZE, usePagedList } from '@/lib/pagination';
import { cn } from '@/utils/cn';

/**
 * Two kinds of category are managed here:
 *  - product types (T-Shirts, Hoodies…) — created, renamed, hidden, deleted;
 *  - styles (Oversized, Minimal…) — a fixed set where only the photo changes.
 * Collections such as New Drops or Sale follow product flags and are not
 * edited here. The server enforces the same rules.
 */
const EMPTY = {
  name: '',
  description: '',
  displayOrder: 0,
  showInNav: true,
  isActive: true,
  image: '',
};

const LIST_PARAMS = { manage: 'true' };

/** How many product types the storefront Shop menu shows. Mirrors the server. */
const SHOP_MENU_LIMIT = 4;

const inMenu = (category: Category) => category.showInNav && category.isActive;

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const { can } = usePermission();

  const [editing, setEditing] = useState<Category | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [styleEditing, setStyleEditing] = useState<Category | null>(null);
  const [styleImage, setStyleImage] = useState('');
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.categories.list(LIST_PARAMS),
    queryFn: () => categoriesApi.list(LIST_PARAMS),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? categoriesApi.update(editing._id, payload) : categoriesApi.create(payload),
    onSuccess: () => {
      toast.success(editing ? 'Product type updated' : 'Product type created');
      closeForm();
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not save this product type')),
  });

  const saveStyle = useMutation({
    mutationFn: ({ id, image }: { id: string; image: string }) =>
      categoriesApi.update(id, { image: image ? { url: image } : null }),
    onSuccess: () => {
      toast.success('Style image updated');
      setStyleEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update this image')),
  });

  const toggleMenu = useMutation({
    mutationFn: (category: Category) =>
      categoriesApi.update(category._id, { showInNav: !category.showInNav }),
    onSuccess: (_data, category) => {
      toast.success(category.showInNav ? `${category.name} removed from the Shop menu` : `${category.name} added to the Shop menu`);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update the Shop menu')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: () => {
      toast.success('Product type deleted');
      setDeleting(null);
      invalidate();
    },
    // The server refuses while products still reference it — surface that reason.
    onError: (error) => toast.error(getErrorMessage(error, 'Could not delete this product type')),
  });

  const openCreate = () => {
    setEditing(null);
    // Straight into the menu only while there is room for it.
    setForm({ ...EMPTY, displayOrder: productTypes.length + 1, showInNav: menuCount < SHOP_MENU_LIMIT });
    setIsFormOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setForm({
      name: category.name,
      description: category.description ?? '',
      displayOrder: category.displayOrder ?? 0,
      showInNav: category.showInNav,
      isActive: category.isActive,
      image: category.image?.url ?? '',
    });
    setIsFormOpen(true);
  };

  const openStyle = (category: Category) => {
    setStyleEditing(category);
    setStyleImage(category.image?.url ?? '');
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditing(null);
  };

  const submit = () => {
    save.mutate({
      name: form.name,
      description: form.description,
      displayOrder: Number(form.displayOrder),
      showInNav: form.showInNav,
      isActive: form.isActive,
      image: form.image ? { url: form.image } : null,
    });
  };

  const categories = data?.categories ?? [];
  const productTypes = categories.filter((category) => category.type === 'product-type');
  const styles = categories.filter((category) => category.type === 'style');
  const typePage = usePagedList(productTypes);

  const menuCount = productTypes.filter(inMenu).length;
  const menuFull = menuCount >= SHOP_MENU_LIMIT;
  // Room left for the one being edited: it does not compete with itself.
  const othersInMenu = menuCount - (editing && inMenu(editing) ? 1 : 0);
  const formMenuFull = othersInMenu >= SHOP_MENU_LIMIT;
  const formOverLimit = form.showInNav && form.isActive && formMenuFull;

  if (isError) return <ErrorState title="Could not load categories" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Categories"
        description="Product types drive the Shop menu and category pages. Styles power the “Shop by style” rail."
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Categories' }]}
        actions={
          can(P.CATEGORIES_CREATE) && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New product type
            </Button>
          )
        }
      />

      <div className="stagger space-y-6">
        <Panel
          title="Product types"
          description={`Create, rename, hide or delete. Choose up to ${SHOP_MENU_LIMIT} to show in the storefront Shop menu.`}
          actions={
            !isLoading && (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
                  menuFull ? 'bg-primary/5 text-primary ring-primary/20' : 'bg-canvas text-ink-muted ring-line',
                )}
              >
                <Menu className="h-3.5 w-3.5" aria-hidden="true" />
                In Shop menu: <span className="tabular">{menuCount} / {SHOP_MENU_LIMIT}</span>
              </div>
            )
          }
        >
          {isLoading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : productTypes.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="No product types yet"
              description="Add one to start organising the catalogue."
              action={can(P.CATEGORIES_CREATE) && <Button onClick={openCreate}>New product type</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left">
                    <th scope="col" className="px-5 py-2.5">Product type</th>
                    <th scope="col" className="py-2.5 pr-4">Order</th>
                    <th scope="col" className="py-2.5 pr-4">Shop menu</th>
                    <th scope="col" className="py-2.5 pr-4">Status</th>
                    <th scope="col" className="py-2.5 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {typePage.entries.map(({ item: category }) => (
                    <tr key={category._id} className={category.isActive ? '' : 'opacity-70'}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {category.image?.url ? (
                            <img src={category.image.url} alt="" loading="lazy" className="h-11 w-9 shrink-0 rounded-lg object-cover ring-1 ring-line" />
                          ) : (
                            <div className="grid h-11 w-9 shrink-0 place-items-center rounded-lg bg-canvas ring-1 ring-line">
                              <ImageIcon className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{category.name}</p>
                            <p className="truncate text-xs text-ink-subtle">/{category.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="tabular py-3 pr-4 text-ink-muted">{category.displayOrder}</td>
                      <td className="py-3 pr-4">
                        <MenuToggle
                          category={category}
                          disabled={!can(P.CATEGORIES_UPDATE) || toggleMenu.isPending || (!category.showInNav && category.isActive && menuFull)}
                          menuFull={menuFull}
                          onToggle={() => toggleMenu.mutate(category)}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={category.isActive ? 'success' : 'neutral'}>
                          {category.isActive ? 'Active' : 'Hidden'}
                        </Badge>
                      </td>
                      <td className="py-3 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          {can(P.CATEGORIES_UPDATE) && (
                            <button type="button" onClick={() => openEdit(category)} aria-label={`Edit ${category.name}`} className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink">
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {can(P.CATEGORIES_DELETE) && (
                            <button type="button" onClick={() => setDeleting(category)} aria-label={`Delete ${category.name}`} className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {productTypes.length > 0 && (
            <Pagination
              pageSize={PAGE_SIZE}
              page={typePage.page}
              totalPages={typePage.totalPages}
              total={typePage.total}
              onChange={typePage.setPage}
            />
          )}
        </Panel>

        <Panel
          title="Styles"
          description="These are fixed. Only the photo can be changed — it updates the “Shop by style” rail on the home page."
        >
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="aspect-[4/5] w-full rounded-xl" />
              ))}
            </div>
          ) : styles.length === 0 ? (
            <EmptyState icon={Palette} title="No styles" />
          ) : (
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
              {styles.map((style) => (
                <div key={style._id} className="group">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                    {style.image?.url ? (
                      <img
                        src={style.image.url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 ease-smooth group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <ImageIcon className="h-6 w-6 text-ink-subtle" aria-hidden="true" />
                      </div>
                    )}
                    {can(P.CATEGORIES_UPDATE) && (
                      <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-ink/60 to-transparent p-3 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <Button size="sm" variant="outline" onClick={() => openStyle(style)} className="bg-panel/95">
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          Change image
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-ink">{style.name}</p>
                  <p className="truncate text-xs text-ink-subtle">/{style.slug}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editing ? `Edit — ${editing.name}` : 'New product type'}
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={submit} isLoading={save.isPending} disabled={form.name.trim().length < 2 || formOverLimit}>
              {editing ? 'Save changes' : 'Create product type'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} hint="Shown on the category tile and the category page." />
          <Input label="Display order" type="number" value={String(form.displayOrder)} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} hint="Lower numbers come first in the menu." />

          <ImageInput
            label="Image"
            value={form.image}
            onChange={(url) => setForm({ ...form, image: url })}
            folder="categories"
            aspect="aspect-[4/5]"
            showUrlField={false}
          />

          <Checkbox
            label="Show in Shop menu"
            description={
              formMenuFull && !form.showInNav
                ? `The Shop menu is full (${SHOP_MENU_LIMIT} of ${SHOP_MENU_LIMIT}). Take another product type out of it first.`
                : `Appears in the storefront Shop menu — up to ${SHOP_MENU_LIMIT} product types.`
            }
            checked={form.showInNav}
            disabled={formMenuFull && !form.showInNav}
            onChange={(e) => setForm({ ...form, showInNav: e.target.checked })}
          />
          <Checkbox label="Active" description="Hidden product types stay here but disappear from the storefront." checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />

          {formOverLimit && (
            <p role="alert" className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              The Shop menu already has {SHOP_MENU_LIMIT} product types. Untick “Show in Shop menu”, or take another one out of the menu first.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(styleEditing)}
        onClose={() => setStyleEditing(null)}
        title={`Style image — ${styleEditing?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStyleEditing(null)}>Cancel</Button>
            <Button
              onClick={() => styleEditing && saveStyle.mutate({ id: styleEditing._id, image: styleImage })}
              isLoading={saveStyle.isPending}
              disabled={styleImage === (styleEditing?.image?.url ?? '')}
            >
              Save image
            </Button>
          </>
        }
      >
        <ImageInput
          label="Image"
          value={styleImage}
          onChange={setStyleImage}
          folder="categories"
          aspect="aspect-[4/5]"
          showUrlField={false}
        />
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting._id)}
        title="Delete this product type?"
        message={`"${deleting?.name}" will be removed permanently. This is refused while any product still belongs to it — to keep it but take it off the storefront, edit it and untick Active instead.`}
        confirmLabel="Delete"
        isLoading={remove.isPending}
      />
    </>
  );
}

/** One-click in/out of the Shop menu, straight from the table. */
function MenuToggle({ category, disabled, menuFull, onToggle }: {
  category: Category;
  disabled: boolean;
  menuFull: boolean;
  onToggle: () => void;
}) {
  const on = category.showInNav;
  const title = !category.isActive
    ? 'Hidden product types never appear in the menu'
    : !on && menuFull
      ? `The Shop menu is full (${SHOP_MENU_LIMIT} of ${SHOP_MENU_LIMIT})`
      : on ? 'Remove from the Shop menu' : 'Add to the Shop menu';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={title}
      aria-pressed={on}
      aria-label={`${category.name}: ${title}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ring-1 ring-inset transition-all duration-200 ease-smooth active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
        on
          ? 'bg-success/10 text-success ring-success/20 hover:bg-success/15'
          : 'bg-canvas text-ink-muted ring-line hover:text-ink',
      )}
    >
      {on ? <Check className="h-3 w-3" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}
      {on ? 'In menu' : 'Add'}
    </button>
  );
}

export default CategoriesPage;
