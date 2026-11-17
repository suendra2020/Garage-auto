import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  Eye,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { getSupabaseClient } from '../../lib/supabase';
import type { DashboardDateFilter, JobCard } from '../../types/garage';
import { createDefaultDateFilter } from '../../utils/dashboardStats';
import {
  filterConfirmedDeliveredVehicles,
  type AnnotatedDeliveredVehicle,
} from '../../utils/jobCardDelivery';
import { canManageGarageStaff } from '../../utils/tenantLogic';
import {
  buildMetaTemplateBodyParameters,
  formatWhatsAppLogStatusMeta,
  normalizeWhatsAppRecipientPhone,
  validateLiveDispatchPreconditions,
} from '../../utils/whatsappCloud';
import { EmptyState } from '../common/EmptyState';

function formatTimestamp(iso: string | null | undefined): string {
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

export function WhatsAppMessagesPage() {
  const {
    supabaseConfigured,
    session,
    activeTenant,
    tenantJobCards,
    tenantTemplates,
    tenantWhatsAppLogs,
    setGaragePage,
    testActiveWhatsAppConnection,
    sendLiveWhatsAppMessages,
    refreshActiveWhatsAppLogs,
  } = useAppState();

  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionFeedback, setConnectionFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>(() =>
    createDefaultDateFilter(),
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [dispatchError, setDispatchError] = useState('');
  const [dispatchResultBanner, setDispatchResultBanner] = useState<{
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    details: string[];
  } | null>(null);

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewCards, setPreviewCards] = useState<JobCard[]>([]);
  const [previewSkipped, setPreviewSkipped] = useState<
    Array<{ jobCardId: string; customerName: string; reason: string }>
  >([]);
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);

  const [refreshingLogs, setRefreshingLogs] = useState(false);

  // Realtime subscription to whatsapp_logs for this garage so Meta webhook status updates appear automatically
  useEffect(() => {
    if (!activeTenant?.id || !supabaseConfigured || session?.authMode !== 'supabase') {
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;

    const channel = client
      .channel(`wa_logs_${activeTenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_logs',
          filter: `garage_id=eq.${activeTenant.id}`,
        },
        () => {
          void refreshActiveWhatsAppLogs();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [activeTenant?.id, supabaseConfigured, session?.authMode]);

  const activeTemplate = useMemo(() => {
    if (selectedTemplateId) {
      const explicit = tenantTemplates.find((t) => t.id === selectedTemplateId);
      if (explicit) return explicit;
    }
    return (
      tenantTemplates.find((t) => t.approvalStatus === 'approved') ??
      tenantTemplates[0] ??
      null
    );
  }, [tenantTemplates, selectedTemplateId]);

  const filteredDeliveredRows = useMemo(
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

  const allConfirmedCount = useMemo(
    () =>
      filterConfirmedDeliveredVehicles(
        tenantJobCards,
        tenantWhatsAppLogs,
        activeTenant?.id,
        {
          search: '',
          dateFilter: createDefaultDateFilter(),
        },
      ).length,
    [tenantJobCards, tenantWhatsAppLogs, activeTenant?.id],
  );

  const eligibleFilteredRows = useMemo(
    () => filteredDeliveredRows.filter((r) => r.eligibility.eligible),
    [filteredDeliveredRows],
  );

  const eligibleIdSet = useMemo(
    () => new Set(eligibleFilteredRows.map((r) => r.card.id)),
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

  if (!activeTenant) return null;

  const isConnected = activeTenant.whatsappSettings.connectionStatus === 'connected';
  const hasIdsConfigured = Boolean(
    activeTenant.whatsappSettings.phoneNumberId.trim() &&
      activeTenant.whatsappSettings.wabaId.trim(),
  );
  const canManage = canManageGarageStaff(session, activeTenant.id);

  const handleTestConnection = async () => {
    setConnectionFeedback(null);
    setTestingConnection(true);
    try {
      const res = await testActiveWhatsAppConnection();
      if (res.connected) {
        setConnectionFeedback({
          ok: true,
          message: `Connected to Meta Cloud API${
            res.verifiedPhoneNumber ? ` · ${res.verifiedPhoneNumber}` : ''
          }${res.verifiedName ? ` (${res.verifiedName})` : ''}.`,
        });
      } else {
        setConnectionFeedback({
          ok: false,
          message: res.error || 'WhatsApp Cloud API connection test failed.',
        });
      }
    } catch (err) {
      setConnectionFeedback({
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : 'Unable to reach Supabase Edge Function for WhatsApp verification.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const toggleCustomerSelection = (row: AnnotatedDeliveredVehicle) => {
    if (!row.eligibility.eligible) return;
    setDispatchError('');
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
    setDispatchError('');
    setSelectedIds(new Set(eligibleFilteredRows.map((r) => r.card.id)));
  };

  const handleDeselectAll = () => {
    setDispatchError('');
    setSelectedIds(new Set());
  };

  const openPreviewModalForCards = (cardsToSend: JobCard[]) => {
    setDispatchError('');
    setDispatchResultBanner(null);

    const validation = validateLiveDispatchPreconditions({
      tenant: activeTenant,
      template: activeTemplate,
      selectedCards: cardsToSend,
      existingLogs: tenantWhatsAppLogs,
    });

    if (!validation.valid) {
      setDispatchError(validation.error);
      return;
    }

    setPreviewCards(validation.eligibleCards);
    setPreviewSkipped(validation.skippedReasons);
    setFinalConfirmed(false);
    setPreviewModalOpen(true);
  };

  const handleOpenPreviewSelected = () => {
    const chosenCards = eligibleFilteredRows
      .filter((r) => effectiveSelectedIds.has(r.card.id))
      .map((r) => r.card);
    openPreviewModalForCards(chosenCards);
  };

  const handleConfirmSendBatch = async () => {
    if (!activeTemplate || !finalConfirmed || previewCards.length === 0) return;
    setDispatchError('');
    setSendingBatch(true);
    try {
      const response = await sendLiveWhatsAppMessages({
        templateId: activeTemplate.id,
        jobCardIds: previewCards.map((c) => c.id),
      });
      const failedDetails = (response.results ?? [])
        .filter((r) => r.status === 'failed' && r.error)
        .map((r) => `${r.jobCardId}: ${r.error}`);

      setDispatchResultBanner({
        sentCount: response.sentCount,
        failedCount: response.failedCount,
        skippedCount: response.skippedCount,
        details: failedDetails,
      });
      setPreviewModalOpen(false);
      setPreviewCards([]);
      setFinalConfirmed(false);
      setSelectedIds(new Set());
    } catch (err) {
      setDispatchError(
        err instanceof Error
          ? err.message
          : 'Live WhatsApp dispatch failed before messages could be sent.',
      );
      setPreviewModalOpen(false);
    } finally {
      setSendingBatch(false);
    }
  };

  const handleRefreshLogs = async () => {
    setRefreshingLogs(true);
    try {
      await refreshActiveWhatsAppLogs();
    } finally {
      setRefreshingLogs(false);
    }
  };

  const selectedCount = effectiveSelectedIds.size;
  const eligibleCount = eligibleFilteredRows.length;
  const excludedCount = filteredDeliveredRows.length - eligibleCount;

  return (
    <div className="space-y-6">
      {/* 1. Honest WhatsApp Cloud API Status & Test Connection Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            {isConnected ? (
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                aria-hidden="true"
              />
            ) : (
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                aria-hidden="true"
              />
            )}
            <div className="space-y-1">
              <h2 className="font-display text-base font-semibold text-slate-900">
                WhatsApp Cloud API Status: {isConnected ? 'Connected' : 'Not Connected'}
              </h2>
              {isConnected ? (
                <p className="text-sm text-slate-600">
                  Verified with Meta Cloud API
                  {activeTenant.whatsappSettings.verifiedPhoneNumber
                    ? ` · ${activeTenant.whatsappSettings.verifiedPhoneNumber}`
                    : ''}
                  {activeTenant.whatsappSettings.verifiedName
                    ? ` (${activeTenant.whatsappSettings.verifiedName})`
                    : ''}
                  . Phone Number ID:{' '}
                  <span className="font-mono text-xs text-slate-800">
                    {activeTenant.whatsappSettings.phoneNumberId}
                  </span>{' '}
                  · WABA ID:{' '}
                  <span className="font-mono text-xs text-slate-800">
                    {activeTenant.whatsappSettings.wabaId}
                  </span>
                  {activeTenant.whatsappSettings.verifiedAt
                    ? ` · Verified ${formatTimestamp(activeTenant.whatsappSettings.verifiedAt)}`
                    : ''}
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  {hasIdsConfigured
                    ? `Phone Number ID (${activeTenant.whatsappSettings.phoneNumberId}) and WABA ID (${activeTenant.whatsappSettings.wabaId}) are saved for this garage. Run Test Connection to verify Supabase Edge Function and Meta Cloud API credentials before sending live messages.`
                    : 'Configure this garage’s Meta Phone Number ID and WABA Account ID in Garage Settings, then run Test Connection.'}
                </p>
              )}
              {!isConnected && activeTenant.whatsappSettings.lastTestError && !connectionFeedback && (
                <p className="text-xs font-medium text-red-700">
                  Last test error: {activeTenant.whatsappSettings.lastTestError}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canManage && (
              <button
                type="button"
                disabled={testingConnection || !hasIdsConfigured}
                onClick={() => void handleTestConnection()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-50 whitespace-nowrap"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>{testingConnection ? 'Testing Connection...' : 'Test Connection'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setGaragePage('garage-settings')}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span>Configure Settings</span>
            </button>
          </div>
        </div>

        {connectionFeedback && (
          <div
            role={connectionFeedback.ok ? 'status' : 'alert'}
            className={`rounded-xl border px-4 py-3 text-sm ${
              connectionFeedback.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {connectionFeedback.message}
          </div>
        )}
      </section>

      {/* 2. Delivered Customers Selection & Live WhatsApp Dispatch */}
      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Select Delivered Customers for WhatsApp Notification
            </h3>
            <p className="mt-0.5 text-sm text-slate-600">
              Select individual, multiple, or all eligible confirmed-delivered customers. You will preview every message before confirming dispatch.
            </p>
          </div>
        </div>

        {allConfirmedCount === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No confirmed delivered customers yet"
            description="Only confirmed deliveries for this garage are eligible for WhatsApp delivery notifications. Confirm vehicle handover on a Job Card first."
            actionLabel="Go to Job Cards"
            onAction={() => setGaragePage('job-cards')}
            secondaryLabel="Manage Message Templates"
            onSecondaryAction={() => setGaragePage('message-templates')}
          />
        ) : (
          <div className="space-y-4">
            {/* Search, Date Filter, Selection Toolbar & Template Picker */}
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative flex-1 lg:max-w-md">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label="Search delivered customers for WhatsApp"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search customer, mobile, vehicle #, or job card #..."
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <span>Delivered:</span>
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
                      aria-label="Filter WhatsApp recipients by delivery date"
                      value={dateFilter.selectedDate}
                      onChange={(e) =>
                        setDateFilter((prev) => ({
                          ...prev,
                          selectedDate: e.target.value,
                        }))
                      }
                      className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 tabular-nums"
                    />
                  )}

                  {dateFilter.period === 'monthly' && (
                    <input
                      type="month"
                      aria-label="Filter WhatsApp recipients by delivery month"
                      value={dateFilter.selectedMonth}
                      onChange={(e) =>
                        setDateFilter((prev) => ({
                          ...prev,
                          selectedMonth: e.target.value,
                        }))
                      }
                      className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 tabular-nums"
                    />
                  )}
                </div>
              </div>

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
                    <strong className="font-semibold text-slate-900">{selectedCount}</strong>{' '}
                    of {eligibleCount} eligible selected
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
                      Create Approved Template First
                    </button>
                  ) : (
                    <select
                      aria-label="WhatsApp delivery template"
                      value={activeTemplate?.id ?? ''}
                      onChange={(e) => {
                        setSelectedTemplateId(e.target.value);
                        setDispatchError('');
                      }}
                      className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      {tenantTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} (
                          {tpl.approvalStatus === 'approved'
                            ? `Approved · ${tpl.metaTemplateName}`
                            : tpl.approvalStatus}
                          )
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    disabled={selectedCount === 0}
                    onClick={handleOpenPreviewSelected}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    <span>Preview &amp; Confirm Send ({selectedCount})</span>
                  </button>
                </div>
              </div>
            </div>

            {dispatchError && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <span>{dispatchError}</span>
                {!isConnected && (
                  <button
                    type="button"
                    onClick={() => setGaragePage('garage-settings')}
                    className="min-h-[38px] shrink-0 rounded-xl border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-100 whitespace-nowrap"
                  >
                    Open Settings
                  </button>
                )}
              </div>
            )}

            {dispatchResultBanner && (
              <div
                role="status"
                className="space-y-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
              >
                <p className="font-medium">
                  WhatsApp dispatch accepted {dispatchResultBanner.sentCount} message
                  {dispatchResultBanner.sentCount === 1 ? '' : 's'} (status recorded as{' '}
                  <span className="font-semibold">Sent</span> — awaiting Meta webhook for{' '}
                  <span className="font-semibold">Delivered</span> /{' '}
                  <span className="font-semibold">Read</span> confirmation).{' '}
                  {dispatchResultBanner.failedCount > 0
                    ? `${dispatchResultBanner.failedCount} failed. `
                    : ''}
                  {dispatchResultBanner.skippedCount > 0
                    ? `${dispatchResultBanner.skippedCount} skipped.`
                    : ''}
                </p>
                {dispatchResultBanner.details.length > 0 && (
                  <p className="text-xs text-red-800">
                    Failures: {dispatchResultBanner.details.join(' | ')}
                  </p>
                )}
              </div>
            )}

            {filteredDeliveredRows.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No delivered customers match your search or date filter"
                description="Reset filters to view all confirmed vehicle deliveries."
                actionLabel="Clear Filters"
                onAction={() => {
                  setSearch('');
                  setDateFilter(createDefaultDateFilter());
                }}
              />
            ) : (
              <>
                {/* Desktop Customer Selection Table */}
                <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <tr>
                          <th className="w-12 px-4 py-3.5">
                            <span className="sr-only">Select</span>
                          </th>
                          <th className="px-4 py-3.5">Customer Name</th>
                          <th className="px-4 py-3.5">Mobile Number</th>
                          <th className="px-4 py-3.5">Vehicle Number</th>
                          <th className="px-4 py-3.5">Job Card #</th>
                          <th className="px-4 py-3.5">Delivery Status</th>
                          <th className="px-4 py-3.5">Eligibility</th>
                          <th className="px-4 py-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredDeliveredRows.map((row) => {
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
                                    aria-label={`Select ${card.customerName} (${card.jobCardNumber})`}
                                    checked={isChecked}
                                    disabled={!eligibility.eligible}
                                    onChange={() => toggleCustomerSelection(row)}
                                    className="h-5 w-5 rounded border-slate-300 text-navy-900 focus:ring-navy-900 disabled:cursor-not-allowed disabled:opacity-40"
                                  />
                                </label>
                              </td>
                              <td className="px-4 py-3.5 font-medium text-slate-900">
                                {card.customerName}
                              </td>
                              <td className="px-4 py-3.5 font-mono text-xs text-slate-700 tabular-nums">
                                {card.phoneNumber || 'Phone missing'}
                              </td>
                              <td className="px-4 py-3.5">
                                <p className="font-mono text-xs font-semibold text-slate-900">
                                  {card.vehicleRegistration}
                                </p>
                                {(card.vehicleBrand || card.vehicleModel) && (
                                  <p className="text-xs text-slate-500">
                                    {[card.vehicleBrand, card.vehicleModel]
                                      .filter(Boolean)
                                      .join(' ')}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-700 tabular-nums">
                                {card.jobCardNumber}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                                  <span>Delivered</span>
                                </div>
                                <p className="text-xs text-slate-500 tabular-nums">
                                  {formatTimestamp(card.deliveredAt)}
                                </p>
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
                                  onClick={() => openPreviewModalForCards([card])}
                                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
                                >
                                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Preview &amp; Send</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Touch-Friendly Customer Cards */}
                <ul className="space-y-3 md:hidden">
                  {filteredDeliveredRows.map((row) => {
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
                            aria-label={`Select ${card.customerName} (${card.jobCardNumber})`}
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
                              <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                                {card.jobCardNumber}
                              </span>
                            </div>

                            <p className="text-xs text-slate-700">
                              <span className="font-mono font-semibold text-slate-900">
                                {card.vehicleRegistration}
                              </span>
                              {card.vehicleModel ? ` · ${card.vehicleModel}` : ''}
                            </p>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 tabular-nums">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>Delivered · {formatTimestamp(card.deliveredAt)}</span>
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
                            onClick={() => openPreviewModalForCards([card])}
                            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            <span>Preview &amp; Send Message</span>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      {/* 3. WhatsApp Message Logs & Real-Time Webhook Delivery Tracking */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              WhatsApp Message Logs ({tenantWhatsAppLogs.length})
            </h3>
            <p className="text-xs text-slate-500">
              Statuses update from Meta Cloud API webhooks: Sent → Delivered → Read or Failed.
            </p>
          </div>
          {supabaseConfigured && session?.authMode === 'supabase' && (
            <button
              type="button"
              disabled={refreshingLogs}
              onClick={() => void handleRefreshLogs()}
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshingLogs ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{refreshingLogs ? 'Refreshing...' : 'Refresh Statuses'}</span>
            </button>
          )}
        </div>

        {tenantWhatsAppLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No WhatsApp sending attempts or message logs recorded yet for{' '}
            <span className="font-medium text-slate-800">
              {activeTenant.branding.displayName}
            </span>
            .
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {tenantWhatsAppLogs.map((log) => {
              const statusMeta = formatWhatsAppLogStatusMeta(log.status);
              return (
                <li key={log.id} className="p-5 space-y-2.5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-900">
                        {log.customerName}
                      </span>
                      {log.phoneNumber && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-xs text-slate-600 tabular-nums">
                            {log.phoneNumber}
                          </span>
                        </>
                      )}
                      {log.vehicleRegistration && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-xs text-slate-600">
                            {log.vehicleRegistration}
                          </span>
                        </>
                      )}
                      {log.jobCardNumber && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-xs text-slate-600">
                            {log.jobCardNumber}
                          </span>
                        </>
                      )}
                    </div>
                    <span className={`text-xs font-semibold ${statusMeta.toneClass}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                    {log.renderedMessage}
                  </p>

                  {log.errorMessage && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                      Error: {log.errorMessage}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 tabular-nums">
                    <span>
                      Template: {log.templateName}
                      {log.metaTemplateName ? ` (${log.metaTemplateName})` : ''}
                    </span>
                    <span>· Attempted {formatTimestamp(log.createdAt)}</span>
                    {log.deliveredAt && (
                      <span>· Delivered {formatTimestamp(log.deliveredAt)}</span>
                    )}
                    {log.readAt && <span>· Read {formatTimestamp(log.readAt)}</span>}
                    {log.failedAt && <span>· Failed {formatTimestamp(log.failedAt)}</span>}
                    {log.whatsappMessageId && (
                      <span className="font-mono text-[11px] text-slate-400">
                        · wamid: {log.whatsappMessageId}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 4. Message Preview & Final Confirmation Modal */}
      {previewModalOpen && activeTemplate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wa-confirm-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2
                  id="wa-confirm-modal-title"
                  className="font-display text-base font-bold text-slate-900"
                >
                  Message Preview &amp; Final Confirmation
                </h2>
                <p className="text-xs text-slate-500">
                  Review recipient details and rendered template messages before sending live via Meta Cloud API.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close preview modal"
                disabled={sendingBatch}
                onClick={() => setPreviewModalOpen(false)}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs sm:grid-cols-2">
                <div>
                  <p className="text-slate-500">Garage Sender</p>
                  <p className="font-semibold text-slate-900">
                    {activeTenant.branding.displayName}
                  </p>
                  <p className="font-mono text-slate-600">
                    Phone ID: {activeTenant.whatsappSettings.phoneNumberId}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Meta Approved Template</p>
                  <p className="font-semibold text-slate-900">{activeTemplate.name}</p>
                  <p className="font-mono text-slate-600">
                    {activeTemplate.metaTemplateName} ({activeTemplate.metaLanguageCode || 'en'})
                  </p>
                </div>
              </div>

              {previewSkipped.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">
                    {previewSkipped.length} selected item
                    {previewSkipped.length === 1 ? '' : 's'} excluded before dispatch:
                  </p>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {previewSkipped.map((item) => (
                      <li key={item.jobCardId}>
                        {item.customerName}: {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recipients &amp; Rendered Messages ({previewCards.length})
                </p>
                {previewCards.map((card) => {
                  const normalizedPhone = normalizeWhatsAppRecipientPhone(card.phoneNumber);
                  const { renderedMessage } = buildMetaTemplateBodyParameters(
                    activeTemplate.body,
                    {
                      customerName: card.customerName,
                      garageName: activeTenant.branding.displayName,
                      vehicleReg: card.vehicleRegistration,
                      vehicleModel: card.vehicleModel,
                      jobCardNumber: card.jobCardNumber,
                      googleReviewUrl: activeTenant.reviewSocialLinks.googleReviewUrl,
                      instagramUrl: activeTenant.reviewSocialLinks.instagramUrl,
                    },
                  );
                  return (
                    <div
                      key={card.id}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {card.customerName}
                          </span>
                          <span className="font-mono text-slate-600 tabular-nums">
                            {card.phoneNumber}
                            {normalizedPhone ? ` (+${normalizedPhone})` : ''}
                          </span>
                          <span className="font-mono font-semibold text-slate-700">
                            {card.vehicleRegistration}
                          </span>
                          <span className="font-mono text-slate-500">
                            {card.jobCardNumber}
                          </span>
                        </div>
                        <span className="font-semibold text-emerald-700">Delivered</span>
                      </div>
                      <p className="rounded-lg bg-slate-50 p-2.5 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                        {renderedMessage}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={finalConfirmed}
                  disabled={sendingBatch}
                  onChange={(e) => setFinalConfirmed(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-slate-300 text-navy-900 focus:ring-navy-900"
                />
                <span>
                  I confirm these customer details and authorize sending{' '}
                  <strong>{previewCards.length}</strong> live WhatsApp template message
                  {previewCards.length === 1 ? '' : 's'} via Meta Cloud API.
                </span>
              </label>

              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={sendingBatch}
                  onClick={() => setPreviewModalOpen(false)}
                  className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!finalConfirmed || sendingBatch}
                  onClick={() => void handleConfirmSendBatch()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {sendingBatch
                      ? 'Sending via Meta Cloud API...'
                      : `Confirm & Send Live Messages (${previewCards.length})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
