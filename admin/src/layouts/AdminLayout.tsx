import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Tags, Layers, Boxes, Image as ImageIcon,
  Home, Store, ShoppingCart, Users, Shield, KeyRound, ScrollText,
  Settings, PanelLeftClose, LogOut, ExternalLink, Menu, AlertTriangle,
  Inbox, Instagram, X,
} from 'lucide-react';

import { cn } from '@/utils/cn';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { usePermission } from '@/hooks/usePermission';
import { useUIStore } from '@/store/uiStore';
import { PERMISSIONS as P, ROLE_LABELS } from '@/permissions';
import { Button, ToastViewport } from '@/components/ui';
import { IdleLogout } from '@/components/common/IdleLogout';

interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  /** Any one of these grants visibility. */
  permissions?: string[];
  /** The server allows only super admins, whatever the permissions say. */
  superAdminOnly?: boolean;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: '',
    items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, permissions: [P.ORDERS_READ], end: true }],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Products', to: '/products', icon: Package, permissions: [P.PRODUCTS_READ] },
      { label: 'Categories', to: '/categories', icon: Tags, permissions: [P.CATEGORIES_READ] },
      { label: 'Collections', to: '/collections', icon: Layers, permissions: [P.COLLECTIONS_READ] },
      { label: 'Stock', to: '/inventory', icon: Boxes, permissions: [P.INVENTORY_READ] },
      { label: 'Media', to: '/media', icon: ImageIcon, permissions: [P.MEDIA_READ] },
    ],
  },
  {
    label: 'Storefront',
    items: [
      { label: 'Homepage', to: '/homepage', icon: Home, permissions: [P.HOMEPAGE_READ] },
      { label: 'Shop page', to: '/shop', icon: Store, permissions: [P.SHOP_READ] },
      { label: 'Insta posts', to: '/instagram', icon: Instagram, permissions: [P.HOMEPAGE_READ] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Orders', to: '/orders', icon: ShoppingCart, permissions: [P.ORDERS_READ] },
      { label: 'Customers', to: '/customers', icon: Users, permissions: [P.CUSTOMERS_READ] },
      { label: 'Feedback', to: '/feedback', icon: Inbox, permissions: [P.FEEDBACK_READ] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Admin users', to: '/admin-users', icon: Shield, permissions: [P.ADMINS_READ] },
      { label: 'Roles', to: '/roles', icon: KeyRound, permissions: [P.ROLES_MANAGE] },
      { label: 'Audit logs', to: '/audit-logs', icon: ScrollText, permissions: [P.AUDITLOGS_READ], superAdminOnly: true },
      { label: 'Settings', to: '/settings', icon: Settings, permissions: [P.SETTINGS_READ] },
    ],
  },
];

const SITE_URL = import.meta.env.VITE_SITE_URL || 'http://localhost:5173';

const initialsOf = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';

export function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const { canAny, isSuperAdmin } = usePermission();
  const navigate = useNavigate();
  const location = useLocation();

  const isCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Hide anything the current admin could not use — the server would only
  // return 403 anyway, so showing it is just a dead end.
  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => (!item.superAdminOnly || isSuperAdmin) && (!item.permissions || canAny(...item.permissions)),
    ),
  })).filter((group) => group.items.length > 0);

  // The section the current page belongs to, for the top bar.
  const current = NAV.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))
    .find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  /** The rail, shared by the desktop sidebar and the mobile drawer. */
  const renderSidebar = (collapsed: boolean) => (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#16181f] via-[#121419] to-[#0d0f13] text-white/75 shadow-inset">
      <div className={cn('flex h-16 shrink-0 items-center gap-3 px-4 transition-[padding] duration-300 ease-smooth', collapsed && 'lg:justify-center lg:px-0')}>
        <Link to="/dashboard" className="group flex min-w-0 items-center gap-3" onClick={() => setIsMobileOpen(false)}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#e5323a] to-primary-dark text-sm font-bold text-white shadow-glow transition-transform duration-300 ease-smooth group-hover:scale-105">
            H
          </span>
          <span
            className={cn(
              'min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-smooth',
              collapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[10rem] opacity-100',
            )}
          >
            <span className="block text-sm font-semibold tracking-tight text-white">HUMOVARE</span>
            <span className="block text-[0.6875rem] font-medium text-white/40">Admin portal</span>
          </span>
        </Link>
      </div>

      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <nav aria-label="Admin" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {groups.map((group) => (
          <div key={group.label || 'root'} className="mb-5 last:mb-0">
            {group.label && (
              <p
                className={cn(
                  'overflow-hidden whitespace-nowrap px-3 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-white/30 transition-all duration-300 ease-smooth',
                  collapsed ? 'lg:h-0 lg:pb-0 lg:opacity-0' : 'h-4 pb-2',
                )}
              >
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={() => setIsMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'nav-item group',
                        isActive
                          ? 'bg-white/[0.08] text-white shadow-inset'
                          : 'text-white/55 hover:bg-white/[0.05] hover:text-white',
                        collapsed && 'lg:justify-center lg:gap-0 lg:px-0',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn(
                            'h-[1.125rem] w-[1.125rem] shrink-0 transition-all duration-200 ease-smooth',
                            isActive ? 'text-red-400' : 'group-hover:scale-110',
                          )}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span
                          className={cn(
                            'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-smooth',
                            collapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[12rem] opacity-100',
                          )}
                        >
                          {item.label}
                        </span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 p-3">
        <a
          href={SITE_URL}
          target="_blank"
          rel="noreferrer noopener"
          title={collapsed ? 'View storefront' : undefined}
          className={cn(
            'nav-item group border border-white/[0.06] bg-white/[0.03] text-white/60 hover:border-white/10 hover:bg-white/[0.07] hover:text-white',
            collapsed && 'lg:justify-center lg:gap-0 lg:px-0',
          )}
        >
          <ExternalLink className="h-[1.125rem] w-[1.125rem] shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
          <span
            className={cn(
              'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-smooth',
              collapsed ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[12rem] opacity-100',
            )}
          >
            View storefront
          </span>
        </a>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop rail */}
      <aside
        className={cn(
          'hidden shrink-0 transition-[width] duration-300 ease-smooth lg:block',
          isCollapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-30 transition-[width] duration-300 ease-smooth',
            isCollapsed ? 'w-[4.5rem]' : 'w-64',
          )}
        >
          {renderSidebar(isCollapsed)}
        </div>
      </aside>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-ink/50 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-64 animate-slide-in-left shadow-popover">
            {renderSidebar(false)}
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line/70 bg-panel/70 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              aria-label="Open menu"
              className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-ink/[0.05] hover:text-ink lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden rounded-lg p-2 text-ink-muted transition-colors hover:bg-ink/[0.05] hover:text-ink lg:block"
            >
              <PanelLeftClose
                className={cn('h-[1.125rem] w-[1.125rem] transition-transform duration-300 ease-smooth', isCollapsed && 'rotate-180')}
                aria-hidden="true"
              />
            </button>

            {current && (
              <div key={current.to} className="ml-1 flex min-w-0 animate-fade-in items-center gap-2 text-sm">
                {current.group && <span className="hidden text-ink-subtle sm:inline">{current.group}</span>}
                {current.group && <span className="hidden text-ink-subtle/60 sm:inline" aria-hidden="true">/</span>}
                <current.icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate font-semibold text-ink">{current.label}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 sm:pr-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-ink to-ink/70 text-xs font-semibold text-white ring-2 ring-panel">
                {initialsOf(user?.name)}
              </span>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-semibold leading-tight text-ink">{user?.name}</p>
                <p className="text-[0.6875rem] leading-tight text-ink-subtle">
                  {user ? (ROLE_LABELS[user.role] ?? user.role) : ''}
                </p>
              </div>
            </div>
            <div className="h-6 w-px bg-line" aria-hidden="true" />
            <Link
              to="/account/password"
              title="Change password"
              className="inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-sm text-ink-muted transition-colors hover:bg-ink/[0.05] hover:text-ink"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Change password</span>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        {/* A seeded or reset password is a shared secret until it is replaced. */}
        {user?.mustChangePassword && (
          <div className="flex animate-fade-in items-center gap-2 border-b border-warning/20 bg-gradient-to-r from-warning/10 to-warning/5 px-4 py-2.5 text-xs text-warning sm:px-6">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Your password was set by someone else.</span>
            <Link to="/account/password" className="font-semibold underline underline-offset-2 hover:no-underline">
              Change it now
            </Link>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* Keyed by path, so every navigation plays the page-in transition. */}
          <div key={location.pathname} className="mx-auto w-full max-w-[1600px] animate-page-in">
            <Outlet />
          </div>
        </main>
      </div>

      <ToastViewport />
      {/* Signs out after inactivity, with a warning first. */}
      <IdleLogout />
    </div>
  );
}

export default AdminLayout;
