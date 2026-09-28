import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { categoriesApi } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { cn } from '@/utils/cn';
import { Image } from '@/components/ui/Image';

/** How long the panel stays open after the pointer leaves, in ms. */
const CLOSE_GRACE = 160;

const DISCOVER = [
  { label: 'New Drops', to: '/new-drops' },
  { label: 'Bestsellers', to: '/bestsellers' },
  // Split across two lines on purpose — "Exclusive" in the brand red is the
  // word doing the selling, so it gets its own line rather than trailing off
  // at the end of a long dash-joined label.
  { label: 'Designer Wear', accent: 'Exclusive', to: '/designer-wear-exclusive' },
  { label: 'Shop All', to: '/shop' },
];

/**
 * The single "Shop" entry in the header, with a full-width mega menu.
 *
 * Opens on hover for pointer users and on click for touch and keyboard, which
 * is the combination that actually works everywhere: a hover-only menu is
 * unreachable on a phone, and a click-only menu feels sluggish with a mouse.
 * A short close delay stops the panel vanishing while the pointer crosses the
 * gap between the trigger and the panel.
 *
 * The open/close transition is plain CSS on a permanently mounted panel, not
 * a JS animation. A JS-driven reveal that starts at `opacity: 0` leaves the
 * menu invisible if the animation frame never runs; a class toggle always
 * ends in the right state, and `visibility` keeps the closed panel out of the
 * tab order and the accessibility tree.
 */
export function ShopMenu({
  className,
  onOpenChange,
}: {
  className?: string;
  /** Lets the header know to drop its transparent state while the panel is up. */
  onOpenChange?: (isOpen: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => onOpenChange?.(isOpen), [isOpen, onOpenChange]);

  const { data } = useQuery({
    queryKey: queryKeys.categories.navigation,
    queryFn: categoriesApi.navigation,
    staleTime: 10 * 60 * 1000,
  });

  const productTypes = data?.productTypes ?? [];

  const open = () => {
    window.clearTimeout(closeTimer.current);
    setIsOpen(true);
  };

  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setIsOpen(false), CLOSE_GRACE);
  };

  const closeNow = () => {
    window.clearTimeout(closeTimer.current);
    setIsOpen(false);
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Escape closes and hands focus back to the trigger.
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeNow();
      triggerRef.current?.focus();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <div
      ref={wrapperRef}
      className={cn(className)}
      onMouseEnter={open}
      onMouseLeave={closeSoon}
      // Tabbing out of the whole group closes the panel.
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node)) closeNow();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="shop-menu-panel"
        onClick={() => (isOpen ? closeNow() : open())}
        onFocus={open}
        className="group relative flex items-center gap-1.5 py-2 text-base font-medium"
      >
        Shop
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform duration-base ease-brand',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-x-0 -bottom-0.5 h-0.5 origin-left bg-primary transition-transform duration-base ease-brand',
            isOpen ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
          )}
        />
      </button>

      <div
        id="shop-menu-panel"
        // Anchored to the header (its positioned ancestor), not the trigger,
        // so the panel spans the full page width.
        className={cn(
          'absolute inset-x-0 top-full z-40 border-b border-line bg-canvas shadow-lift',
          'transition-[opacity,transform,visibility] duration-base ease-brand',
          isOpen
            ? 'visible translate-y-0 opacity-100'
            : 'invisible -translate-y-2 opacity-0',
        )}
      >
        {/* Full width with the page gutter, so it lines up with the logo and icons above. */}
        <div className="grid w-full gap-10 px-gutter py-10 lg:grid-cols-[auto_auto_1fr] lg:gap-16">
          <nav aria-label="Shop by category">
            <h3 className="mb-5 text-base font-medium">Shop by Category</h3>
            <ul className="space-y-3">
              {productTypes.map((category) => (
                <li key={category.slug}>
                  <Link
                    to={`/${category.slug}`}
                    onClick={closeNow}
                    tabIndex={isOpen ? undefined : -1}
                    className="text-sm text-ink-muted transition-colors hover:text-primary"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Discover">
            <h3 className="mb-5 text-base font-medium">Discover</h3>
            <ul className="space-y-3">
              {DISCOVER.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={closeNow}
                    tabIndex={isOpen ? undefined : -1}
                    className="block text-sm text-ink-muted transition-colors hover:text-primary"
                  >
                    {item.label}
                    {item.accent && (
                      <span className="block font-semibold text-primary">{item.accent}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <ul className="hidden grid-cols-4 gap-4 lg:grid">
            {productTypes.map((category) => (
              <li key={`card-${category.slug}`}>
                <Link
                  to={`/${category.slug}`}
                  onClick={closeNow}
                  tabIndex={isOpen ? undefined : -1}
                  className="group/card block"
                >
                  <div className="aspect-[4/5] overflow-hidden bg-surface rounded-2xl">
                    <Image
                      image={category.image}
                      alt=""
                      aspect={5 / 4}
                      sizes="18vw"
                      width={420}
                      wrapperClassName="h-full w-full"
                      className="transition-transform duration-slow ease-brand group-hover/card:scale-105"
                    />
                  </div>
                  <p className="mt-3 text-center text-sm transition-colors group-hover/card:text-primary">
                    {category.name}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default ShopMenu;
