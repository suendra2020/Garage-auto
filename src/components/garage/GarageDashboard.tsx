import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Car,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  MessageSquare,
  RefreshCw,
  Send,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { DashboardDateFilter, DashboardDatePeriod } from '../../types/garage';
import {
  buildDashboardTrendSeries,
  computeGarageDashboardStats,
  createDefaultDateFilter,
} from '../../utils/dashboardStats';
import { EmptyState } from '../common/EmptyState';
import { HonestIntegrationNotice } from '../common/HonestIntegrationNotice';
import { StatCard } from '../common/StatCard';

function formatFilterSummary(filter: DashboardDateFilter): string {
  if (filter.period === 'all') {
    return 'All-time garage records';
  }
  if (filter.period === 'daily' && filter.selectedDate) {
    const [y, m, d] = filter.selectedDate.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return `Daily · ${dt.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })}`;
  }
  if (filter.period === 'monthly' && filter.selectedMonth) {
    const [y, m] = filter.selectedMonth.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, 1);
    return `Monthly · ${dt.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
    })}`;
  }
  return 'Filtered period';
}

function getWhatsAppStatusLabel(status: string): {
  label: string;
  toneClass: string;
} {
  switch (status) {
    case 'delivered':
    case 'read':
      return { label: 'Delivered', toneClass: 'text-emerald-700' };
    case 'sent':
      return { label: 'Sent', toneClass: 'text-navy-900' };
    case 'failed':
      return { label: 'Failed', toneClass: 'text-red-600' };
    case 'queued':
      return { label: 'Queued', toneClass: 'text-amber-700' };
    default:
      return { label: 'Draft Only', toneClass: 'text-amber-700' };
  }
}

export function GarageDashboard() {
  const {
    activeTenant,
    supabaseConfigured,
    dashboardLoading,
    dashboardError,
    refreshGarageDashboard,
    tenantJobCards,
    tenantImportBatches,
    tenantWhatsAppLogs,
    setGaragePage,
  } = useAppState();

  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>(() =>
    createDefaultDateFilter(),
  );

  const stats = useMemo(
    () =>
      computeGarageDashboardStats({
        tenantId: activeTenant?.id,
        jobCards: tenantJobCards,
        importBatches: tenantImportBatches,
        whatsappLogs: tenantWhatsAppLogs,
        filter: dateFilter,
      }),
    [activeTenant?.id, tenantJobCards, tenantImportBatches, tenantWhatsAppLogs, dateFilter],
  );

  const trendSeries = useMemo(
    () =>
      buildDashboardTrendSeries({
        tenantId: activeTenant?.id,
        jobCards: tenantJobCards,
        whatsappLogs: tenantWhatsAppLogs,
        filter: dateFilter,
      }),
    [activeTenant?.id, tenantJobCards, tenantWhatsAppLogs, dateFilter],
  );

  if (!activeTenant) return null;

  const setPeriod = (period: DashboardDatePeriod) => {
    setDateFilter((prev) => ({ ...prev, period }));
  };

  const maxTrendValue = Math.max(
    1,
    ...trendSeries.map((b) => Math.max(b.deliveredCount, b.whatsappSentCount)),
  );
  const hasTrendActivity = trendSeries.some(
    (b) => b.deliveredCount > 0 || b.whatsappSentCount > 0,
  );

  const pipelineTotal = stats.totalImportedJobCards;
  const pendingPct =
    pipelineTotal > 0 ? Math.round((stats.pendingJobCards / pipelineTotal) * 100) : 0;
  const inProgressPct =
    pipelineTotal > 0 ? Math.round((stats.inProgressJobCards / pipelineTotal) * 100) : 0;
  const deliveredPct =
    pipelineTotal > 0 ? Math.max(0, 100 - pendingPct - inProgressPct) : 0;

  return (
    <div className="space-y-5">
      {/* Garage Identity & Quick Actions Header */}
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-emerald-700">
            Authenticated Garage · {activeTenant.branding.city || 'Active Workspace'}
          </p>
          <h2 className="font-display mt-0.5 truncate text-xl font-bold text-slate-900 sm:text-2xl">
            {activeTenant.branding.displayName}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {supabaseConfigured
              ? 'Live statistics queried exclusively for your authenticated garage.'
              : 'Local preview workspace — statistics computed from your current garage records.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {supabaseConfigured && (
            <button
              type="button"
              onClick={() => void refreshGarageDashboard()}
              disabled={dashboardLoading}
              aria-label="Refresh live statistics"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw
                className={`h-4 w-4 ${dashboardLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{dashboardLoading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setGaragePage('import-excel')}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            <span>Quick Import Excel</span>
          </button>
          <button
            type="button"
            onClick={() => setGaragePage('delivered-vehicles')}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Car className="h-4 w-4" aria-hidden="true" />
            <span>View Delivered Vehicles</span>
          </button>
        </div>
      </section>

      {dashboardError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <span>Unable to load live garage records: {dashboardError}</span>
        </div>
      )}

      <HonestIntegrationNotice
        scope="garage"
        onConfigure={() => setGaragePage('garage-settings')}
      />

      {/* Daily & Monthly Date Filter Bar */}
      <section
        aria-label="Dashboard date filters"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Date range period"
            className="inline-flex rounded-xl bg-slate-100 p-1"
          >
            {(
              [
                { id: 'daily', label: 'Daily' },
                { id: 'monthly', label: 'Monthly' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  dateFilter.period === opt.id
                    ? 'bg-white text-navy-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {dateFilter.period === 'daily' && (
            <div className="flex items-center gap-2">
              <label htmlFor="dash-daily-picker" className="sr-only">
                Select date
              </label>
              <Calendar className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <input
                id="dash-daily-picker"
                type="date"
                value={dateFilter.selectedDate}
                onChange={(e) =>
                  setDateFilter((prev) => ({ ...prev, selectedDate: e.target.value }))
                }
                className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 tabular-nums"
              />
            </div>
          )}

          {dateFilter.period === 'monthly' && (
            <div className="flex items-center gap-2">
              <label htmlFor="dash-month-picker" className="sr-only">
                Select month
              </label>
              <Calendar className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <input
                id="dash-month-picker"
                type="month"
                value={dateFilter.selectedMonth}
                onChange={(e) =>
                  setDateFilter((prev) => ({ ...prev, selectedMonth: e.target.value }))
                }
                className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 tabular-nums"
              />
            </div>
          )}
        </div>

        <p className="text-xs font-medium text-slate-500 tabular-nums">
          {formatFilterSummary(dateFilter)}
        </p>
      </section>

      {/* 7 Live Statistics Cards */}
      <section aria-label="Job card statistics">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard
            label="Total Imported Job Cards"
            value={stats.totalImportedJobCards}
            helperText={`${stats.recentImports.length} Excel ${stats.recentImports.length === 1 ? 'import' : 'imports'} in period`}
            icon={ClipboardList}
          />
          <StatCard
            label="Pending Job Cards"
            value={stats.pendingJobCards}
            helperText="Open or awaiting work"
            icon={Clock}
            tone={stats.pendingJobCards > 0 ? 'warning' : 'neutral'}
          />
          <StatCard
            label="In-Progress Job Cards"
            value={stats.inProgressJobCards}
            helperText="Servicing, QC, or ready"
            icon={Wrench}
          />
          <StatCard
            label="Delivered Vehicles"
            value={stats.deliveredVehicles}
            helperText="Completed & handed over"
            icon={Car}
            tone={stats.deliveredVehicles > 0 ? 'success' : 'neutral'}
          />
        </div>
      </section>

      <section aria-label="WhatsApp messaging statistics">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard
            label="WhatsApp Messages Sent"
            value={stats.whatsappMessagesSent}
            helperText={
              stats.whatsappDraftsPrepared > 0
                ? `${stats.whatsappDraftsPrepared} unsent draft(s) prepared`
                : 'Dispatched via WhatsApp API'
            }
            icon={Send}
          />
          <StatCard
            label="WhatsApp Messages Delivered"
            value={stats.whatsappMessagesDelivered}
            helperText="Confirmed delivered or read"
            icon={CheckCheck}
            tone={stats.whatsappMessagesDelivered > 0 ? 'success' : 'neutral'}
          />
          <StatCard
            label="WhatsApp Messages Failed"
            value={stats.whatsappMessagesFailed}
            helperText="Requires mobile check or retry"
            icon={XCircle}
            tone={stats.whatsappMessagesFailed > 0 ? 'danger' : 'neutral'}
          />
        </div>
      </section>

      {/* Garage-Wide Empty State when no records exist yet */}
      {!stats.hasAnyRecordsInGarage && (
        <EmptyState
          icon={FileSpreadsheet}
          title="No job cards or WhatsApp activity in this garage yet"
          description="Import your existing Excel (.xlsx, .xls) or CSV job card sheet to populate live job card counts, track delivered vehicles, and prepare WhatsApp delivery notifications."
          actionLabel="Import Excel File"
          onAction={() => setGaragePage('import-excel')}
          secondaryLabel="Manage Message Templates"
          onSecondaryAction={() => setGaragePage('message-templates')}
        />
      )}

      {/* Simple Useful Charts (Rendered only when garage has records) */}
      {stats.hasAnyRecordsInGarage && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Job Card Stage Breakdown */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-5">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Job Card Pipeline
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Distribution for {formatFilterSummary(dateFilter).toLowerCase()}
            </p>

            {pipelineTotal === 0 ? (
              <p className="mt-6 text-sm text-slate-500">
                No job cards match the selected date filter.
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                <div
                  className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label={`Pipeline: ${pendingPct}% pending, ${inProgressPct}% in progress, ${deliveredPct}% delivered`}
                >
                  {pendingPct > 0 && (
                    <div
                      className="bg-amber-500"
                      style={{ width: `${pendingPct}%` }}
                    />
                  )}
                  {inProgressPct > 0 && (
                    <div
                      className="bg-navy-900"
                      style={{ width: `${inProgressPct}%` }}
                    />
                  )}
                  {deliveredPct > 0 && (
                    <div
                      className="bg-emerald-600"
                      style={{ width: `${deliveredPct}%` }}
                    />
                  )}
                </div>

                <ul className="divide-y divide-slate-100 text-sm">
                  <li className="flex items-center justify-between py-2.5">
                    <span className="text-slate-700">Pending</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {stats.pendingJobCards} ({pendingPct}%)
                    </span>
                  </li>
                  <li className="flex items-center justify-between py-2.5">
                    <span className="text-slate-700">In Progress</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {stats.inProgressJobCards} ({inProgressPct}%)
                    </span>
                  </li>
                  <li className="flex items-center justify-between py-2.5">
                    <span className="font-medium text-emerald-700">Delivered</span>
                    <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                      {stats.deliveredVehicles} ({deliveredPct}%)
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </section>

          {/* Simple Activity Trend SVG Bar Chart */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-7">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {dateFilter.period === 'monthly'
                    ? 'Monthly Deliveries & WhatsApp Trend'
                    : '7-Day Deliveries & WhatsApp Trend'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Delivered vehicles vs. sent WhatsApp messages
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" aria-hidden="true" />
                  Delivered
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-navy-900" aria-hidden="true" />
                  WhatsApp Sent
                </span>
              </div>
            </div>

            {!hasTrendActivity ? (
              <p className="mt-8 text-sm text-slate-500">
                No delivered vehicles or sent WhatsApp messages recorded in this trend window yet.
              </p>
            ) : (
              <div className="mt-4">
                <svg
                  viewBox={`0 0 ${trendSeries.length * 64} 150`}
                  className="h-44 w-full"
                  role="img"
                  aria-label="Deliveries and WhatsApp messages sent trend chart"
                >
                  {[0, 0.5, 1].map((frac) => {
                    const y = 116 - frac * 92;
                    const tickVal = Math.round(maxTrendValue * frac);
                    return (
                      <g key={frac}>
                        <line
                          x1={24}
                          x2={trendSeries.length * 64 - 8}
                          y1={y}
                          y2={y}
                          stroke="#E2E8F0"
                          strokeWidth="1"
                        />
                        <text
                          x={18}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-slate-400 text-[10px] tabular-nums"
                        >
                          {tickVal}
                        </text>
                      </g>
                    );
                  })}

                  {trendSeries.map((bucket, idx) => {
                    const groupX = 32 + idx * 62;
                    const delivH = (bucket.deliveredCount / maxTrendValue) * 92;
                    const waH = (bucket.whatsappSentCount / maxTrendValue) * 92;
                    return (
                      <g key={bucket.key}>
                        <rect
                          x={groupX}
                          y={116 - delivH}
                          width={16}
                          height={Math.max(delivH, bucket.deliveredCount > 0 ? 3 : 0)}
                          rx={3}
                          fill="#059669"
                        />
                        <rect
                          x={groupX + 20}
                          y={116 - waH}
                          width={16}
                          height={Math.max(waH, bucket.whatsappSentCount > 0 ? 3 : 0)}
                          rx={3}
                          fill="#0B192C"
                        />
                        <text
                          x={groupX + 18}
                          y={136}
                          textAnchor="middle"
                          className="fill-slate-600 text-[10px]"
                        >
                          {bucket.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Today's Delivered Vehicles */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Today&apos;s Delivered Vehicles ({stats.todaysDeliveredVehicles.length})
            </h3>
            <p className="text-xs text-slate-500">
              Vehicles marked Delivered today for {activeTenant.branding.displayName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGaragePage('delivered-vehicles')}
            className="min-h-[40px] self-start text-sm font-medium text-navy-900 hover:underline sm:self-auto"
          >
            View Delivered Vehicles
          </button>
        </div>

        {stats.todaysDeliveredVehicles.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            No vehicles have been marked Delivered today. Mark completed job cards as Delivered or
            import today&apos;s job card sheet.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Vehicle</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Job Card #</th>
                    <th className="px-5 py-3">Delivered At</th>
                    <th className="px-5 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {stats.todaysDeliveredVehicles.slice(0, 6).map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs font-semibold text-slate-900">
                          {v.vehicleRegistration}
                        </p>
                        <p className="text-xs text-slate-500">{v.vehicleModel}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{v.customerName}</p>
                        <p className="font-mono text-xs text-slate-500">
                          {v.phoneNumber || 'Phone missing'}
                        </p>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">
                        {v.jobCardNumber}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600 tabular-nums">
                        {v.deliveredAt
                          ? new Date(v.deliveredAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Today'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Delivered
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch Cards */}
            <ul className="divide-y divide-slate-200 md:hidden">
              {stats.todaysDeliveredVehicles.slice(0, 6).map((v) => (
                <li key={v.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold text-slate-900">
                        {v.vehicleRegistration}
                      </p>
                      <p className="text-xs text-slate-600">
                        {v.vehicleModel} · {v.customerName}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Delivered
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
                    <span className="font-mono">{v.jobCardNumber}</span>
                    <span>{v.phoneNumber || 'Phone missing'}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Recent Job Card Imports & Recent WhatsApp Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Job Card Imports */}
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Recent Job Card Imports
            </h3>
            <button
              type="button"
              onClick={() => setGaragePage('job-cards')}
              className="min-h-[36px] text-xs font-medium text-navy-900 hover:underline"
            >
              All Job Cards
            </button>
          </div>

          {stats.recentImports.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">
              No Excel or CSV imports recorded in this date range.
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {stats.recentImports.slice(0, 5).map((batch) => (
                <li key={batch.id} className="p-4 sm:px-5 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {batch.fileName}
                    </p>
                    <span className="shrink-0 font-mono text-xs font-medium text-emerald-700 tabular-nums">
                      {batch.importedCount ?? batch.totalRows} imported
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                    <span>{new Date(batch.importedAt).toLocaleString()}</span>
                    <span aria-hidden="true">·</span>
                    <span>{batch.skippedCount} skipped</span>
                    {batch.failedCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-red-600">{batch.failedCount} failed</span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent WhatsApp Activity */}
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Recent WhatsApp Activity
            </h3>
            <button
              type="button"
              onClick={() => setGaragePage('whatsapp-messages')}
              className="min-h-[36px] text-xs font-medium text-navy-900 hover:underline"
            >
              View Queue
            </button>
          </div>

          {stats.recentWhatsAppActivity.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">
              No WhatsApp messages or prepared drafts recorded in this date range.
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {stats.recentWhatsAppActivity.slice(0, 5).map((log) => {
                const badge = getWhatsAppStatusLabel(log.status);
                return (
                  <li key={log.id} className="p-4 sm:px-5 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {log.customerName}
                        </p>
                        <p className="truncate font-mono text-xs text-slate-500">
                          {log.phoneNumber}
                          {log.vehicleRegistration ? ` · ${log.vehicleRegistration}` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold ${badge.toneClass}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {log.templateName} · {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
