import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';

interface HonestIntegrationNoticeProps {
  scope: 'platform' | 'garage';
  onConfigure?: () => void;
}

export function HonestIntegrationNotice({
  scope,
  onConfigure,
}: HonestIntegrationNoticeProps) {
  const { supabaseConfigured } = useAppState();

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        {supabaseConfigured ? (
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
            aria-hidden="true"
          />
        ) : (
          <AlertCircle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
            aria-hidden="true"
          />
        )}
        <div className="text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            {supabaseConfigured
              ? 'Supabase Auth & PostgreSQL Connected · WhatsApp Cloud API Pending'
              : scope === 'platform'
                ? 'Supabase Environment Not Configured (Local Preview Mode)'
                : 'Supabase & WhatsApp Cloud API Not Connected Yet'}
          </p>
          <p className="mt-0.5 text-slate-600">
            {supabaseConfigured
              ? 'Database queries and Row-Level Security are active against your Supabase project. Live WhatsApp sending remains disabled until Edge Functions are connected.'
              : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment and run the SQL migrations in supabase/migrations/ to connect live PostgreSQL and Auth.'}
          </p>
        </div>
      </div>
      {onConfigure && (
        <button
          type="button"
          onClick={onConfigure}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap"
        >
          {scope === 'platform' ? 'View System Settings' : 'Check Garage Settings'}
        </button>
      )}
    </div>
  );
}
