import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ButtonLink } from '@/components/ui/Button';
import { CartLineItem } from './CartLineItem';
import { FreeShippingMeter } from './FreeShippingMeter';
import { useUIStore } from '@/store/uiStore';
import { useCart } from '@/hooks/useCart';
import { formatPrice } from '@/utils/format';

export function CartDrawer() {
  const isOpen = useUIStore((state) => state.isCartDrawerOpen);
  const close = useUIStore((state) => state.closeCartDrawer);
  const { items, summary, savings, isEmpty, isLoading, updateQuantity, removeItem } = useCart();

  return (
    <Modal isOpen={isOpen} onClose={close} position="right" size="md" title="Your bag">
      {isEmpty && !isLoading ? (
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <ShoppingBag className="mb-5 h-10 w-10 text-ink-subtle" strokeWidth={1.25} aria-hidden="true" />
          <h3 className="text-display-sm">Your bag is empty</h3>
          <p className="mt-3 text-sm text-ink-muted">
            Once you add something, it will show up here.
          </p>
          <ButtonLink to="/shop" variant="primary" className="mt-7" onClick={close}>
            Start shopping
          </ButtonLink>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="border-b border-line px-5 py-4">
            <FreeShippingMeter
              subtotal={summary?.subtotal ?? 0}
              threshold={summary?.freeShippingThreshold ?? 999}
            />
          </div>

          <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
            {items.map((line) => (
              <li key={line.id} className="py-4">
                <CartLineItem
                  line={line}
                  onQuantityChange={(quantity) => updateQuantity(line, quantity)}
                  onRemove={() => removeItem(line)}
                  compact
                />
              </li>
            ))}
          </ul>

          <footer className="shrink-0 space-y-4 border-t border-line bg-surface px-5 py-5">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="font-medium">{formatPrice(summary?.subtotal ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Shipping</dt>
                <dd className="font-medium">
                  {summary?.shippingFee ? formatPrice(summary.shippingFee) : 'Free'}
                </dd>
              </div>
              {savings > 0 && (
                <div className="flex justify-between text-primary">
                  <dt>You save</dt>
                  <dd className="font-medium">{formatPrice(savings)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base">
                <dt className="font-semibold">Total</dt>
                <dd className="font-semibold">{formatPrice(summary?.total ?? 0)}</dd>
              </div>
            </dl>

            <p className="text-[0.625rem] text-ink-subtle">
              Taxes included. Shipping calculated at checkout.
            </p>

            <div className="space-y-2">
              <ButtonLink to="/checkout" variant="primary" fullWidth onClick={close}>
                Proceed to checkout
              </ButtonLink>
              <Link
                to="/cart"
                onClick={close}
                className="block py-1 text-center text-xs uppercase tracking-wider text-ink-muted underline underline-offset-4"
              >
                View full bag
              </Link>
            </div>
          </footer>
        </div>
      )}
    </Modal>
  );
}

export default CartDrawer;
