import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Heart, LogOut, Package, User, Mail, LogIn, UserPlus, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { NAV_LINKS } from '@/constants';
import { useUIStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';
import { useStoreSettings } from '@/hooks/useStoreSettings';

const ACCOUNT_LINKS = [
  { label: 'Account', to: '/account', icon: User },
  { label: 'Orders', to: '/account/orders', icon: Package },
  { label: 'Wishlist', to: '/wishlist', icon: Heart },
];

const initialsOf = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'H';

/**
 * Phone menu: who you are and your account shortcuts first, then the shop,
 * then help. Everything is rounded and slides in one row after another.
 */
export function MobileMenu() {
  const { brand: BRAND } = useStoreSettings();
  const isOpen = useUIStore((state) => state.isMobileMenuOpen);
  const close = useUIStore((state) => state.closeMobileMenu);
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = async () => {
    close();
    await logout();
    navigate('/');
  };

  return (
    <Modal isOpen={isOpen} onClose={close} position="left" size="sm" title="Menu">
      <nav aria-label="Mobile" className="flex min-h-full flex-col gap-5 bg-surface/50 p-4">
        {/* ── Account ──────────────────────────────────────────────────── */}
        {isAuthenticated && user ? (
          <section className="acct-card animate-fade-up overflow-hidden">
            <div className="relative flex items-center gap-3 p-4">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-base font-bold text-white shadow-[0_8px_20px_-8px_rgb(var(--color-primary)/0.8)]">
                {initialsOf(user.name)}
              </span>
              <span className="relative min-w-0">
                <span className="block truncate text-sm font-bold">Hi, {user.name.split(' ')[0]}</span>
                <span className="block truncate text-xs text-ink-muted">{user.email}</span>
              </span>
            </div>

            <ul className="grid grid-cols-3 gap-2 px-4 pb-4">
              {ACCOUNT_LINKS.map((link) => {
                const active = link.to === '/account' ? pathname === '/account' : pathname.startsWith(link.to);
                return (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      onClick={close}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border py-3 text-[0.6875rem] font-semibold transition-all duration-300 active:scale-95',
                        active
                          ? 'border-primary bg-primary text-white shadow-[0_8px_18px_-10px_rgb(var(--color-primary)/0.8)]'
                          : 'border-line bg-canvas text-ink-muted hover:text-ink',
                      )}
                    >
                      <link.icon className="h-4 w-4" aria-hidden="true" />
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 border-t border-line py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted transition-colors hover:bg-danger/5 hover:text-danger"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </section>
        ) : (
          <section className="acct-card animate-fade-up p-4">
            <p className="text-sm font-bold">Welcome to HUMOVARE</p>
            <p className="mt-1 text-xs text-ink-muted">Sign in to track orders and save your favourites.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                to="/login"
                onClick={close}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-[0.6875rem] font-semibold uppercase tracking-wider text-white shadow-[0_10px_22px_-12px_rgb(var(--color-primary)/0.8)] transition-transform active:scale-95"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Sign in
              </Link>
              <Link
                to="/register"
                onClick={close}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-canvas text-[0.6875rem] font-semibold uppercase tracking-wider transition-transform active:scale-95"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Register
              </Link>
            </div>
          </section>
        )}

        {/* ── Shop ─────────────────────────────────────────────────────── */}
        <section>
          <p className="mb-2 px-1 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-ink-subtle">Shop</p>
          <ul className="acct-stagger space-y-1.5">
            {NAV_LINKS.map((link) => {
              const accent = 'accent' in link && link.accent;
              const active = pathname === link.to;
              return (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    onClick={close}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl border px-4 py-3.5 text-[0.8125rem] font-semibold uppercase tracking-wider transition-all duration-300 active:scale-[0.98]',
                      active
                        ? 'border-primary/30 bg-primary/5 text-primary'
                        : 'border-transparent bg-canvas hover:border-line',
                      accent && !active && 'text-primary',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{link.label.replace(' - EXCLUSIVE', '')}</span>
                    {accent && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[0.5625rem] font-bold tracking-wider text-white">
                        <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                        Exclusive
                      </span>
                    )}
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-ink-subtle transition-transform duration-300 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Help ─────────────────────────────────────────────────────── */}
        <a
          href={`mailto:${BRAND.email}`}
          className="acct-card mt-auto flex items-center gap-3 p-4 transition-transform active:scale-[0.98]"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Mail className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold">Need a hand?</span>
            <span className="block truncate text-xs text-ink-muted">{BRAND.email}</span>
          </span>
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        </a>
      </nav>
    </Modal>
  );
}

export default MobileMenu;
