import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ExternalLink } from 'lucide-react';

import { productsApi, categoriesApi } from '@/api/endpoints';
import { styleOf, withStyle } from '@/lib/productStyle';
import { ImageGalleryInput } from '@/components/common/ImageInput';
import { ImageSizeGuide } from '@/components/common/ImageSizeGuide';
import { VariantsEditor, type VariantDraft } from '@/components/common/VariantsEditor';
import { colourProblems, colorsForApi } from '@/lib/productColours';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import { formatPrice } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { CloudinaryImage, ProductColor } from '@/types';
import {
  PageHeader, Panel, Button, Input, Select, Textarea, Checkbox, Badge, Skeleton, ErrorState,
} from '@/components/ui';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'http://localhost:5173';

const TABS = ['General', 'Pricing', 'Variants', 'Media', 'SEO', 'Visibility'] as const;
type Tab = (typeof TABS)[number];

/**
 * Product editor.
 *
 * Deliberately a partial-update form: only the fields actually edited are
 * sent, so two people working on different tabs cannot clobber each other's
 * changes by re-submitting stale values.
 */
export function ProductEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const readOnly = !can(P.PRODUCTS_UPDATE);

  const [tab, setTab] = useState<Tab>('General');
  const [form, setForm] = useState<Record<string, unknown>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => productsApi.get(id),
    enabled: Boolean(id),
  });

  const { data: categoryData } = useQuery({
    queryKey: queryKeys.categories.list({}),
    queryFn: () => categoriesApi.list({}),
  });

  const product = data?.product;

  // Reset the pending-change set whenever a different product loads.
  useEffect(() => {
    setForm({});
  }, [id]);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => productsApi.update(id, payload),
    onSuccess: () => {
      toast.success('Product saved');
      setForm({});
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not save this product')),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !product) {
    return <ErrorState title="Product not found" onRetry={() => refetch()} />;
  }

  /** Reads the pending edit if there is one, otherwise the saved value. */
  const value = <K extends keyof typeof product>(key: K) =>
    (form[key as string] !== undefined ? form[key as string] : product[key]) as (typeof product)[K];

  const set = (key: string, next: unknown) => setForm((current) => ({ ...current, [key]: next }));
  const isDirty = Object.keys(form).length > 0;

  // Colour mistakes are caught here, in words, rather than by the API.
  const blockers = form.colors ? colourProblems(form.colors as ProductColor[]) : [];
  const saveNow = () =>
    save.mutate(form.colors ? { ...form, colors: colorsForApi(form.colors as ProductColor[]) } : form);

  const allCategories = categoryData?.categories ?? [];
  const styles = allCategories.filter((item) => item.type === 'style');
  const currentCategoryId = String((value('category') as { _id?: string })?._id ?? value('category') ?? '');
  // Product types only — plus whatever the product already sits in, so an
  // older product filed elsewhere still shows its real category.
  const productTypes = allCategories.filter(
    (item) => item.type === 'product-type' || item._id === currentCategoryId,
  );
  const collections = value('collections') as (string | { _id: string })[] | undefined;
  const currentStyle = styleOf(collections, styles);

  return (
    <>
      <PageHeader
        title={product.name}
        description={`/product/${product.slug}`}
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Products', to: '/products' }, { label: 'Edit' }]}
        actions={
          <>
            <a
              href={`${SITE_URL}/product/${product.slug}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm text-ink hover:bg-canvas"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              View live
            </a>
            <Button onClick={saveNow} isLoading={save.isPending} disabled={!isDirty || readOnly || blockers.length > 0} title={blockers[0]}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {isDirty ? 'Save changes' : 'Saved'}
            </Button>
          </>
        }
      />

      {readOnly && (
        <p className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-4 py-2.5 text-sm text-warning">
          You have read-only access to products.
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={cn(
              '-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
              tab === item ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'General' && (
        <Panel title="General" className="max-w-3xl">
          <div className="space-y-4 p-5">
            <Input label="Name" value={String(value('name') ?? '')} onChange={(e) => set('name', e.target.value)} disabled={readOnly} required />
            <Input label="Slug" value={String(value('slug') ?? '')} onChange={(e) => set('slug', e.target.value)} disabled={readOnly} hint="Changing this changes the public URL." />
            <Textarea label="Short description" rows={2} value={String(value('shortDescription') ?? '')} onChange={(e) => set('shortDescription', e.target.value)} disabled={readOnly} />
            <Textarea label="Description" rows={8} value={String(value('description') ?? '')} onChange={(e) => set('description', e.target.value)} disabled={readOnly} required />

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Category"
                value={currentCategoryId}
                onChange={(e) => set('category', e.target.value)}
                disabled={readOnly}
              >
                {productTypes.map((category) => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
              </Select>

              <Select
                label="Style"
                value={currentStyle}
                onChange={(e) => set('collections', withStyle(collections, styles, e.target.value))}
                disabled={readOnly}
                hint="Optional — lists it on that style's page."
              >
                <option value="">No style</option>
                {styles.map((style) => (
                  <option key={style._id} value={style._id}>
                    {style.name}
                  </option>
                ))}
              </Select>

              <Select label="Fit" value={String(value('fit') ?? 'regular')} onChange={(e) => set('fit', e.target.value)} disabled={readOnly}>
                {['oversized', 'regular', 'relaxed', 'slim', 'boxy'].map((fit) => (
                  <option key={fit} value={fit}>{fit}</option>
                ))}
              </Select>

              <Input label="Brand" value={String(value('brand') ?? '')} onChange={(e) => set('brand', e.target.value)} disabled={readOnly} />
            </div>
          </div>
        </Panel>
      )}

      {tab === 'Pricing' && (
        <Panel title="Pricing" description="Discount percentage is derived from price and MRP." className="max-w-3xl">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Input
              label="Selling price (₹)"
              type="number"
              min={0}
              value={String(value('price') ?? 0)}
              onChange={(e) => set('price', Number(e.target.value))}
              disabled={readOnly}
            />
            <Input
              label="MRP (₹)"
              type="number"
              min={0}
              value={String(value('mrp') ?? 0)}
              onChange={(e) => set('mrp', Number(e.target.value))}
              disabled={readOnly}
              hint="Must be at or above the selling price."
            />

            <div className="sm:col-span-2">
              <p className="text-xs text-ink-muted">Customers currently see</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {formatPrice(Number(value('price') ?? 0))}
                {Number(value('mrp')) > Number(value('price')) && (
                  <>
                    <span className="ml-2 text-sm font-normal text-ink-subtle line-through">
                      {formatPrice(Number(value('mrp')))}
                    </span>
                    <Badge tone="primary" className="ml-2">
                      {Math.round(((Number(value('mrp')) - Number(value('price'))) / Number(value('mrp'))) * 100)}% off
                    </Badge>
                  </>
                )}
              </p>
            </div>
          </div>
        </Panel>
      )}

      {tab === 'Variants' && (
        <Panel
          title="Colours, sizes & stock"
          description="A variant is one colour in one size. Edit the grid and save — the SKUs are regenerated for you."
          className="max-w-4xl"
        >
          <div className="p-5">
            <VariantsEditor
              colors={(value('colors') ?? []) as ProductColor[]}
              variants={(value('variants') ?? []) as VariantDraft[]}
              onColorsChange={(next) => set('colors', next)}
              onVariantsChange={(next) => set('variants', next)}
              disabled={readOnly}
            />

            <p className="mt-5 border-t border-line pt-4 text-xs text-ink-subtle">
              Day-to-day stock counts are quicker from{' '}
              <Link to="/inventory" className="underline underline-offset-2 hover:text-ink">
                Inventory
              </Link>
              , which writes each change to the stock ledger. Use this grid when the
              range itself changes — a new colourway, a size you no longer make.
            </p>
          </div>
        </Panel>
      )}

      {tab === 'Media' && (
        <Panel
          title="Images"
          description="Drop files straight in. The first image is the thumbnail used across the storefront."
          className="max-w-4xl"
        >
          <div className="p-5">
            <ImageSizeGuide folder="products" defaultOpen={false} className="mb-4" />

            <ImageGalleryInput
              images={(value('images') ?? []) as CloudinaryImage[]}
              onChange={(next) => {
                set('images', next);
                // The model only falls back to images[0] when no thumbnail is
                // stored, so reordering has to move it explicitly.
                set('thumbnail', next[0] ?? null);
              }}
              folder="products"
              disabled={readOnly}
            />
          </div>
        </Panel>
      )}

      {tab === 'SEO' && (
        <Panel title="Search engine listing" className="max-w-3xl">
          <div className="space-y-4 p-5">
            <Input
              label="SEO title"
              value={String((value('seo') as { title?: string })?.title ?? '')}
              onChange={(e) => set('seo', { ...(value('seo') ?? {}), title: e.target.value })}
              disabled={readOnly}
              maxLength={70}
              hint="Around 60 characters reads best in results."
            />
            <Textarea
              label="Meta description"
              rows={3}
              value={String((value('seo') as { description?: string })?.description ?? '')}
              onChange={(e) => set('seo', { ...(value('seo') ?? {}), description: e.target.value })}
              disabled={readOnly}
              maxLength={180}
            />

            <div className="rounded-md border border-line bg-canvas p-4">
              <p className="text-xs text-ink-subtle">Preview</p>
              <p className="mt-1.5 truncate text-sm text-info">
                {String((value('seo') as { title?: string })?.title || product.name)}
              </p>
              <p className="text-xs text-success">{SITE_URL}/product/{product.slug}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
                {String((value('seo') as { description?: string })?.description || product.shortDescription)}
              </p>
            </div>
          </div>
        </Panel>
      )}

      {tab === 'Visibility' && (
        <Panel title="Visibility & merchandising" className="max-w-3xl">
          <div className="space-y-3 p-5">
            <Checkbox
              label="Active"
              description="Inactive products disappear from the storefront but keep their order history."
              checked={Boolean(value('isActive'))}
              onChange={(e) => set('isActive', e.target.checked)}
              disabled={readOnly}
            />
            <Checkbox
              label="Featured"
              description="Eligible for the featured rail on the home page."
              checked={Boolean(value('isFeatured'))}
              onChange={(e) => set('isFeatured', e.target.checked)}
              disabled={readOnly}
            />
            <Checkbox
              label="New drop"
              description="Appears in the New Drops rail and at /new-drops."
              checked={Boolean(value('isNewDrop'))}
              onChange={(e) => set('isNewDrop', e.target.checked)}
              disabled={readOnly}
            />
            <Checkbox
              label="Designer Wear - Exclusive"
              description="Appears in the Designer Wear - Exclusive rail and at /designer-wear-exclusive."
              checked={Boolean(value('isDesignerExclusive'))}
              onChange={(e) => set('isDesignerExclusive', e.target.checked)}
              disabled={readOnly}
            />
            <Checkbox
              label="Bestseller"
              description="Appears in the Bestsellers rail and at /bestsellers."
              checked={Boolean(value('isBestSeller'))}
              onChange={(e) => set('isBestSeller', e.target.checked)}
              disabled={readOnly}
            />
          </div>
        </Panel>
      )}

      {isDirty && (
        <div className="sticky bottom-4 mt-4 flex items-center justify-between gap-3 rounded-panel border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm text-ink">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setForm({})}>Discard</Button>
            <Button size="sm" onClick={saveNow} isLoading={save.isPending} disabled={blockers.length > 0} title={blockers[0]}>Save</Button>
          </div>
        </div>
      )}

      <div className="mt-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/products')}>
          ← Back to products
        </Button>
      </div>
    </>
  );
}

export default ProductEditorPage;
