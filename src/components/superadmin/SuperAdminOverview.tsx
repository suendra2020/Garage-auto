import React from 'react';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Database,
  FileSpreadsheet,
  Users,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { EmptyState } from '../common/EmptyState';
import { HonestIntegrationNotice } from '../common/HonestIntegrationNotice';
import { StatCard } from '../common/StatCard';

export function SuperAdminOverview() {
  const {
    supabaseConfigured,
    tenants,
    users,
    allImportBatches,
    allJobCardsCount,
    plans,
    setSuperAdminPage,
    openTenantWorkspaceAsPreview,
  } = useAppState();

  const activeGaragesCount = tenants.filter((t) => t.status === 'active').length;

  return (
    <div className="space-y-6">
      <HonestIntegrationNotice
        scope="platform"
        onConfigure={() => setSuperAdminPage('system-settings')}
      />

      {/* 4 KPI Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Registered Garages"
          value={tenants.length}
          helperText={`${activeGaragesCount} active tenant workspaces`}
          icon={Building2}
          tone={tenants.length > 0 ? 'success' : 'neutral'}
        />
        <StatCard
          label="Platform & Garage Users"
          value={users.length}
          helperText="Across Super Admin & Garage roles"
          icon={Users}
        />
        <StatCard
          label="Imported Job Card Rows"
          value={allJobCardsCount}
          helperText={`${allImportBatches.length} Excel batches uploaded`}
          icon={FileSpreadsheet}
        />
        <StatCard
          label="Subscription Tiers"
          value={plans.length}
          helperText="Configured SaaS billing plans"
          icon={CreditCard}
        />
      </div>

      {/* Main Content Split: Tenant Summary + Backend Architecture Readiness */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Registered Garage Tenants
            </h2>
            <button
              type="button"
              onClick={() => setSuperAdminPage('registered-garages')}
              className="min-h-[40px] text-sm font-medium text-navy-900 hover:underline whitespace-nowrap"
            >
              View All Garages
            </button>
          </div>

          {tenants.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No garages registered yet"
              description="Register your first automobile garage tenant to provision an isolated workspace with separate job cards, branding, and WhatsApp settings."
              actionLabel="Register First Garage"
              onAction={() => setSuperAdminPage('registered-garages')}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-200">
                {tenants.slice(0, 5).map((tenant) => {
                  const plan = plans.find((p) => p.id === tenant.planId);
                  return (
                    <li
                      key={tenant.id}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {tenant.branding.displayName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{tenant.branding.city}</span>
                          <span aria-hidden="true">·</span>
                          <span>{plan?.name ?? 'Starter Bay'}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              tenant.status === 'active'
                                ? 'font-medium text-emerald-700'
                                : 'font-medium text-amber-700'
                            }
                          >
                            {tenant.status === 'active'
                              ? 'Active'
                              : tenant.status === 'pending'
                                ? 'Pending'
                                : 'Suspended'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openTenantWorkspaceAsPreview(tenant.id)}
                        className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Open Workspace
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Platform Infrastructure Status
            </h2>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <ul className="divide-y divide-slate-100 text-sm">
              <li className="flex items-center justify-between py-3 first:pt-0">
                <span className="text-slate-700">Frontend Multi-Tenant UI</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Ready
                </span>
              </li>
              <li className="flex items-center justify-between py-3">
                <span className="text-slate-700">Supabase PostgreSQL &amp; RLS</span>
                <span
                  className={`inline-flex items-center gap-1.5 font-medium ${
                    supabaseConfigured ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  <Database className="h-4 w-4" aria-hidden="true" />
                  {supabaseConfigured ? 'Env Configured' : 'Not Connected'}
                </span>
              </li>
              <li className="flex items-center justify-between py-3">
                <span className="text-slate-700">Supabase Authentication</span>
                <span
                  className={`font-medium ${
                    supabaseConfigured ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {supabaseConfigured ? 'Env Configured' : 'Not Connected'}
                </span>
              </li>
              <li className="flex items-center justify-between py-3">
                <span className="text-slate-700">Supabase Edge Functions</span>
                <span className="font-medium text-amber-700">Not Connected</span>
              </li>
              <li className="flex items-center justify-between py-3 last:pb-0">
                <span className="text-slate-700">WhatsApp Cloud API</span>
                <span className="font-medium text-amber-700">Not Connected</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setSuperAdminPage('system-settings')}
              className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              Configure System Settings
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
