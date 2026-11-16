import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  Search,
  ShieldCheck,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { DashboardDateFilter, JobCard } from '../../types/garage';
import { createDefaultDateFilter } from '../../utils/dashboardStats';
import {
  classifyJobCardFilterStage,
  filterJobCardsList,
  isAuthorizedDeliveryConfirmer,
  isConfirmedDeliveredCard,
  toDateTimeLocalInputValue,
  validateDeliveryConfirmationInput,
  type JobCardFilterStatus,
} from '../../utils/jobCardDelivery';
import { EmptyState } from '../common/EmptyState';

function formatDateTimeDisplay(iso: string | null | undefined): string {
  if (!iso) return 'Not confirmed';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not confirmed';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderStatusInline(card: JobCard) {
  const stage = classifyJobCardFilterStage(card);
  if (stage === 'delivered' && isConfirmedDeliveredCard(card)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Delivered</span>
      </span>
    );
  }
  if (stage === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
        <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{card.rawStatus || 'Cancelled'}</span>
      </span>
    );
  }
  if (stage === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-900">
        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{card.rawStatus || 'In Progress'}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
      <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{card.rawStatus || 'Pending'}</span>
    </span>
  );
}

export function JobCardsPage() {
  const {
    session,
    activeTenant,
    tenantJobCards,
    tenantUsers,
    confirmJobCardDelivery,
    revertJobCardDelivery,
    setGaragePage,
  } = useAppState();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobCardFilterStatus>('all');
  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>(() =>
    createDefaultDateFilter(),
  );

  // Selected Job Card & 5-Step Delivery Confirmation state
  const [openedCardId, setOpenedCardId] = useState<string | null>(null);
  const [showDeliveryStep, setShowDeliveryStep] = useState(false);
  const [handoverConfirmed, setHandoverConfirmed] = useState(false);
  const [deliveryDateTimeLocal, setDeliveryDateTimeLocal] = useState(() =>
    toDateTimeLocalInputValue(),
  );
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [feedback, setFeedback] = useState('');

  const canConfirmDelivery = isAuthorizedDeliveryConfirmer(session, activeTenant?.id);

  const stageCounts = useMemo(() => {
    const counts = {
      all: tenantJobCards.length,
      pending: 0,
      in_progress: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const card of tenantJobCards) {
      const stage = classifyJobCardFilterStage(card);
      counts[stage] += 1;
    }
    return counts;
  }, [tenantJobCards]);

  const filtered = useMemo(
    () =>
      filterJobCardsList(tenantJobCards, activeTenant?.id, {
        search,
        statusFilter,
        dateFilter,
      }),
    [tenantJobCards, activeTenant?.id, search, statusFilter, dateFilter],
  );

  const openedCard = useMemo(
    () => tenantJobCards.find((c) => c.id === openedCardId) ?? null,
    [tenantJobCards, openedCardId],
  );

  const resolveStaffLabel = (userId: string | null | undefined): string => {
    if (!userId) return 'Imported / Unassigned';
    if (session && session.userId === userId) {
      return `${session.fullName} (${userId})`;
    }
    const member = tenantUsers.find((u) => u.id === userId);
    return member ? `${member.fullName} (${userId})` : userId;
  };

  const openJobCard = (card: JobCard) => {
    setOpenedCardId(card.id);
    setShowDeliveryStep(false);
    setHandoverConfirmed(false);
    setDeliveryDateTimeLocal(
      card.deliveredAt ? toDateTimeLocalInputValue(card.deliveredAt) : toDateTimeLocalInputValue(),
    );
    setDeliveryError('');
  };

  const closeJobCardModal = () => {
    setOpenedCardId(null);
    setShowDeliveryStep(false);
    setHandoverConfirmed(false);
    setDeliveryError('');
  };

  const handleStartDeliveryFlow = () => {
    setShowDeliveryStep(true);
    setHandoverConfirmed(false);
    setDeliveryDateTimeLocal(toDateTimeLocalInputValue());
    setDeliveryError('');
  };

  const handleSaveDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openedCard) return;
    setDeliveryError('');

    if (!canConfirmDelivery) {
      setDeliveryError('Only authorized garage staff can confirm vehicle delivery.');
      return;
    }

    const validation = validateDeliveryConfirmationInput({
      handoverConfirmed,
      deliveryDateTimeLocal,
    });
    if (!validation.valid) {
      setDeliveryError(validation.error);
      return;
    }

    setSavingDelivery(true);
    try {
      const updated = await confirmJobCardDelivery({
        jobCardId: openedCard.id,
        deliveryDateIso: validation.deliveredAtIso,
        handoverConfirmed: true,
      });
      setShowDeliveryStep(false);
      setFeedback(
        `Confirmed delivery for ${updated.jobCardNumber} (${updated.vehicleRegistration}) on ${formatDateTimeDisplay(updated.deliveredAt)}.`,
      );
    } catch (err) {
      setDeliveryError(err instanceof Error ? err.message : 'Unable to save delivery status.');
    } finally {
      setSavingDelivery(false);
    }
  };

  const handleRevertDelivery = async () => {
    if (!openedCard || !canConfirmDelivery) return;
    setDeliveryError('');
    setSavingDelivery(true);
    try {
      await revertJobCardDelivery(openedCard.id);
      setFeedback(`Delivery status reverted to In Progress for ${openedCard.jobCardNumber}.`);
    } catch (err) {
      setDeliveryError(err instanceof Error ? err.message : 'Unable to revert delivery status.');
    } finally {
      setSavingDelivery(false);
    }
  };

  if (tenantJobCards.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No job cards imported for this garage yet"
        description="Import an Excel or CSV job card file to populate your garage job cards and confirm vehicle deliveries."
        actionLabel="Import Excel File"
        onAction={() => setGaragePage('import-excel')}
      />
    );
  }

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setGaragePage('delivered-vehicles')}
            className="min-h-[40px] shrink-0 rounded-xl bg-emerald-700 px-3.5 text-xs font-medium text-white whitespace-nowrap"
          >
            View Delivered Vehicles
          </button>
        </div>
      )}

      {/* Search, Status Filter, and Date Filter Controls */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search job cards by customer, vehicle registration, or job-card number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, vehicle reg, or job card #..."
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span>Date:</span>
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
                    setDateFilter((prev) => ({
                      ...prev,
                      period: item.id,
                    }))
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
                aria-label="Filter job cards by date"
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
                aria-label="Filter job cards by month"
                value={dateFilter.selectedMonth}
                onChange={(e) =>
                  setDateFilter((prev) => ({ ...prev, selectedMonth: e.target.value }))
                }
                className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 tabular-nums"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          {(
            [
              { id: 'all', label: `All (${stageCounts.all})` },
              { id: 'pending', label: `Pending (${stageCounts.pending})` },
              { id: 'in_progress', label: `In Progress (${stageCounts.in_progress})` },
              { id: 'delivered', label: `Delivered (${stageCounts.delivered})` },
              { id: 'cancelled', label: `Cancelled (${stageCounts.cancelled})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-medium tabular-nums whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'border-navy-900 bg-navy-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching job cards"
          description="Adjust your customer/vehicle search, status filter, or date filter."
          actionLabel="Clear Filters"
          onAction={() => {
            setSearch('');
            setStatusFilter('all');
            setDateFilter(createDefaultDateFilter());
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3.5">Job Card #</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Mobile</th>
                  <th className="px-5 py-3.5">Vehicle</th>
                  <th className="px-5 py-3.5">Model</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Delivery Date</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((card) => (
                  <tr
                    key={card.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {card.jobCardNumber}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {card.customerName}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {card.phoneNumber || '—'}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {card.vehicleRegistration}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">
                      {[card.vehicleBrand, card.vehicleModel].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {renderStatusInline(card)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {isConfirmedDeliveredCard(card)
                        ? formatDateTimeDisplay(card.deliveredAt)
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openJobCard(card)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Open Job Card</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Touch Cards */}
          <ul className="divide-y divide-slate-200 md:hidden">
            {filtered.map((card) => (
              <li key={card.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-navy-900 tabular-nums">
                      {card.jobCardNumber}
                    </p>
                    <p className="mt-0.5 font-medium text-slate-900">{card.customerName}</p>
                    <p className="font-mono text-xs text-slate-600 tabular-nums">
                      {card.phoneNumber || 'No mobile number'}
                    </p>
                  </div>
                  {renderStatusInline(card)}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    <span className="font-mono font-semibold text-slate-800">
                      {card.vehicleRegistration}
                    </span>{' '}
                    · {[card.vehicleBrand, card.vehicleModel].filter(Boolean).join(' ') || '—'}
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {isConfirmedDeliveredCard(card)
                      ? `Delivered: ${formatDateTimeDisplay(card.deliveredAt)}`
                      : 'Delivery not confirmed'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => openJobCard(card)}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  <span>Open Job Card</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Job Card Detail & Delivery Confirmation Modal */}
      {openedCard && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jc-detail-title"
        >
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:max-w-xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="font-mono text-xs font-semibold text-slate-500 tabular-nums">
                  Job Card {openedCard.jobCardNumber}
                </p>
                <h2
                  id="jc-detail-title"
                  className="font-display text-lg font-semibold text-slate-900"
                >
                  {openedCard.customerName}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close job card details"
                onClick={closeJobCardModal}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {/* Job Card Summary Grid */}
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-slate-500">Customer Mobile</dt>
                  <dd className="mt-0.5 font-mono text-slate-900 tabular-nums">
                    {openedCard.phoneNumber || 'Not provided'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Vehicle Registration</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-slate-900">
                    {openedCard.vehicleRegistration}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Vehicle Brand &amp; Model</dt>
                  <dd className="mt-0.5 text-slate-900">
                    {[openedCard.vehicleBrand, openedCard.vehicleModel].filter(Boolean).join(' ') ||
                      '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Current Status</dt>
                  <dd className="mt-0.5">{renderStatusInline(openedCard)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-500">Service Details</dt>
                  <dd className="mt-0.5 text-slate-800">{openedCard.serviceType || '—'}</dd>
                </div>
                {(openedCard.serviceAdvisor || openedCard.invoiceNumber || openedCard.amount != null) && (
                  <>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Service Advisor</dt>
                      <dd className="mt-0.5 text-slate-800">
                        {openedCard.serviceAdvisor || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">Invoice / Amount</dt>
                      <dd className="mt-0.5 text-slate-800 tabular-nums">
                        {openedCard.invoiceNumber || '—'}
                        {openedCard.amount != null ? ` · ₹${openedCard.amount.toLocaleString()}` : ''}
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              {/* Delivery Status & Confirmation Audit */}
              <div className="border-t border-slate-200 pt-4 space-y-4">
                {isConfirmedDeliveredCard(openedCard) ? (
                  <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                      <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span>Vehicle Delivery Confirmed</span>
                    </div>
                    <dl className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="font-medium text-emerald-800/80">Delivery Date &amp; Time</dt>
                        <dd className="mt-0.5 font-semibold text-emerald-950 tabular-nums">
                          {formatDateTimeDisplay(openedCard.deliveredAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-emerald-800/80">Confirmation Timestamp</dt>
                        <dd className="mt-0.5 font-semibold text-emerald-950 tabular-nums">
                          {openedCard.deliveryConfirmedAt
                            ? formatDateTimeDisplay(openedCard.deliveryConfirmedAt)
                            : 'Recorded via import'}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-medium text-emerald-800/80">Delivered By (User ID)</dt>
                        <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-emerald-950">
                          <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{resolveStaffLabel(openedCard.deliveredBy)}</span>
                        </dd>
                      </div>
                    </dl>

                    {canConfirmDelivery && (
                      <div className="pt-1">
                        <button
                          type="button"
                          disabled={savingDelivery}
                          onClick={handleRevertDelivery}
                          className="min-h-[40px] rounded-xl border border-emerald-300 bg-white px-3.5 text-xs font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          Revert to In Progress
                        </button>
                      </div>
                    )}
                  </div>
                ) : !canConfirmDelivery ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                    Only authorized garage staff belonging to this garage can confirm vehicle delivery.
                  </div>
                ) : !showDeliveryStep ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-600">
                      Confirm actual vehicle handover and record delivery date &amp; time before sending customer outreach.
                    </p>
                    <button
                      type="button"
                      onClick={handleStartDeliveryFlow}
                      className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 whitespace-nowrap"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>Mark as Delivered</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSaveDelivery} className="space-y-4">
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      Confirm Vehicle Handover &amp; Delivery Time
                    </h3>

                    <label className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-slate-50 p-3.5 hover:bg-slate-100/70">
                      <input
                        type="checkbox"
                        checked={handoverConfirmed}
                        onChange={(e) => setHandoverConfirmed(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 text-navy-900 focus:ring-navy-900"
                      />
                      <span className="text-sm font-medium text-slate-900">
                        Confirm actual vehicle handover
                        <span className="block text-xs font-normal text-slate-600">
                          I verify the vehicle has been physically handed over to {openedCard.customerName}.
                        </span>
                      </span>
                    </label>

                    <div>
                      <label
                        htmlFor="delivery-datetime-input"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Delivery Date &amp; Time
                      </label>
                      <input
                        id="delivery-datetime-input"
                        type="datetime-local"
                        required
                        value={deliveryDateTimeLocal}
                        onChange={(e) => setDeliveryDateTimeLocal(e.target.value)}
                        className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 tabular-nums"
                      />
                    </div>

                    {deliveryError && (
                      <p role="alert" className="text-xs font-medium text-red-600">
                        {deliveryError}
                      </p>
                    )}

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeliveryStep(false);
                          setDeliveryError('');
                        }}
                        className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingDelivery}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>{savingDelivery ? 'Saving...' : 'Save Delivery Status'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
