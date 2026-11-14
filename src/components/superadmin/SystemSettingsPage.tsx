import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, RotateCcw, Shield } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';

export function SystemSettingsPage() {
  const {
    supabaseConfigured,
    systemSettings,
    updateSystemSettings,
    resetLocalWorkspace,
  } = useAppState();

  const [platformName, setPlatformName] = useState(systemSettings.platformName);
  const [supabaseUrl, setSupabaseUrl] = useState(systemSettings.supabaseProjectUrl);
  const [enforceIsolation, setEnforceIsolation] = useState(
    systemSettings.enforceStrictTenantIsolation,
  );
  const [allowOnboarding, setAllowOnboarding] = useState(
    systemSettings.allowGarageSelfOnboarding,
  );
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSystemSettings({
      ...systemSettings,
      platformName: platformName.trim() || 'GARAGE-CONNECT-APP',
      supabaseProjectUrl: supabaseUrl.trim(),
      enforceStrictTenantIsolation: enforceIsolation,
      allowGarageSelfOnboarding: allowOnboarding,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-navy-900" aria-hidden="true" />
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Platform Governance &amp; Multi-Tenant Rules
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Configure platform identity, tenant isolation guardrails, and backend connection targets.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sys-name" className="block text-sm font-medium text-slate-700">
                Platform Display Name
              </label>
              <input
                id="sys-name"
                type="text"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="sys-supabase-url" className="block text-sm font-medium text-slate-700">
                Supabase Project URL (Pending Connection)
              </label>
              <input
                id="sys-supabase-url"
                type="url"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <label className="flex min-h-[44px] items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Enforce Strict Tenant Isolation (RLS &amp; Scope Guard)
                </p>
                <p className="text-xs text-slate-500">
                  Prevents any garage session from querying or mutating another garage&apos;s records.
                </p>
              </div>
              <input
                type="checkbox"
                checked={enforceIsolation}
                onChange={(e) => setEnforceIsolation(e.target.checked)}
                className="h-5 w-5 accent-navy-900"
              />
            </label>

            <label className="flex min-h-[44px] items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Allow Garage Self-Onboarding on Login Screen
                </p>
                <p className="text-xs text-slate-500">
                  Allows new garages to create isolated workspaces from the portal sign-in page.
                </p>
              </div>
              <input
                type="checkbox"
                checked={allowOnboarding}
                onChange={(e) => setAllowOnboarding(e.target.checked)}
                className="h-5 w-5 accent-navy-900"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-sm">
              {savedNotice && (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Settings saved to local preview state
                </span>
              )}
            </div>
            <button
              type="submit"
              className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
            >
              Save System Settings
            </button>
          </div>
        </form>
      </section>

      {/* Honest Integration Checklist */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Required Backend Connections (Not Yet Active)
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          This frontend preview does not simulate live Supabase or WhatsApp delivery. Connect the
          following services before production rollout:
        </p>

        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {[
            {
              name: 'Supabase PostgreSQL + Row-Level Security (RLS)',
              detail: 'Multi-tenant tables in supabase/migrations/0001_initial_schema.sql & 0002_rls_policies.sql.',
              connected: supabaseConfigured,
            },
            {
              name: 'Supabase Authentication',
              detail: 'JWT-backed Super Admin, Garage Admin, and Staff sessions via VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY.',
              connected: supabaseConfigured,
            },
            {
              name: 'Supabase Edge Functions',
              detail: 'Required for server-side WhatsApp Cloud API dispatch and webhook signature checks.',
              connected: false,
            },
            {
              name: 'Meta WhatsApp Cloud API',
              detail: 'Required per garage WABA ID & Phone Number ID to send live delivery messages.',
              connected: false,
            },
          ].map((item) => (
            <li key={item.name} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">{item.detail}</p>
              </div>
              {item.connected ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Env Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  Not Connected
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={resetLocalWorkspace}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Reset Local Preview Workspace</span>
          </button>
        </div>
      </section>
    </div>
  );
}
