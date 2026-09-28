import { Link } from 'react-router-dom';
import { ShoppingBag, ArrowLeft, AlertCircle } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { useCart } from '@/hooks/useCart';
import { formatPrice, pluralise } from '@/utils/format';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { CartLineItem } from '@/components/cart/CartLineItem';
import { FreeShippingMeter } from '@/components/cart/FreeShippingMeter';
import { RecentlyViewed } from '@/components/product/RecentlyViewed';

export function CartPage() {
  useSeo({
    title: 'Your bag',
    description: 'Review the pieces in your HUMOVARE bag before checkout.',
    noindex: true,
  });

  const { items, summary, savings, notices, isEmpty, isLoading, updateQuantity, removeItem } =
    useCart();

  if (isLoading) {
    return (
      <div className="container-page py-10">
        <ListSkeleton rows={3} />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="container-page py-6">
        <Breadcrumbs items={[{ label: 'Bag' }]} />
        <EmptyState
          icon={ShoppingBag}
          title="Your bag is empty"
          description="Nothing saved here yet. Find something worth keeping."
          action={{ label: 'Shop new drops', to: '/new-drops' }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="container-page py-6 md:py-10">
        <Breadcrumbs items={[{ label: 'Bag' }]} />

        <header className="my-6 flex items-baseline justify-between gap-4 md:my-8">
          <h1 className="text-display-md">Your bag</h1>
          <p className="text-sm text-ink-muted">{pluralise(items.length, 'item')}</p>
        </header>

        {/* The server may have adjusted the bag; say so rather than silently changing it. */}
        {notices.length > 0 && (
          <div role="status" className="mb-6 border border-warning/40 bg-warning/5 p-4 rounded-2xl">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-warning">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              Your bag was updated
            </p>
            <ul className="space-y-1 text-sm text-ink-muted">
              {notices.map((notice, index) => (
                <li key={`${notice.type}-${index}`}>{notice.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
          <div>
            <ul className="divide-y divide-line border-y border-line">
              {items.map((line) => (
                <li key={line.id} className="py-6">
                  <CartLineItem
                    line={line}
                    onQuantityChange={(quantity) => updateQuantity(line, quantity)}
                    onRemove={() => removeItem(line)}
                  />
                </li>
              ))}
            </ul>

            <Link
              to="/shop"
              className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-wider text-ink-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Continue shopping
            </Link>
          </div>

          <aside className="lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:h-fit">
            <div className="border border-line bg-surface p-5 rounded-2xl">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider">Order summary</h2>

              <FreeShippingMeter
                subtotal={summary?.subtotal ?? 0}
                threshold={summary?.freeShippingThreshold ?? 999}
              />

              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Subtotal</dt>
                  <dd className="font-medium">{formatPrice(summary?.subtotal ?? 0)}</dd>
                </div>

                {savings > 0 && (
                  <div className="flex justify-between text-primary">
                    <dt>Discount</dt>
                    <dd className="font-medium">−{formatPrice(savings)}</dd>
                  </div>
                )}

                <div className="flex justify-between">
                  <dt className="text-ink-muted">Shipping</dt>
                  <dd className="font-medium">
                    {summary?.shippingFee ? formatPrice(summary.shippingFee) : 'Free'}
                  </dd>
                </div>

                <div className="flex justify-between border-t border-line pt-3 text-base">
                  <dt className="font-semibold">Estimated total</dt>
                  <dd className="font-semibold">{formatPrice(summary?.total ?? 0)}</dd>
                </div>
              </dl>

              <p className="mt-3 text-[0.625rem] leading-relaxed text-ink-subtle">
                Inclusive of all taxes. Final shipping is confirmed at checkout.
              </p>

              <ButtonLink to="/checkout" variant="primary" size="lg" fullWidth className="mt-5">
                Proceed to checkout
              </ButtonLink>
            </div>
          </aside>
        </div>
      </div>

      <RecentlyViewed />
    </>
  );
}

export default CartPage;
