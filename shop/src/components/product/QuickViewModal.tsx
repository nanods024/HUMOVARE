import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Image } from '@/components/ui/Image';
import { Badge } from '@/components/ui/Badge';
import { ColorSelector, SizeSelector } from './VariantSelector';
import { QuantityStepper } from './QuantityStepper';
import { useUIStore } from '@/store/uiStore';
import { useCart } from '@/hooks/useCart';
import { useProductSelection } from '@/hooks/useProductSelection';
import { productsApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { formatPrice } from '@/utils/format';
import { productImagePair } from '@/utils/image';

/**
 * Quick view — add to bag without leaving the grid.
 *
 * Deliberately a reduced version of the product page: gallery, variants,
 * price and one CTA. Anything more and it becomes a second product page to
 * maintain.
 */
export function QuickViewModal() {
  const slug = useUIStore((state) => state.quickViewSlug);
  const close = useUIStore((state) => state.closeQuickView);
  const openCartDrawer = useUIStore((state) => state.openCartDrawer);
  const { addItem, isMutating } = useCart();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.products.detail(slug ?? ''),
    queryFn: () => productsApi.detail(slug as string),
    enabled: Boolean(slug),
  });

  const product = data?.product;
  const selection = useProductSelection(product);
  const { primary } = productImagePair(product ?? {});

  const handleAdd = async () => {
    if (!product || !selection.requireSize() || !selection.selectedVariant) return;

    await addItem(product, selection.selectedVariant, selection.quantity);
    close();
    openCartDrawer();
  };

  return (
    <Modal isOpen={Boolean(slug)} onClose={close} position="center" size="lg" title="Quick view">
      {isLoading || !product ? (
        <div className="grid gap-6 p-6 sm:grid-cols-2">
          <div className="skeleton aspect-product" />
          <div className="space-y-3">
            <div className="skeleton h-6 w-3/4" />
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-20 w-full" />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 p-5 sm:grid-cols-2 sm:gap-8 sm:p-6">
          <div className="relative">
            <Image
              image={primary}
              alt={product.name}
              aspect={5 / 4}
              sizes="(min-width: 640px) 40vw, 90vw"
              width={700}
              wrapperClassName="aspect-product w-full overflow-hidden rounded-2xl"
            />
            {product.discountPercentage > 0 && (
              <Badge variant="sale" className="absolute left-2 top-2">
                {product.discountPercentage}% off
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <div>
              {product.category?.name && (
                <p className="text-[0.625rem] uppercase tracking-wider text-ink-subtle">
                  {product.category.name}
                </p>
              )}
              <h3 className="mt-1 font-sans text-lg font-semibold normal-case leading-snug">
                {product.name}
              </h3>

              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-lg font-semibold">{formatPrice(selection.price)}</span>
                {product.mrp > selection.price && (
                  <span className="text-sm text-ink-subtle line-through">
                    {formatPrice(product.mrp)}
                  </span>
                )}
              </div>

              {product.shortDescription && (
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  {product.shortDescription}
                </p>
              )}
            </div>

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
            />

            <QuantityStepper
              value={selection.quantity}
              max={selection.maxQuantity}
              onChange={selection.setQuantity}
            />

            <div className="mt-auto space-y-2">
              <Button
                variant="primary"
                fullWidth
                onClick={handleAdd}
                isLoading={isMutating}
                disabled={selection.isSoldOut}
              >
                {selection.isSoldOut ? 'Sold out' : 'Add to bag'}
              </Button>

              <Link
                to={`/product/${product.slug}`}
                onClick={close}
                className="flex items-center justify-center gap-2 py-2 text-[0.6875rem] uppercase tracking-wider text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                View full details
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default QuickViewModal;
