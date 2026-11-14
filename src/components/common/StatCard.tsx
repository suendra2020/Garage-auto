import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  helperText: string;
  icon: LucideIcon;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

export function StatCard({
  label,
  value,
  helperText,
  icon: Icon,
  tone = 'neutral',
}: StatCardProps) {
  const iconStyles =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-700'
        : tone === 'danger'
          ? 'bg-red-50 text-red-700'
          : 'bg-slate-100 text-navy-900';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2.5">
        <p className="text-xs font-medium text-slate-600 sm:text-sm">{label}</p>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${iconStyles}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-2.5 font-display text-2xl font-bold tracking-tight text-slate-900 tabular-nums sm:mt-3 sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{helperText}</p>
    </div>
  );
}
