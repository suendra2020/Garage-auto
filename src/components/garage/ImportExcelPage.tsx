import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { buildSampleJobCardCsv } from '../../data/plans';
import type { ExcelColumnMapping, ImportBatch } from '../../types/garage';
import {
  mapImportedRows,
  suggestColumnMapping,
} from '../../utils/tenantLogic';

export function ImportExcelPage() {
  const { activeTenant, importJobCardsForActiveTenant, setGaragePage } = useAppState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ExcelColumnMapping>({
    jobCardNumber: '',
    customerName: '',
    phoneNumber: '',
    vehicleRegistration: '',
    vehicleBrand: '',
    vehicleModel: '',
    serviceType: '',
    rawStatus: '',
  });
  const [parseError, setParseError] = useState('');
  const [importedSummary, setImportedSummary] = useState<{
    total: number;
    delivered: number;
    skipped: number;
  } | null>(null);

  if (!activeTenant) return null;

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setParseError('');
    setImportedSummary(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setParseError('The uploaded spreadsheet contains no worksheets.');
        return;
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: '',
      });
      if (rows.length === 0) {
        setParseError('No data rows were found in the first worksheet.');
        return;
      }

      const detectedHeaders = Object.keys(rows[0]);
      setFileName(file.name);
      setHeaders(detectedHeaders);
      setRawRows(rows);
      setMapping(suggestColumnMapping(detectedHeaders));
    } catch {
      setParseError(
        'Unable to read this file. Upload a valid .xlsx, .xls, or .csv spreadsheet.',
      );
    }
  };

  const handleDownloadSampleCsv = () => {
    const csv = buildSampleJobCardCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'garage-job-cards-sample.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const previewResult =
    rawRows.length > 0
      ? mapImportedRows(
          rawRows.slice(0, 5),
          mapping,
          activeTenant.id,
          'preview_batch',
        )
      : null;

  const handleConfirmImport = async () => {
    if (rawRows.length === 0) return;
    if (!mapping.customerName && !mapping.vehicleRegistration && !mapping.jobCardNumber) {
      setParseError(
        'Map at least one column (Customer Name, Vehicle Reg, or Job Card No) before importing.',
      );
      return;
    }

    const batchId = `batch_${Date.now()}`;
    const now = new Date().toISOString();
    const mapped = mapImportedRows(
      rawRows,
      mapping,
      activeTenant.id,
      batchId,
      now,
    );

    const batch: ImportBatch = {
      id: batchId,
      tenantId: activeTenant.id,
      fileName: fileName || 'uploaded-sheet.xlsx',
      importedAt: now,
      totalRows: mapped.jobCards.length,
      deliveredCount: mapped.deliveredCount,
      skippedCount: mapped.skippedCount,
      failedCount: 0,
    };

    try {
      await importJobCardsForActiveTenant(batch, mapped.jobCards);
      setImportedSummary({
        total: mapped.jobCards.length,
        delivered: mapped.deliveredCount,
        skipped: mapped.skippedCount,
      });
      setRawRows([]);
      setHeaders([]);
      setFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to save imported job cards.');
    }
  };

  const mappingFields: { key: keyof ExcelColumnMapping; label: string }[] = [
    { key: 'jobCardNumber', label: 'Job Card Number' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'phoneNumber', label: 'WhatsApp / Mobile Number' },
    { key: 'vehicleRegistration', label: 'Vehicle Number / Reg' },
    { key: 'vehicleBrand', label: 'Vehicle Brand' },
    { key: 'vehicleModel', label: 'Vehicle Model' },
    { key: 'serviceType', label: 'Service Details' },
    { key: 'rawStatus', label: 'Job Card Status (for Delivered Detection)' },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Sample Template Download */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Import Job Card Spreadsheet
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload `.xlsx`, `.xls`, or `.csv` files strictly into{' '}
            <span className="font-medium text-slate-900">
              {activeTenant.branding.displayName}
            </span>
            . Rows marked Delivered are flagged automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadSampleCsv}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Download Sample CSV</span>
        </button>
      </div>

      {/* Success Banner after import */}
      {importedSummary && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
              aria-hidden="true"
            />
            <div className="text-sm">
              <p className="font-semibold text-emerald-950">
                Imported {importedSummary.total} job cards into {activeTenant.branding.displayName}
              </p>
              <p className="mt-0.5 text-emerald-800 tabular-nums">
                {importedSummary.delivered} vehicles identified as Delivered ·{' '}
                {importedSummary.skipped} empty rows skipped
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setGaragePage('delivered-vehicles')}
              className="min-h-[44px] rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 whitespace-nowrap"
            >
              View Delivered Vehicles
            </button>
            <button
              type="button"
              onClick={() => setGaragePage('job-cards')}
              className="min-h-[44px] rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
            >
              All Job Cards
            </button>
          </div>
        </div>
      )}

      {/* Upload Dropzone */}
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-navy-900">
          <Upload className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="font-display mt-4 text-base font-semibold text-slate-900">
          Select an Excel or CSV job card file
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Supported formats: .xlsx, .xls, .csv · Parsed securely in your browser
        </p>

        <input
          ref={fileInputRef}
          id="excel-file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => handleFileChange(e.target.files?.[0])}
          className="sr-only"
        />
        <div className="mt-5 flex justify-center">
          <label
            htmlFor="excel-file-input"
            className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            <span>Choose Spreadsheet File</span>
          </label>
        </div>

        {parseError && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-600">
            {parseError}
          </p>
        )}
      </section>

      {/* Column Mapping & Preview */}
      {rawRows.length > 0 && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Map Spreadsheet Columns ({fileName})
              </h3>
              <p className="text-xs text-slate-500 tabular-nums">
                {rawRows.length} rows detected · Verify column mapping before importing
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleConfirmImport()}
              className="min-h-[44px] rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
            >
              Import {rawRows.length} Rows
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mappingFields.map((field) => (
              <div key={field.key}>
                <label
                  htmlFor={`map-${field.key}`}
                  className="block text-xs font-medium text-slate-700"
                >
                  {field.label}
                </label>
                <select
                  id={`map-${field.key}`}
                  value={mapping[field.key]}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="">-- Not Mapped --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview first 5 mapped rows */}
          {previewResult && previewResult.jobCards.length > 0 && (
            <div className="pt-2">
              <p className="mb-2 text-xs font-semibold text-slate-600">
                Preview (First {previewResult.jobCards.length} Mapped Records)
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3.5 py-2.5">Job Card</th>
                      <th className="px-3.5 py-2.5">Customer</th>
                      <th className="px-3.5 py-2.5">Phone</th>
                      <th className="px-3.5 py-2.5">Vehicle</th>
                      <th className="px-3.5 py-2.5">Status</th>
                      <th className="px-3.5 py-2.5">Delivery Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {previewResult.jobCards.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3.5 py-2.5 font-mono">{c.jobCardNumber}</td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-900">
                          {c.customerName}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-slate-600">
                          {c.phoneNumber || '—'}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span className="font-mono font-medium">{c.vehicleRegistration}</span>{' '}
                          <span className="text-slate-500">· {c.vehicleModel}</span>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-700">{c.rawStatus}</td>
                        <td className="px-3.5 py-2.5">
                          {c.isDelivered ? (
                            <span className="font-semibold text-emerald-700">
                              Delivered Detected
                            </span>
                          ) : (
                            <span className="text-slate-500">Not Delivered</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
