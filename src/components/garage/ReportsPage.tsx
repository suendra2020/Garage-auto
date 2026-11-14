import React from 'react';
import { BarChart3, Car, ClipboardList, Download, MessageSquare } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { EmptyState } from '../common/EmptyState';
import { StatCard } from '../common/StatCard';

export function ReportsPage() {
  const {
    activeTenant,
    tenantJobCards,
    tenantDeliveredVehicles,
    tenantImportBatches,
    tenantWhatsAppLogs,
    setGaragePage,
  } = useAppState();

  if (!activeTenant) return null;

  const deliveryRate =
    tenantJobCards.length > 0
      ? Math.round((tenantDeliveredVehicles.length / tenantJobCards.length) * 100)
      : 0;

  const handleExportDeliveredCsv = () => {
    if (tenantDeliveredVehicles.length === 0) return;
    const headers = [
      'Job Card No',
      'Customer Name',
      'WhatsApp Phone',
      'Vehicle Reg',
      'Vehicle Model',
      'Status',
    ];
    const rows = tenantDeliveredVehicles.map((v) => [
      v.jobCardNumber,
      v.customerName,
      v.phoneNumber,
      v.vehicleRegistration,
      v.vehicleModel,
      v.rawStatus,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTenant.slug}-delivered-vehicles.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (tenantJobCards.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No reporting data available yet"
        description="Import your garage's job card spreadsheet to view delivery detection rates, outreach readiness, and exportable delivered vehicle lists."
        actionLabel="Import Excel File"
        onAction={() => setGaragePage('import-excel')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Delivery &amp; Outreach Summary
          </h2>
          <p className="text-sm text-slate-600">
            Scoped strictly to {activeTenant.branding.displayName}.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportDeliveredCsv}
          disabled={tenantDeliveredVehicles.length === 0}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Export Delivered CSV</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Imported Rows"
          value={tenantJobCards.length}
          helperText={`Across ${tenantImportBatches.length} spreadsheet ${tenantImportBatches.length === 1 ? 'import' : 'imports'}`}
          icon={ClipboardList}
        />
        <StatCard
          label="Delivery Detection Rate"
          value={`${deliveryRate}%`}
          helperText={`${tenantDeliveredVehicles.length} delivered vehicles identified`}
          icon={Car}
          tone="success"
        />
        <StatCard
          label="Prepared WhatsApp Drafts"
          value={tenantWhatsAppLogs.length}
          helperText="0 live messages sent (API disconnected)"
          icon={MessageSquare}
          tone="warning"
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Import Batch History
          </h3>
        </div>
        <ul className="divide-y divide-slate-200">
          {tenantImportBatches.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-1 px-5 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-slate-900">{b.fileName}</p>
                <p className="text-xs text-slate-500">
                  {new Date(b.importedAt).toLocaleString()}
                </p>
              </div>
              <p className="text-xs font-medium text-slate-700 tabular-nums">
                {b.totalRows} imported · {b.deliveredCount} delivered · {b.skippedCount} skipped
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
