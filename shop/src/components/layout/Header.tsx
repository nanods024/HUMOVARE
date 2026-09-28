import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Search, ShoppingBag, User, Heart } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Logo } from './Logo';
import { ShopMenu } from './ShopMenu';
import { useUIStore } from '@/store/uiStore';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { useAuthStore } from '@/store/authStore';

/** Scroll distance before the header switches to its compact state. */
const COMPACT_AT = 32;

/**
 * Single-row header: wordmark left, one "Shop" entry with a mega menu in the
 * middle, utilities right.
 *
 * Collapsing the whole catalogue behind one menu keeps the bar uncluttered at
 * every width and gives the dropdown room to show category imagery, which a
 * flat list of seven links never could.
 */
export function Header() {
  const [isCompact, setIsCompact] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { pathname } = useLocation();

  const openMobileMenu = useUIStore((state) => state.openMobileMenu);
  const openSearch = useUIStore((state) => state.openSearch);
  const openCartDrawer = useUIStore((state) => state.openCartDrawer);

  const { totalQuantity } = useCart();
  const { count: wishlistCount } = useWishlist();
  const isAuthed = useAuthStore((state) => state.status === 'authenticated');

  // Only the homepage opens on a full-bleed dark hero, so it's the only
  // route where the header can start transparent — everywhere else it must
  // be legible over plain page content from the first frame.
  const canGoTransparent = pathname === '/';

  useEffect(() => {
    const onScroll = () => setIsCompact(window.scrollY > COMPACT_AT);
    onScroll();
    // Passive: this never calls preventDefault, so scrolling stays on the
    // compositor thread.
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The mega menu's panel is solid white, so a still-transparent bar above it
  // reads as broken — drop transparency the moment it opens, same as scroll.
  const isTransparent = canGoTransparent && !isCompact && !isMenuOpen;

  // Plain icons: no frame or fill, just a colour change on hover.
  const iconButton = cn(
    'relative grid h-10 w-10 place-items-center transition-colors duration-300 active:scale-95',
    isTransparent ? 'hover:text-white/70' : 'hover:text-primary',
  );
  const iconClass = 'h-[1.35rem] w-[1.35rem]';

  return (
    <header
      className={cn(
        'fixed top-0 z-50 w-full border-b transition-colors duration-base ease-brand',
        isTransparent
          ? 'border-transparent bg-transparent text-white'
          : // Solid white — a see-through bar picks up the colour of whatever
            // is behind it and no longer matches the white Shop menu.
            cn('bg-canvas text-ink', isMenuOpen ? 'border-transparent' : 'border-line/70 shadow-[0_8px_30px_-22px_rgb(0_0_0/0.35)]'),
      )}
    >
      <div
        className={cn(
          // Full width: the logo sits on the left edge and the icons on the right.
          'flex w-full items-center justify-between gap-6 px-gutter transition-[height] duration-base ease-brand',
          isCompact ? 'h-[4.5rem] md:h-20' : 'h-20 md:h-28',
        )}
      >
        {/* Left — wordmark */}
        <div className="flex flex-1 items-center">
          <Logo
            className={cn(
              'transition-[height] duration-base ease-brand',
              isCompact ? 'h-8 md:h-10' : 'h-9 md:h-12',
            )}
          />
        </div>

        {/* Centre — the one nav entry */}
        <nav aria-label="Main" className="hidden lg:block">
          <ShopMenu onOpenChange={setIsMenuOpen} />
        </nav>

        {/* Right — utilities */}
        <div className="-mr-2 flex flex-1 items-center justify-end gap-1 sm:gap-2">
          <button type="button" onClick={openSearch} aria-label="Search" title="Search" className={iconButton}>
            <Search className={iconClass} strokeWidth={1.5} aria-hidden="true" />
          </button>

          <Link
            to={isAuthed ? '/account' : '/login'}
            aria-label={isAuthed ? 'Your account' : 'Sign in'}
            title={isAuthed ? 'Your account' : 'Sign in'}
            className={cn(iconButton, 'hidden md:grid')}
          >
            <User className={iconClass} strokeWidth={1.5} aria-hidden="true" />
          </Link>

          <Link to="/wishlist" aria-label="Wishlist" title="Wishlist" className={cn(iconButton, 'hidden md:grid')}>
            <Heart className={iconClass} strokeWidth={1.5} aria-hidden="true" />
            {wishlistCount > 0 && <CountDot count={wishlistCount} />}
          </Link>

          <button
            type="button"
            onClick={openCartDrawer}
            aria-label={`Bag, ${totalQuantity} item${totalQuantity === 1 ? '' : 's'}`}
            title="Bag"
            className={iconButton}
          >
            <ShoppingBag className={iconClass} strokeWidth={1.5} aria-hidden="true" />
            {totalQuantity > 0 && <CountDot count={totalQuantity} />}
          </button>

          {/* The whole catalogue lives in the drawer below lg. */}
          <button type="button" onClick={openMobileMenu} aria-label="Open menu" className={cn(iconButton, 'lg:hidden')}>
            <Menu className={iconClass} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

function CountDot({ count }: { count: number }) {
  return (
    <span
      // Keyed on the count so it pops again whenever the number changes.
      key={count}
      aria-hidden="true"
      className="success-pop absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.5625rem] font-bold leading-none text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default Header;
