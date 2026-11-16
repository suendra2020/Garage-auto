import React, { useMemo, useState } from 'react';
import {
  Ban,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  CheckSquare,
  MessageSquare,
  Search,
  Square,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { DashboardDateFilter } from '../../types/garage';
import { createDefaultDateFilter } from '../../utils/dashboardStats';
import {
  filterConfirmedDeliveredVehicles,
  type AnnotatedDeliveredVehicle,
} from '../../utils/jobCardDelivery';
import { EmptyState } from '../common/EmptyState';

function formatDeliveryDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DeliveredVehiclesPage() {
  const {
    activeTenant,
    tenantJobCards,
    tenantWhatsAppLogs,
    tenantTemplates,
    prepareWhatsAppDraftsForCards,
    setGaragePage,
  } = useAppState();

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>(() =>
    createDefaultDateFilter(),
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    tenantTemplates[0]?.id ?? '',
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState('');

  // All confirmed deliveries (before search/date filters) so empty-state check only passes when genuinely 0 confirmed
  const allConfirmedRows = useMemo(
    () =>
      filterConfirmedDeliveredVehicles(
        tenantJobCards,
        tenantWhatsAppLogs,
        activeTenant?.id,
        {
          search: '',
          dateFilter: createDefaultDateFilter(),
        },
      ),
    [tenantJobCards, tenantWhatsAppLogs, activeTenant?.id],
  );

  const filteredRows = useMemo(
    () =>
      filterConfirmedDeliveredVehicles(
        tenantJobCards,
        tenantWhatsAppLogs,
        activeTenant?.id,
        {
          search,
          dateFilter,
        },
      ),
    [tenantJobCards, tenantWhatsAppLogs, activeTenant?.id, search, dateFilter],
  );

  const eligibleFilteredRows = useMemo(
    () => filteredRows.filter((row) => row.eligibility.eligible),
    [filteredRows],
  );

  const eligibleIdSet = useMemo(
    () => new Set(eligibleFilteredRows.map((row) => row.card.id)),
    [eligibleFilteredRows],
  );

  const effectiveSelectedIds = useMemo(() => {
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (eligibleIdSet.has(id)) {
        next.add(id);
      }
    });
    return next;
  }, [selectedIds, eligibleIdSet]);

  if (allConfirmedRows.length === 0) {
    return (
      <EmptyState
        icon={Car}
        title="No confirmed vehicle deliveries yet"
        description="Only confirmed vehicle deliveries appear here. Open a job card to confirm handover and record delivery date & time."
        actionLabel="Review Job Cards"
        onAction={() => setGaragePage('job-cards')}
        secondaryLabel="Import Excel File"
        onSecondaryAction={() => setGaragePage('import-excel')}
      />
    );
  }

  const activeTemplateId = selectedTemplateId || tenantTemplates[0]?.id || '';

  const toggleCustomerSelection = (row: AnnotatedDeliveredVehicle) => {
    if (!row.eligibility.eligible) return;
    setSelectedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (eligibleIdSet.has(id)) next.add(id);
      });
      if (next.has(row.card.id)) {
        next.delete(row.card.id);
      } else {
        next.add(row.card.id);
      }
      return next;
    });
  };

  const handleSelectAllEligible = () => {
    setSelectedIds(new Set(eligibleFilteredRows.map((r) => r.card.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handlePrepareSelectedDrafts = () => {
    if (!activeTemplateId) {
      setGaragePage('message-templates');
      return;
    }
    const targetIds = Array.from(effectiveSelectedIds);
    if (targetIds.length === 0) return;

    const created = prepareWhatsAppDraftsForCards(targetIds, activeTemplateId);
    if (created.length > 0) {
      setFeedback(
        `Prepared ${created.length} WhatsApp outreach draft${created.length === 1 ? '' : 's'}. Live sending requires connecting WhatsApp Cloud API.`,
      );
      setSelectedIds(new Set());
    }
  };

  const handlePrepareSingleDraft = (row: AnnotatedDeliveredVehicle) => {
    if (!row.eligibility.eligible) return;
    if (!activeTemplateId) {
      setGaragePage('message-templates');
      return;
    }
    const created = prepareWhatsAppDraftsForCards([row.card.id], activeTemplateId);
    if (created.length > 0) {
      setFeedback(
        `Prepared WhatsApp draft for ${created[0].customerName} (${created[0].vehicleRegistration}). Live sending requires connecting WhatsApp Cloud API.`,
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.card.id);
        return next;
      });
    }
  };

  const selectedCount = effectiveSelectedIds.size;
  const eligibleCount = eligibleFilteredRows.length;
  const excludedCount = filteredRows.length - eligibleCount;

  return (
    <div className="space-y-5">
      {/* Search, Date Filter & Template Selector */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search confirmed deliveries"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, vehicle reg, or job card #..."
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span>Delivery Date:</span>
            </div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {(
                [
                  { id: 'all', label: 'All Dates' },
                  { id: 'daily', label: 'Daily' },
                  { id: 'monthly', label: 'Monthly' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setDateFilter((prev) => ({ ...prev, period: item.id }))
                  }
                  className={`min-h-[36px] rounded-lg px-3 text-xs font-medium whitespace-nowrap ${
                    dateFilter.period === item.id
                      ? 'bg-white text-navy-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {dateFilter.period === 'daily' && (
              <input
                type="date"
                aria-label="Filter deliveries by date"
                value={dateFilter.selectedDate}
                onChange={(e) =>
                  setDateFilter((prev) => ({ ...prev, selectedDate: e.target.value }))
                }
                className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 tabular-nums"
              />
            )}

            {dateFilter.period === 'monthly' && (
              <input
                type="month"
                aria-label="Filter deliveries by month"
                value={dateFilter.selectedMonth}
                onChange={(e) =>
                  setDateFilter((prev) => ({ ...prev, selectedMonth: e.target.value }))
                }
                className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 tabular-nums"
              />
            )}
          </div>
        </div>

        {/* Customer Selection & Outreach Toolbar */}
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAllEligible}
              disabled={eligibleCount === 0}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              <CheckSquare className="h-4 w-4 text-navy-900" aria-hidden="true" />
              <span>Select All Eligible ({eligibleCount})</span>
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              disabled={selectedCount === 0}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              <Square className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <span>Deselect All</span>
            </button>
            <span className="text-xs text-slate-600 tabular-nums">
              <strong className="font-semibold text-slate-900">{selectedCount}</strong> of{' '}
              {eligibleCount} eligible selected
              {excludedCount > 0 ? ` · ${excludedCount} excluded` : ''}
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {tenantTemplates.length === 0 ? (
              <button
                type="button"
                onClick={() => setGaragePage('message-templates')}
                className="min-h-[44px] rounded-xl border border-amber-300 bg-amber-50 px-3.5 text-xs font-medium text-amber-900 whitespace-nowrap"
              >
                Create Message Template First
              </button>
            ) : (
              <select
                id="deliv-tpl"
                aria-label="Active WhatsApp message template"
                value={activeTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                {tenantTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={handlePrepareSelectedDrafts}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-40 whitespace-nowrap"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>
                Prepare WhatsApp Drafts ({selectedCount})
              </span>
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setGaragePage('whatsapp-messages')}
            className="min-h-[40px] shrink-0 rounded-xl bg-emerald-700 px-3.5 text-xs font-medium text-white whitespace-nowrap"
          >
            Open WhatsApp Queue
          </button>
        </div>
      )}

      {filteredRows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No confirmed deliveries match your filters"
          description="Clear or adjust your customer search or delivery date filter."
          actionLabel="Clear Filters"
          onAction={() => {
            setSearch('');
            setDateFilter(createDefaultDateFilter());
          }}
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="w-12 px-4 py-3.5">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-4 py-3.5">Customer &amp; Mobile</th>
                    <th className="px-4 py-3.5">Vehicle</th>
                    <th className="px-4 py-3.5">Job Card #</th>
                    <th className="px-4 py-3.5">Confirmed Delivery</th>
                    <th className="px-4 py-3.5">Eligibility</th>
                    <th className="px-4 py-3.5 text-right">Outreach Draft</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRows.map((row) => {
                    const { card, eligibility } = row;
                    const isChecked = effectiveSelectedIds.has(card.id);
                    return (
                      <tr
                        key={card.id}
                        className={
                          !eligibility.eligible
                            ? 'bg-slate-50/60 text-slate-500'
                            : isChecked
                              ? 'bg-navy-900/[0.03]'
                              : 'hover:bg-slate-50/70'
                        }
                      >
                        <td className="px-4 py-3">
                          <label className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                            <input
                              type="checkbox"
                              aria-label={`Select ${card.customerName} (${card.vehicleRegistration})`}
                              checked={isChecked}
                              disabled={!eligibility.eligible}
                              onChange={() => toggleCustomerSelection(row)}
                              className="h-5 w-5 rounded border-slate-300 text-navy-900 focus:ring-navy-900 disabled:cursor-not-allowed disabled:opacity-40"
                            />
                          </label>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-slate-900">{card.customerName}</p>
                          <p className="font-mono text-xs text-slate-500 tabular-nums">
                            {card.phoneNumber || 'Phone missing'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-mono text-xs font-semibold text-slate-900">
                            {card.vehicleRegistration}
                          </p>
                          <p className="text-xs text-slate-500">
                            {[card.vehicleBrand, card.vehicleModel].filter(Boolean).join(' ') || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-700 tabular-nums">
                          {card.jobCardNumber}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 tabular-nums">
                            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{formatDeliveryDate(card.deliveredAt)}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          {eligibility.eligible ? (
                            <span className="font-medium text-emerald-700">Eligible</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-800">
                              <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>{eligibility.reason}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            disabled={!eligibility.eligible}
                            onClick={() => handlePrepareSingleDraft(row)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-navy-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-navy-800 disabled:bg-slate-200 disabled:text-slate-500 whitespace-nowrap"
                          >
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {!eligibility.eligible
                                ? 'Excluded'
                                : card.whatsappDispatchStatus === 'draft_prepared'
                                  ? 'Prepare Another'
                                  : 'Prepare Draft'}
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Customer Cards with Large Touch Checkboxes */}
          <ul className="space-y-3 md:hidden">
            {filteredRows.map((row) => {
              const { card, eligibility } = row;
              const isChecked = effectiveSelectedIds.has(card.id);
              return (
                <li
                  key={card.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    !eligibility.eligible
                      ? 'border-slate-200 bg-slate-50/80'
                      : isChecked
                        ? 'border-navy-900 bg-navy-900/[0.03]'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      aria-label={`Select ${card.customerName} (${card.vehicleRegistration})`}
                      disabled={!eligibility.eligible}
                      onClick={() => toggleCustomerSelection(row)}
                      className={`flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl border-2 ${
                        !eligibility.eligible
                          ? 'border-slate-200 bg-slate-100 text-transparent cursor-not-allowed'
                          : isChecked
                            ? 'border-navy-900 bg-navy-900 text-white'
                            : 'border-slate-400 bg-white text-transparent hover:border-navy-900'
                      }`}
                    >
                      <Check className="h-6 w-6" strokeWidth={2.75} aria-hidden="true" />
                    </button>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {card.customerName}
                          </p>
                          <p className="font-mono text-xs text-slate-600 tabular-nums">
                            {card.phoneNumber || 'Phone missing'}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums whitespace-nowrap">
                          {card.jobCardNumber}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700">
                        <span className="font-mono font-semibold text-slate-900">
                          {card.vehicleRegistration}
                        </span>{' '}
                        · {[card.vehicleBrand, card.vehicleModel].filter(Boolean).join(' ') || '—'}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 tabular-nums">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{formatDeliveryDate(card.deliveredAt)}</span>
                        </span>

                        {!eligibility.eligible && (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-800">
                            <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{eligibility.reason}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {eligibility.eligible && (
                    <button
                      type="button"
                      onClick={() => handlePrepareSingleDraft(row)}
                      className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
                    >
                      <MessageSquare className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {card.whatsappDispatchStatus === 'draft_prepared'
                          ? 'Prepare Another WhatsApp Draft'
                          : 'Prepare WhatsApp Draft'}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
