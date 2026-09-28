import { Heart, LogIn } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { useAuthStore } from '@/store/authStore';
import { useWishlistProducts } from '@/hooks/useWishlist';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { ProductGrid } from '@/components/product/ProductGrid';
import { EmptyState } from '@/components/ui/States';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import { pluralise } from '@/utils/format';

export function WishlistPage() {
  useSeo({
    title: 'Wishlist',
    description: 'Pieces you have saved at HUMOVARE.',
    noindex: true,
  });

  const status = useAuthStore((state) => state.status);
  const { data, isLoading } = useWishlistProducts();

  // Wishlist is server-backed so it follows the shopper across devices.
  if (status !== 'authenticated' && status !== 'loading' && status !== 'idle') {
    return (
      <div className="container-page py-6">
        <Breadcrumbs items={[{ label: 'Wishlist' }]} />
        <EmptyState
          icon={LogIn}
          title="Sign in to see your wishlist"
          description="Saved pieces follow your account, so they are waiting on every device."
          action={{ label: 'Sign in', to: '/login?redirect=%2Fwishlist' }}
        />
      </div>
    );
  }

  const products = data?.products ?? [];

  return (
    <div className="container-page py-6 md:py-10">
      <Breadcrumbs items={[{ label: 'Wishlist' }]} />

      <header className="my-6 flex items-baseline justify-between gap-4 md:my-8">
        <h1 className="text-display-md">Wishlist</h1>
        {products.length > 0 && (
          <p className="text-sm text-ink-muted">{pluralise(products.length, 'piece')}</p>
        )}
      </header>

      {isLoading ? (
        <ProductGridSkeleton count={8} />
      ) : products.length ? (
        <ProductGrid products={products} />
      ) : (
        <EmptyState
          icon={Heart}
          title="Nothing saved yet"
          description="Tap the heart on any piece to keep it here for later."
          action={{ label: 'Browse the collection', to: '/shop' }}
        />
      )}
    </div>
  );
}

export default WishlistPage;
