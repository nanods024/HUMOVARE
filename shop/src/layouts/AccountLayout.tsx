import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { User, Package, MapPin, Heart, LogOut, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/hooks/useAuth';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';

const LINKS = [
  { to: '/account', label: 'Profile', hint: 'Your details', icon: User, end: true },
  { to: '/account/orders', label: 'Orders', hint: 'Track & review', icon: Package, end: false },
  { to: '/account/addresses', label: 'Addresses', hint: 'Delivery places', icon: MapPin, end: false },
  { to: '/wishlist', label: 'Wishlist', hint: 'Saved pieces', icon: Heart, end: false },
];

/**
 * Shell for every account page: a slim title, a rounded side menu (a
 * swipeable pill row on phones) and the page itself, which glides in each
 * time the route changes.
 */
export function AccountLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="acct-scope container-page py-8 md:py-12">
      <Breadcrumbs items={[{ label: 'Account', to: '/account' }]} />

      <header className="mt-4 flex animate-fade-up flex-wrap items-center justify-between gap-4">
        <h1 className="text-display-sm uppercase md:text-display-md">My account</h1>
        {user && (
          <div className="acct-card flex w-full min-w-0 items-center gap-3 px-4 py-3 md:w-auto md:max-w-sm">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <User className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-subtle">Signed in as</span>
              <span className="block truncate text-sm font-medium text-ink" title={user.email}>{user.email}</span>
            </span>
            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
          </div>
        )}
      </header>

      <div className="mt-6 grid gap-6 md:mt-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        {/* ── Menu ─────────────────────────────────────────────────────── */}
        <nav aria-label="Account" className="animate-fade-up lg:sticky lg:top-28 lg:self-start" style={{ animationDelay: '80ms' }}>
          <ul className="grid grid-cols-5 gap-1.5 md:flex md:flex-wrap md:gap-2 lg:block lg:space-y-1 lg:rounded-[1.25rem] lg:border lg:border-line lg:bg-canvas lg:p-2 lg:shadow-[0_12px_32px_-20px_rgba(0,0,0,0.18)]">
            {LINKS.map((link) => (
              <li key={link.to} className="min-w-0">
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    cn(
                      'group flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center transition-all duration-300',
                      'md:flex-row md:justify-start md:gap-3 md:whitespace-nowrap md:px-3.5 md:py-2.5 md:text-left',
                      'border lg:border-0',
                      isActive
                        ? 'border-primary bg-primary text-white shadow-[0_10px_24px_-12px_rgb(var(--color-primary)/0.8)]'
                        : 'border-line text-ink-muted hover:bg-surface hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors md:h-8 md:w-8',
                          isActive ? 'bg-white/15' : 'bg-surface group-hover:bg-canvas',
                        )}
                      >
                        <link.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 max-w-full">
                        <span className="block truncate text-[0.5625rem] font-bold uppercase tracking-normal min-[400px]:text-[0.625rem] md:text-xs md:tracking-wider">{link.label}</span>
                        <span className={cn('hidden text-[0.6875rem] lg:block', isActive ? 'text-white/70' : 'text-ink-subtle')}>
                          {link.hint}
                        </span>
                      </span>
                      <ChevronRight
                        className={cn(
                          'ml-auto hidden h-4 w-4 transition-transform duration-300 lg:block',
                          isActive ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60',
                        )}
                        aria-hidden="true"
                      />
                    </>
                  )}
                </NavLink>
              </li>
            ))}

            <li className="min-w-0 lg:mt-2 lg:border-t lg:border-line lg:pt-2">
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
                className="group flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-line px-1 py-2 text-center text-ink-muted transition-all duration-300 hover:bg-danger/5 hover:text-danger md:flex-row md:justify-start md:gap-3 md:whitespace-nowrap md:px-3.5 md:py-2.5 md:text-left lg:border-0"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface transition-colors group-hover:bg-danger/10 md:h-8 md:w-8">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="block max-w-full truncate text-[0.5625rem] font-bold uppercase tracking-normal min-[400px]:text-[0.625rem] md:text-xs md:tracking-wider">Sign out</span>
              </button>
            </li>
          </ul>
        </nav>

        {/* ── Page ─────────────────────────────────────────────────────── */}
        <div key={location.pathname} className="min-w-0 animate-fade-up">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default AccountLayout;
