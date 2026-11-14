import React, { useState } from 'react';
import {
  BarChart3,
  Building2,
  Car,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { GaragePage, SuperAdminPage } from '../../types/garage';

interface NavItem<T extends string> {
  id: T;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

const SUPER_ADMIN_NAV: NavItem<SuperAdminPage>[] = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
  { id: 'registered-garages', label: 'Registered Garages', shortLabel: 'Garages', icon: Building2 },
  { id: 'users', label: 'Users', shortLabel: 'Users', icon: Users },
  { id: 'subscription-plans', label: 'Subscription Plans', shortLabel: 'Plans', icon: CreditCard },
  { id: 'system-settings', label: 'System Settings', shortLabel: 'Settings', icon: Settings },
];

const GARAGE_NAV: NavItem<GaragePage>[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { id: 'import-excel', label: 'Import Excel', shortLabel: 'Import', icon: FileSpreadsheet },
  { id: 'job-cards', label: 'Job Cards', shortLabel: 'Job Cards', icon: ClipboardList },
  { id: 'delivered-vehicles', label: 'Delivered Vehicles', shortLabel: 'Delivered', icon: Car },
  { id: 'whatsapp-messages', label: 'WhatsApp Messages', shortLabel: 'WhatsApp', icon: MessageSquare },
  { id: 'message-templates', label: 'Message Templates', shortLabel: 'Templates', icon: FileText },
  { id: 'review-social-links', label: 'Google Review & Social Links', shortLabel: 'Reviews', icon: Link2 },
  { id: 'reports', label: 'Reports', shortLabel: 'Reports', icon: BarChart3 },
  { id: 'garage-settings', label: 'Garage Settings', shortLabel: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    session,
    activeTenant,
    authorizedTenants,
    switchActiveGarage,
    superAdminPage,
    garagePage,
    setSuperAdminPage,
    setGaragePage,
    logout,
  } = useAppState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!session) return null;

  const isSuperAdmin = session.role === 'super_admin';
  const navItems = isSuperAdmin ? SUPER_ADMIN_NAV : GARAGE_NAV;
  const activeId = isSuperAdmin ? superAdminPage : garagePage;
  const activeNav = navItems.find((n) => n.id === activeId) ?? navItems[0];
  const activePageTitle = activeId === 'profile' ? 'User Profile' : activeNav.label;

  const workspaceTitle = isSuperAdmin
    ? 'GARAGE-CONNECT-APP'
    : activeTenant?.branding.displayName ?? 'Garage Workspace';

  const workspaceSubtitle = isSuperAdmin
    ? 'Platform Super Admin'
    : activeTenant?.branding.city
      ? `${activeTenant.branding.city} · Isolated Tenant`
      : 'Isolated Garage Tenant';

  const handleSelectNav = (id: string) => {
    if (isSuperAdmin) {
      setSuperAdminPage(id as SuperAdminPage);
    } else {
      setGaragePage(id as GaragePage);
    }
    setDrawerOpen(false);
  };

  const quickBottomItems = isSuperAdmin
    ? SUPER_ADMIN_NAV.slice(0, 4)
    : [GARAGE_NAV[0], GARAGE_NAV[1], GARAGE_NAV[3], GARAGE_NAV[4]];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      {/* Desktop Dark Navy Sidebar */}
      <aside
        aria-label="Primary navigation"
        className="hidden lg:flex lg:w-[272px] lg:shrink-0 lg:flex-col lg:bg-navy-900 lg:text-white lg:sticky lg:top-0 lg:h-screen"
      >
        <div className="border-b border-navy-700/80 px-5 py-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              {isSuperAdmin ? (
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Car className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-display truncate text-sm font-bold tracking-tight text-white">
                {workspaceTitle}
              </p>
              <p className="truncate text-xs text-slate-300">{workspaceSubtitle}</p>
            </div>
          </div>

          {/* Multi-Garage Workspace Switcher when user is authorized for 2+ garages */}
          {!isSuperAdmin && authorizedTenants.length > 1 && activeTenant && (
            <div>
              <label htmlFor="desktop-garage-switcher" className="sr-only">
                Switch authorized garage
              </label>
              <select
                id="desktop-garage-switcher"
                value={activeTenant.id}
                onChange={(e) => void switchActiveGarage(e.target.value)}
                className="min-h-[38px] w-full rounded-xl border border-navy-700 bg-navy-800 px-3 text-xs font-medium text-white focus:outline-none"
              >
                {authorizedTenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.branding.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectNav(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-navy-700 text-white'
                        : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-navy-700/80 p-4 space-y-2">
          <button
            type="button"
            onClick={() => handleSelectNav('profile')}
            aria-current={activeId === 'profile' ? 'page' : undefined}
            className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors ${
              activeId === 'profile'
                ? 'bg-navy-700 text-white'
                : 'bg-navy-800/80 text-white hover:bg-navy-800'
            }`}
          >
            <User className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{session.fullName}</p>
              <p className="truncate text-xs text-slate-300">
                {session.role === 'super_admin'
                  ? 'Platform Super Admin'
                  : session.role === 'garage_admin'
                    ? 'Garage Admin'
                    : 'Garage Staff'}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-navy-700 bg-navy-950/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-navy-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Slide-Out Navy Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 flex w-[288px] max-w-[85vw] flex-col bg-navy-900 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-navy-700 px-4 py-4">
              <div className="min-w-0">
                <p className="font-display truncate text-sm font-bold text-white">
                  {workspaceTitle}
                </p>
                <p className="truncate text-xs text-slate-300">{workspaceSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation menu"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-300 hover:bg-navy-800 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {!isSuperAdmin && authorizedTenants.length > 1 && activeTenant && (
              <div className="border-b border-navy-700 px-4 py-3">
                <label htmlFor="mobile-garage-switcher" className="block text-[11px] text-slate-300 mb-1">
                  Active Garage
                </label>
                <select
                  id="mobile-garage-switcher"
                  value={activeTenant.id}
                  onChange={(e) => {
                    void switchActiveGarage(e.target.value);
                    setDrawerOpen(false);
                  }}
                  className="min-h-[42px] w-full rounded-xl border border-navy-700 bg-navy-800 px-3 text-sm text-white"
                >
                  {authorizedTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.branding.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <ul className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.id === activeId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectNav(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex min-h-[46px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-navy-700 text-white'
                            : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t border-navy-700 p-4 space-y-2">
              <button
                type="button"
                onClick={() => handleSelectNav('profile')}
                className={`flex min-h-[46px] w-full items-center gap-3 rounded-xl px-3.5 py-2 text-left transition-colors ${
                  activeId === 'profile'
                    ? 'bg-navy-700 text-white'
                    : 'bg-navy-800/80 text-white hover:bg-navy-800'
                }`}
              >
                <User className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{session.fullName}</p>
                  <p className="truncate text-xs text-slate-300">My Profile &amp; Security</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  void logout();
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-navy-700 bg-navy-950/60 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Dark Navy Top Bar (52px) */}
        <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between bg-navy-900 px-3 text-white lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-white hover:bg-navy-800"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <p className="font-display truncate px-2 text-sm font-semibold text-white">
            {activePageTitle}
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Sign out"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-200 hover:bg-navy-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* Desktop White Top Bar */}
        <header className="hidden h-16 items-center justify-between gap-8 border-b border-slate-200 bg-white px-8 lg:flex">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="font-display truncate text-lg font-semibold text-slate-900">
              {activePageTitle}
            </h1>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="truncate text-sm text-slate-500">
              {isSuperAdmin
                ? 'Platform Governance'
                : `${activeTenant?.branding.displayName ?? 'Garage'} · Tenant Isolated`}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            {!isSuperAdmin && activeTenant && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Tenant Scope Active</span>
              </div>
            )}
            {!isSuperAdmin && garagePage !== 'import-excel' && (
              <button
                type="button"
                onClick={() => setGaragePage('import-excel')}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800 whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                <span>Import Excel</span>
              </button>
            )}
            {isSuperAdmin && superAdminPage !== 'registered-garages' && (
              <button
                type="button"
                onClick={() => setSuperAdminPage('registered-garages')}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800 whitespace-nowrap shrink-0"
              >
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <span>Manage Garages</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Workspace Body */}
        <main className="flex-1 px-4 py-5 pb-20 sm:px-6 lg:px-8 lg:py-7 lg:pb-10">
          <div className="mx-auto max-w-6xl space-y-6">{children}</div>
        </main>

        {/* Mobile Bottom Thumb Navigation */}
        <nav
          aria-label="Mobile quick navigation"
          className="fixed bottom-0 left-0 right-0 z-30 grid h-[56px] grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-sm lg:hidden"
        >
          {quickBottomItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-navy-900' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-5 w-5 ${isActive ? 'text-emerald-600' : 'text-slate-500'}`}
                  aria-hidden="true"
                />
                <span className="truncate max-w-full">{item.shortLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-slate-500 hover:text-slate-900"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
