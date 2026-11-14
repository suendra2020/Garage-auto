import React from 'react';
import { AlertCircle, MessageSquare } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { EmptyState } from '../common/EmptyState';

export function WhatsAppMessagesPage() {
  const { activeTenant, tenantWhatsAppLogs, setGaragePage } = useAppState();

  if (!activeTenant) return null;

  const hasIdsConfigured = Boolean(
    activeTenant.whatsappSettings.phoneNumberId.trim() &&
      activeTenant.whatsappSettings.wabaId.trim(),
  );

  return (
    <div className="space-y-6">
      {/* Honest WhatsApp Connection Status Card */}
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              WhatsApp Cloud API Status: Not Connected
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {hasIdsConfigured
                ? 'Phone Number ID & WABA ID are saved locally, but Supabase Edge Function live dispatch is not yet connected. Draft previews prepared below are not sent externally.'
                : 'Configure your garage WhatsApp Business Phone Number ID, WABA ID, and Edge Function webhook before sending live messages.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setGaragePage('garage-settings')}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
        >
          Configure WhatsApp Settings
        </button>
      </section>

      {/* Queue / Draft Log List */}
      {tenantWhatsAppLogs.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No WhatsApp delivery drafts or logs yet"
          description="Once you import job cards and mark vehicles as Delivered, prepare personalized delivery & Google Review message drafts from the Delivered Vehicles screen."
          actionLabel="Go to Delivered Vehicles"
          onAction={() => setGaragePage('delivered-vehicles')}
          secondaryLabel="Manage Message Templates"
          onSecondaryAction={() => setGaragePage('message-templates')}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3.5">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Prepared Outreach Drafts ({tenantWhatsAppLogs.length})
            </h3>
          </div>
          <ul className="divide-y divide-slate-200">
            {tenantWhatsAppLogs.map((log) => (
              <li key={log.id} className="p-5 space-y-2.5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-slate-900">
                      {log.customerName}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-xs text-slate-600">
                      {log.phoneNumber}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-xs text-slate-600">
                      {log.vehicleRegistration}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      log.status === 'delivered' || log.status === 'read'
                        ? 'text-emerald-700'
                        : log.status === 'failed'
                          ? 'text-red-600'
                          : log.status === 'sent'
                            ? 'text-navy-900'
                            : 'text-amber-700'
                    }`}
                  >
                    {log.status === 'delivered' || log.status === 'read'
                      ? 'Delivered'
                      : log.status === 'sent'
                        ? 'Sent'
                        : log.status === 'failed'
                          ? 'Failed'
                          : log.status === 'queued'
                            ? 'Queued'
                            : 'Draft Only (WhatsApp API Not Connected)'}
                  </span>
                </div>
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {log.renderedMessage}
                </p>
                <p className="text-xs text-slate-500 tabular-nums">
                  Template: {log.templateName} · Prepared {new Date(log.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
