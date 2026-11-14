import React, { useState } from 'react';
import { Car, CheckCircle2, MessageSquare, Search } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { EmptyState } from '../common/EmptyState';

export function DeliveredVehiclesPage() {
  const {
    tenantDeliveredVehicles,
    tenantTemplates,
    prepareWhatsAppDraftForCard,
    setGaragePage,
  } = useAppState();

  const [search, setSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    tenantTemplates[0]?.id ?? '',
  );
  const [feedback, setFeedback] = useState('');

  if (tenantDeliveredVehicles.length === 0) {
    return (
      <EmptyState
        icon={Car}
        title="No delivered vehicles identified yet"
        description="Import a job card spreadsheet with Delivered status rows, or mark completed job cards as Delivered to prepare WhatsApp & Google Review invites."
        actionLabel="Import Excel File"
        onAction={() => setGaragePage('import-excel')}
        secondaryLabel="Review Job Cards"
        onSecondaryAction={() => setGaragePage('job-cards')}
      />
    );
  }

  const activeTemplateId = selectedTemplateId || tenantTemplates[0]?.id || '';
  const filtered = tenantDeliveredVehicles.filter((v) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      v.customerName.toLowerCase().includes(q) ||
      v.vehicleRegistration.toLowerCase().includes(q) ||
      v.vehicleModel.toLowerCase().includes(q)
    );
  });

  const handlePrepareDraft = (jobCardId: string) => {
    if (!activeTemplateId) {
      setGaragePage('message-templates');
      return;
    }
    const created = prepareWhatsAppDraftForCard(jobCardId, activeTemplateId);
    if (created) {
      setFeedback(
        `Prepared WhatsApp draft for ${created.customerName} (${created.vehicleRegistration}). Live sending requires connecting WhatsApp Cloud API.`,
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search delivered vehicles"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer or registration..."
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="deliv-tpl" className="text-xs font-medium text-slate-600 whitespace-nowrap">
            Active Template:
          </label>
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
            className="min-h-[38px] shrink-0 rounded-xl bg-emerald-700 px-3.5 text-xs font-medium text-white whitespace-nowrap"
          >
            Open WhatsApp Queue
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3.5">Vehicle</th>
                <th className="px-5 py-3.5">Customer &amp; WhatsApp Phone</th>
                <th className="px-5 py-3.5">Job Card</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Outreach Draft</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5">
                    <p className="font-mono text-xs font-semibold text-slate-900">
                      {v.vehicleRegistration}
                    </p>
                    <p className="text-xs text-slate-500">{v.vehicleModel}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900">{v.customerName}</p>
                    <p className="font-mono text-xs text-slate-500">
                      {v.phoneNumber || 'Phone missing'}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-700">
                    {v.jobCardNumber}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Delivered
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => handlePrepareDraft(v.id)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-navy-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-navy-800 whitespace-nowrap"
                    >
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {v.whatsappDispatchStatus === 'draft_prepared'
                          ? 'Prepare Another Draft'
                          : 'Prepare WhatsApp Draft'}
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-slate-200 md:hidden">
          {filtered.map((v) => (
            <li key={v.id} className="p-4 space-y-3">
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
              <button
                type="button"
                onClick={() => handlePrepareDraft(v.id)}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-medium text-white"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                <span>Prepare WhatsApp Draft</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
