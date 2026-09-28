import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, Truck, RotateCcw, ShieldCheck, Star } from 'lucide-react';

import { productsApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { useProductSelection } from '@/hooks/useProductSelection';
import { useRecentStore } from '@/store/recentStore';
import { useUIStore } from '@/store/uiStore';
import { formatPrice } from '@/utils/format';
import { cn } from '@/utils/cn';
import { SITE_URL, FIT_LABELS, LOW_STOCK_THRESHOLD } from '@/constants';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AccordionItem } from '@/components/ui/Accordion';
import { ProductDetailSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { ProductGallery } from '@/components/product/ProductGallery';
import { ColorSelector, SizeSelector } from '@/components/product/VariantSelector';
import { QuantityStepper } from '@/components/product/QuantityStepper';
import { SizeGuide } from '@/components/product/SizeGuide';
import { ProductGrid } from '@/components/product/ProductGrid';
import { RecentlyViewed } from '@/components/product/RecentlyViewed';
import { useStoreSettings } from '@/hooks/useStoreSettings';

export function ProductPage() {
  const { brand: BRAND, text: shopText } = useStoreSettings();
  const { slug = '' } = useParams();
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.products.detail(slug),
    queryFn: () => productsApi.detail(slug),
    enabled: Boolean(slug),
  });

  const product = data?.product;
  const related = data?.related ?? [];

  const selection = useProductSelection(product);
  const { addItem, isMutating } = useCart();
  const { isWishlisted, toggle } = useWishlist();
  const openCartDrawer = useUIStore((state) => state.openCartDrawer);
  const recordProduct = useRecentStore((state) => state.recordProduct);

  useEffect(() => {
    if (product?._id) recordProduct(product._id);
  }, [product?._id, recordProduct]);

  useSeo({
    title: product?.seo?.title || product?.name || 'Product',
    description: product?.seo?.description || product?.shortDescription,
    image: product?.thumbnail?.url,
    canonicalPath: `/product/${slug}`,
    type: 'product',
    // Product schema lets the listing show price and availability in search.
    structuredData: product
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          description: product.shortDescription || product.description,
          sku: product.variants?.[0]?.sku,
          image: (product.images ?? []).map((image) => image.url),
          brand: { '@type': 'Brand', name: product.brand || BRAND.name },
          aggregateRating: product.rating?.count
            ? {
                '@type': 'AggregateRating',
                ratingValue: product.rating.average,
                reviewCount: product.rating.count,
              }
            : undefined,
          offers: {
            '@type': 'Offer',
            url: `${SITE_URL}/product/${product.slug}`,
            priceCurrency: 'INR',
            price: product.price,
            availability:
              product.stock > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
          },
        }
      : null,
  });

  if (isLoading) return <ProductDetailSkeleton />;

  if (isError || !product) {
    return (
      <ErrorState
        title="We could not find that piece"
        description="It may have sold out or been retired. Try browsing the full collection."
        onRetry={() => refetch()}
      />
    );
  }

  const saved = isWishlisted(product._id);
  const isLowStock = product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;

  const handleAddToCart = async () => {
    if (!selection.requireSize() || !selection.selectedVariant) return;
    await addItem(product, selection.selectedVariant, selection.quantity);
    openCartDrawer();
  };

  return (
    <>
      <div className="container-page py-4">
        <Breadcrumbs
          items={[
            ...(product.category
              ? [{ label: product.category.name, to: `/${product.category.slug}` }]
              : []),
            { label: product.name },
          ]}
        />
      </div>

      <div className="container-page grid gap-10 pb-16 lg:grid-cols-2 lg:gap-14">
        <div className="lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:self-start">
          <ProductGallery images={product.images ?? []} productName={product.name} />
        </div>

        <div className="flex flex-col gap-6">
          <header>
            <p className="eyebrow">{product.brand || BRAND.name}</p>

            <h1 className="mt-2 font-sans text-2xl font-semibold normal-case leading-tight md:text-3xl">
              {product.name}
            </h1>

            {product.rating?.count ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                <span className="flex" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className={cn(
                        'h-3.5 w-3.5',
                        index < Math.round(product.rating!.average)
                          ? 'fill-primary text-primary'
                          : 'text-line',
                      )}
                    />
                  ))}
                </span>
                <span>
                  {product.rating.average.toFixed(1)} · {product.rating.count} reviews
                </span>
              </p>
            ) : null}
          </header>

          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-semibold">{formatPrice(selection.price)}</span>
              {product.mrp > selection.price && (
                <>
                  <span className="text-base text-ink-subtle line-through">
                    {formatPrice(product.mrp)}
                  </span>
                  <Badge variant="sale">{product.discountPercentage}% off</Badge>
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {product.taxIncluded ? 'Inclusive of all taxes' : 'Taxes calculated at checkout'}
            </p>
          </div>

          {product.shortDescription && (
            <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
              {product.shortDescription}
            </p>
          )}

          <ColorSelector
            colors={product.colors}
            variants={product.variants}
            selected={selection.colorSlug}
            onSelect={selection.chooseColor}
          />

          <SizeSelector
            variants={product.variants}
            colorSlug={selection.colorSlug}
            selected={selection.size}
            onSelect={selection.chooseSize}
            error={selection.sizeError}
            onOpenSizeGuide={() => setIsSizeGuideOpen(true)}
          />

          {isLowStock && (
            <p className="text-xs font-medium text-warning">
              Only {product.stock} left across all sizes
            </p>
          )}

          <QuantityStepper
            value={selection.quantity}
            max={selection.maxQuantity}
            onChange={selection.setQuantity}
          />

          {/* Sticky on mobile so the buy action is always within thumb reach. */}
          <div className="sticky bottom-0 -mx-gutter border-t border-line bg-canvas/95 px-gutter py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleAddToCart}
                isLoading={isMutating}
                disabled={selection.isSoldOut}
              >
                {selection.isSoldOut ? 'Sold out' : 'Add to bag'}
              </Button>

              <button
                type="button"
                onClick={() => toggle(product._id, product.name)}
                aria-pressed={saved}
                aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
                className="grid h-14 w-14 shrink-0 place-items-center border border-ink-black transition-colors hover:bg-surface rounded-xl"
              >
                <Heart
                  className={cn('h-5 w-5', saved && 'fill-primary text-primary')}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <ul className="grid grid-cols-3 gap-3 border-y border-line py-4">
            {[
              { icon: Truck, label: `Free shipping above ${shopText.freeAbove}` },
              { icon: RotateCcw, label: `${shopText.returnDays} easy returns` },
              { icon: ShieldCheck, label: 'Secure payments' },
            ].map((item) => (
              <li key={item.label} className="flex flex-col items-center gap-1.5 text-center">
                <item.icon className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                <span className="text-[0.625rem] leading-tight text-ink-muted">{item.label}</span>
              </li>
            ))}
          </ul>

          <div>
            <AccordionItem title="Description" defaultOpen>
              <p className="whitespace-pre-line">{product.description}</p>
            </AccordionItem>

            <AccordionItem title="Product details">
              <dl className="space-y-2">
                {[
                  ['Fit', product.fit ? FIT_LABELS[product.fit] ?? product.fit : ''],
                  ['Gender', product.gender],
                  ['Colours', product.colors.map((color) => color.name).join(', ')],
                  ['Sizes', product.sizes?.join(', ')],
                ]
                  .filter(([, value]) => Boolean(value))
                  .map(([label, value]) => (
                    <div key={label as string} className="flex gap-3">
                      <dt className="w-24 shrink-0 text-xs uppercase tracking-wider text-ink-subtle">
                        {label}
                      </dt>
                      <dd className="capitalize">{value}</dd>
                    </div>
                  ))}
              </dl>

              {product.highlights?.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {product.highlights.map((highlight) => (
                    <li key={highlight} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 bg-primary" aria-hidden="true" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              )}
            </AccordionItem>

            {product.careInstructions?.length > 0 && (
              <AccordionItem title="Wash care">
                <ul className="space-y-1.5">
                  {product.careInstructions.map((instruction) => (
                    <li key={instruction} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 bg-ink-subtle" aria-hidden="true" />
                      {instruction}
                    </li>
                  ))}
                </ul>
              </AccordionItem>
            )}

            <AccordionItem title="Shipping & returns">
              <p>
                Orders are dispatched within {shopText.dispatch}. Free shipping on orders above{' '}
                {shopText.freeAbove}; a flat {shopText.fee} applies below that. Delivery usually takes
                up to {shopText.delivery} depending on your PIN code.
              </p>
              <p className="mt-3">
                Unworn pieces with tags intact can be returned within {shopText.returnDays} of
                delivery. Start a return from your orders page and we will arrange a pickup.
              </p>
            </AccordionItem>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="container-page pb-16">
          <h2 className="mb-8 text-display-sm">You may also like</h2>
          <ProductGrid products={related.slice(0, 4)} />
        </section>
      )}

      <RecentlyViewed excludeId={product._id} />

      <SizeGuide isOpen={isSizeGuideOpen} onClose={() => setIsSizeGuideOpen(false)} />
    </>
  );
}

export default ProductPage;
