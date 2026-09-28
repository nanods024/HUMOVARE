import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, AlertTriangle } from 'lucide-react';

import { productsApi, categoriesApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from '@/store/toastStore';
import { ImageGalleryInput } from '@/components/common/ImageInput';
import { ImageSizeGuide } from '@/components/common/ImageSizeGuide';
import { VariantsEditor, type VariantDraft } from '@/components/common/VariantsEditor';
import { colourProblems, colorsForApi } from '@/lib/productColours';
import type { CloudinaryImage, ProductColor } from '@/types';
import {
  PageHeader, Panel, Button, Input, Select, Textarea, Checkbox,
} from '@/components/ui';

const FITS = ['oversized', 'regular', 'relaxed', 'slim', 'boxy'];

/**
 * New product.
 *
 * A separate screen from the editor on purpose: creating needs a handful of
 * fields the server insists on, and the editor's tabbed layout would hide half
 * of them behind tabs you have to remember to visit. Everything required is on
 * one page, in the order you would think of it, and what is missing is listed
 * rather than left for the API to reject.
 */
export function ProductCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [style, setStyle] = useState('');
  const [fit, setFit] = useState('regular');
  const [price, setPrice] = useState(0);
  const [mrp, setMrp] = useState(0);
  const [colors, setColors] = useState<ProductColor[]>([{ name: 'Black', slug: 'black', hex: '#111111' }]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [images, setImages] = useState<CloudinaryImage[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [isNewDrop, setIsNewDrop] = useState(true);
  const [isDesignerExclusive, setIsDesignerExclusive] = useState(false);

  const { data: categoryData } = useQuery({
    queryKey: queryKeys.categories.list({}),
    queryFn: () => categoriesApi.list({}),
  });

  // A product's shelf is always a product type; a style is an optional
  // extra tag on top of it. Virtual categories like "Sale" are neither.
  const categories = (categoryData?.categories ?? []).filter((item) => item.type === 'product-type');
  const styles = (categoryData?.categories ?? []).filter((item) => item.type === 'style');

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => productsApi.create(payload),
    onSuccess: (result) => {
      toast.success(`${result.product.name} created`);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      // Straight into the editor, where the remaining tabs live.
      navigate(`/products/${result.product._id}`, { replace: true });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not create this product')),
  });

  /** Everything the API will reject, said plainly and before you submit. */
  const problems = useMemo(() => {
    const list: string[] = [];
    if (name.trim().length < 2) list.push('Give the product a name.');
    if (description.trim().length < 10) list.push('Write a description of at least 10 characters.');
    if (!category) list.push('Choose a category.');
    if (price <= 0) list.push('Set a selling price.');
    if (mrp < price) list.push('MRP cannot be lower than the selling price.');
    if (colors.length === 0) list.push('Add at least one colour.');
    list.push(...colourProblems(colors));
    if (variants.length === 0) list.push('Pick at least one size so there is something to sell.');
    return list;
  }, [name, description, category, price, mrp, colors, variants]);

  const submit = () =>
    create.mutate({
      name: name.trim(),
      shortDescription: shortDescription.trim() || undefined,
      description: description.trim(),
      category,
      collections: style ? [style] : [],
      gender: 'men',
      fit,
      price,
      mrp: mrp || price,
      colors: colorsForApi(colors),
      variants: variants.map((variant) => ({
        size: variant.size,
        color: variant.color,
        stock: Number(variant.stock) || 0,
        price: variant.price ?? null,
      })),
      images: images.map((image) => ({
        url: image.url,
        publicId: image.publicId || undefined,
        alt: image.alt || undefined,
        width: image.width ?? undefined,
        height: image.height ?? undefined,
      })),
      isActive,
      isNewDrop,
      isDesignerExclusive,
    });

  return (
    <>
      <PageHeader
        title="New product"
        description="Everything the storefront needs to list a piece. You can refine the rest after it is created."
        breadcrumbs={[{ label: 'Catalog' }, { label: 'Products', to: '/products' }, { label: 'New' }]}
        actions={
          <Button onClick={submit} isLoading={create.isPending} disabled={problems.length > 0}>
            <Check className="h-4 w-4" aria-hidden="true" />
            Create product
          </Button>
        }
      />

      <div className="stagger grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          <Panel title="Basics">
            <div className="space-y-4 p-5">
              <Input
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="HUMOVARE Movement Print Tee"
                required
                hint="The URL is generated from this and can be changed later."
              />
              <Input
                label="Short description"
                value={shortDescription}
                onChange={(event) => setShortDescription(event.target.value)}
                placeholder="Heavyweight printed tee in a boxy cut."
                hint="One line, shown on cards and in search results."
              />
              <Textarea
                label="Description"
                rows={6}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Fabric, fit, construction — what a customer would want to know before buying."
                required
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <Select
                  label="Category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  required
                >
                  <option value="">Choose a category…</option>
                  {categories.map((item) => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                  ))}
                </Select>
                <Select
                  label="Style"
                  value={style}
                  onChange={(event) => setStyle(event.target.value)}
                  hint="Optional — lists it on that style's page."
                >
                  <option value="">No style</option>
                  {styles.map((item) => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                  ))}
                </Select>
                <Select label="Fit" value={fit} onChange={(event) => setFit(event.target.value)}>
                  {FITS.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </div>
            </div>
          </Panel>

          <Panel title="Price" description="Show a saving by setting the MRP above the selling price.">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Input
                label="Selling price (₹)"
                type="number"
                min={0}
                value={String(price)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setPrice(next);
                  // Keeping MRP in step avoids the most common rejection.
                  if (mrp < next) setMrp(next);
                }}
                required
              />
              <Input
                label="MRP (₹)"
                type="number"
                min={0}
                value={String(mrp)}
                onChange={(event) => setMrp(Number(event.target.value))}
                hint="Must be at or above the selling price."
              />
            </div>
          </Panel>

          <Panel title="Colours, sizes & stock" description="What is actually sellable.">
            <div className="p-5">
              <VariantsEditor
                colors={colors}
                variants={variants}
                onColorsChange={setColors}
                onVariantsChange={setVariants}
              />
            </div>
          </Panel>

          <Panel title="Images" description="The first image becomes the thumbnail across the storefront.">
            <div className="p-5">
              <ImageSizeGuide folder="products" defaultOpen={false} className="mb-4" />
              <ImageGalleryInput images={images} onChange={setImages} folder="products" />
            </div>
          </Panel>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20">
          <Panel title="Visibility">
            <div className="space-y-3 p-5">
              <Checkbox
                label="Active"
                description="Visible on the storefront as soon as it is created."
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              <Checkbox
                label="New drop"
                description="Adds it to the New Drops rail and /new-drops."
                checked={isNewDrop}
                onChange={(event) => setIsNewDrop(event.target.checked)}
              />
              <Checkbox
                label="Designer Wear - Exclusive"
                description="Adds it to the Designer Wear - Exclusive rail and /designer-wear-exclusive."
                checked={isDesignerExclusive}
                onChange={(event) => setIsDesignerExclusive(event.target.checked)}
              />
            </div>
          </Panel>

          <Panel title="Before you save">
            <div className="p-5">
              {problems.length === 0 ? (
                <p className="flex items-start gap-2 text-sm text-success">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Ready to create.
                </p>
              ) : (
                <ul className="space-y-2">
                  {problems.map((problem) => (
                    <li key={problem} className="flex items-start gap-2 text-sm text-ink-muted">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                      {problem}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Button variant="ghost" size="sm" onClick={() => navigate('/products')}>
            ← Back to products
          </Button>
        </div>
      </div>
    </>
  );
}

export default ProductCreatePage;
