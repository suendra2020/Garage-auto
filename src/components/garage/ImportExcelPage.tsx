import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  BookmarkCheck,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileWarning,
  Layers,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { buildSampleJobCardCsv } from '../../data/plans';
import type {
  ExcelColumnMapping,
  ImportAnalysisSummary,
  ImportBatch,
  ImportErrorReportRow,
} from '../../types/garage';
import {
  OPTIONAL_IMPORT_FIELDS,
  REQUIRED_IMPORT_FIELDS,
  analyzeAndPrepareImport,
  buildErrorReportCsv,
  createEmptyMapping,
  extractSheetTable,
  isMappingComplete,
  suggestFlexibleColumnMapping,
} from '../../utils/excelImportEngine';

type PreviewFilter = 'all' | 'ready' | 'duplicates' | 'issues';

interface CompletedImportSummary {
  fileName: string;
  sheetName: string;
  garageName: string;
  batchCount: number;
  summary: ImportAnalysisSummary;
  errorReportRows: ImportErrorReportRow[];
}

export function ImportExcelPage() {
  const {
    activeTenant,
    authorizedTenants,
    tenantJobCards,
    switchActiveGarage,
    importJobCardsForActiveTenant,
    saveGarageImportMapping,
    setGaragePage,
  } = useAppState();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [rawMatrix, setRawMatrix] = useState<unknown[][]>([]);
  const [headerRowOverride, setHeaderRowOverride] = useState<number | undefined>(undefined);
  const [detectedHeaderRow, setDetectedHeaderRow] = useState<number>(0);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [indexedRows, setIndexedRows] = useState<
    { rowNumber: number; data: Record<string, unknown> }[]
  >([]);
  const [mapping, setMapping] = useState<ExcelColumnMapping>(createEmptyMapping);
  const [saveMappingForFuture, setSaveMappingForFuture] = useState<boolean>(true);
  const [mappingSavedNotice, setMappingSavedNotice] = useState<string>('');
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(
    null,
  );
  const [completedSummary, setCompletedSummary] = useState<CompletedImportSummary | null>(null);

  const applySheetMatrix = (
    matrix: unknown[][],
    savedMapping: ExcelColumnMapping | null | undefined,
    forcedRow?: number,
  ) => {
    const table = extractSheetTable(matrix, forcedRow);
    if (table.headers.length === 0 || table.rows.length === 0) {
      setHeaders([]);
      setIndexedRows([]);
      setParseError(
        'No column headings or data rows were found on this sheet. Try selecting another sheet or header row.',
      );
      return;
    }
    setParseError('');
    setDetectedHeaderRow(table.headerRowIndex);
    setHeaders(table.headers);
    setIndexedRows(table.rows);
    setMapping(suggestFlexibleColumnMapping(table.headers, savedMapping));
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file || !activeTenant) return;
    setParseError('');
    setCompletedSummary(null);
    setMappingSavedNotice('');
    setPreviewFilter('all');

    const lowerName = file.name.toLowerCase();
    if (!/\.(xlsx|xls|csv)$/i.test(lowerName)) {
      setParseError('Unsupported file type. Please upload an .xlsx, .xls, or .csv spreadsheet.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
      const names = wb.SheetNames ?? [];
      if (names.length === 0) {
        setParseError('The uploaded spreadsheet contains no worksheets.');
        return;
      }

      const firstSheet = names[0];
      const worksheet = wb.Sheets[firstSheet];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: '',
        raw: true,
      });

      setWorkbook(wb);
      setSheetNames(names);
      setSelectedSheet(firstSheet);
      setFileName(file.name);
      setRawMatrix(matrix);
      setHeaderRowOverride(undefined);
      applySheetMatrix(matrix, activeTenant.savedImportMapping);
    } catch {
      setParseError(
        'Unable to read this file. Upload a valid .xlsx, .xls, or .csv spreadsheet.',
      );
    }
  };

  const handleSheetChange = (nextSheetName: string) => {
    if (!workbook || !activeTenant) return;
    setSelectedSheet(nextSheetName);
    setHeaderRowOverride(undefined);
    const worksheet = workbook.Sheets[nextSheetName];
    if (!worksheet) return;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      raw: true,
    });
    setRawMatrix(matrix);
    applySheetMatrix(matrix, activeTenant.savedImportMapping);
  };

  const handleHeaderRowChange = (rowIdx: number) => {
    if (!activeTenant || rawMatrix.length === 0) return;
    setHeaderRowOverride(rowIdx);
    applySheetMatrix(rawMatrix, activeTenant.savedImportMapping, rowIdx);
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

  const handleDownloadErrorReport = (
    errorRows: ImportErrorReportRow[],
    sourceFileName: string,
  ) => {
    if (errorRows.length === 0) return;
    const csv = buildErrorReportCsv(errorRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const base = sourceFileName.replace(/\.[^.]+$/, '') || 'job-cards';
    link.href = url;
    link.download = `${base}-import-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveMappingNow = async () => {
    if (!activeTenant) return;
    try {
      await saveGarageImportMapping(activeTenant.id, mapping);
      setMappingSavedNotice(
        `Saved column mapping for ${activeTenant.branding.displayName}. Future uploads will reuse this mapping automatically.`,
      );
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Unable to save mapping for this garage.',
      );
    }
  };

  const mappingCheck = useMemo(() => isMappingComplete(mapping), [mapping]);

  const analysis = useMemo(() => {
    if (!activeTenant || indexedRows.length === 0) return null;
    return analyzeAndPrepareImport({
      rows: indexedRows,
      mapping,
      tenantId: activeTenant.id,
      existingJobCards: tenantJobCards,
      batchId: 'preview_batch',
    });
  }, [activeTenant, indexedRows, mapping, tenantJobCards]);

  const filteredPreviewRows = useMemo(() => {
    if (!analysis) return [];
    const list = analysis.rowResults.filter((row) => {
      if (previewFilter === 'ready') {
        return row.disposition === 'new' || row.disposition === 'update';
      }
      if (previewFilter === 'duplicates') {
        return row.disposition === 'duplicate_in_file' || row.disposition === 'update';
      }
      if (previewFilter === 'issues') {
        return (
          row.disposition === 'invalid' ||
          row.disposition === 'duplicate_in_file' ||
          row.disposition === 'skipped_empty' ||
          row.warnings.length > 0
        );
      }
      return true;
    });
    return list.slice(0, 60);
  }, [analysis, previewFilter]);

  if (!activeTenant) return null;

  const handleConfirmImport = async () => {
    if (!analysis || indexedRows.length === 0) return;
    if (!mappingCheck.valid) {
      setParseError(
        `Map all required fields before importing: ${mappingCheck.missingRequired.join(', ')}.`,
      );
      return;
    }
    if (analysis.allWriteCards.length === 0) {
      setParseError(
        'No valid job cards were found to import. Check the validation errors below or download the error report.',
      );
      return;
    }

    setParseError('');
    setImporting(true);

    const batchId = `batch_${Date.now()}`;
    const now = new Date().toISOString();
    const executionPlan = analyzeAndPrepareImport({
      rows: indexedRows,
      mapping,
      tenantId: activeTenant.id,
      existingJobCards: tenantJobCards,
      batchId,
      timestampIso: now,
    });

    const totalBatches = Math.max(1, Math.ceil(executionPlan.allWriteCards.length / 200));
    setBatchProgress({ completed: 0, total: totalBatches });

    const batch: ImportBatch = {
      id: batchId,
      tenantId: activeTenant.id,
      fileName: fileName || 'uploaded-sheet.xlsx',
      sheetName: selectedSheet,
      importedAt: now,
      totalRows: executionPlan.summary.totalScanned,
      importedCount: executionPlan.summary.validNewCount,
      updatedCount: executionPlan.summary.updatedExistingCount,
      duplicateCount: executionPlan.summary.duplicateInFileCount,
      deliveredCount: executionPlan.summary.deliveredConfirmedCount,
      skippedCount: executionPlan.summary.skippedEmptyCount,
      failedCount: executionPlan.summary.invalidCount,
    };

    try {
      if (saveMappingForFuture) {
        await saveGarageImportMapping(activeTenant.id, mapping);
      }

      await importJobCardsForActiveTenant(
        batch,
        executionPlan.allWriteCards,
        (completed, total) => {
          setBatchProgress({ completed, total });
        },
      );

      setCompletedSummary({
        fileName: batch.fileName,
        sheetName: selectedSheet,
        garageName: activeTenant.branding.displayName,
        batchCount: totalBatches,
        summary: executionPlan.summary,
        errorReportRows: executionPlan.errorReportRows,
      });

      setWorkbook(null);
      setSheetNames([]);
      setSelectedSheet('');
      setRawMatrix([]);
      setIndexedRows([]);
      setHeaders([]);
      setFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to save imported job cards to Supabase.',
      );
    } finally {
      setImporting(false);
      setBatchProgress(null);
    }
  };

  const resetCurrentFile = () => {
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setRawMatrix([]);
    setIndexedRows([]);
    setHeaders([]);
    setFileName('');
    setParseError('');
    setMappingSavedNotice('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Authorized Garage & Header Actions */}
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <Building2 className="h-3.5 w-3.5 text-navy-900" aria-hidden="true" />
            <span>Authorized Garage</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-navy-900">
              {activeTenant.branding.displayName}
            </span>
            {activeTenant.savedImportMapping && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 font-medium">Saved column mapping active</span>
              </>
            )}
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900 sm:text-xl">
            Flexible Excel Job Card Import
          </h2>
          <p className="text-sm text-slate-600">
            Import .xlsx, .xls, or .csv exports from Autorox or any DMS. Records stay isolated to
            your authorized garage and deduplicate by Job Card Number.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center shrink-0">
          {authorizedTenants.length > 1 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="import-garage-select" className="sr-only">
                Select authorized garage
              </label>
              <select
                id="import-garage-select"
                value={activeTenant.id}
                onChange={(e) => void switchActiveGarage(e.target.value)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900"
              >
                {authorizedTenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.branding.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownloadSampleCsv}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Download Sample CSV</span>
          </button>
        </div>
      </section>

      {/* Step 12: Import Summary */}
      {completedSummary && (
        <section
          role="status"
          className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:p-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
                aria-hidden="true"
              />
              <div>
                <h3 className="font-display text-base font-bold text-emerald-950">
                  Import Complete · {completedSummary.garageName}
                </h3>
                <p className="mt-0.5 text-xs text-emerald-800">
                  {completedSummary.fileName}
                  {completedSummary.sheetName ? ` · Sheet: ${completedSummary.sheetName}` : ''} ·{' '}
                  Processed in {completedSummary.batchCount}{' '}
                  {completedSummary.batchCount === 1 ? 'batch' : 'batches'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {completedSummary.errorReportRows.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadErrorReport(
                      completedSummary.errorReportRows,
                      completedSummary.fileName,
                    )
                  }
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 whitespace-nowrap"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>
                    Download Error Report ({completedSummary.errorReportRows.length})
                  </span>
                </button>
              )}
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

          <div className="grid grid-cols-2 divide-y divide-emerald-200 border-t border-emerald-200 pt-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-6">
            <div className="py-2 pr-3 sm:px-3 sm:py-0 sm:first:pl-0">
              <p className="text-xs text-emerald-900/75">New Imported</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                {completedSummary.summary.validNewCount}
              </p>
            </div>
            <div className="py-2 pl-3 sm:px-3 sm:py-0">
              <p className="text-xs text-emerald-900/75">Existing Merged</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                {completedSummary.summary.updatedExistingCount}
              </p>
            </div>
            <div className="py-2 pr-3 sm:px-3 sm:py-0">
              <p className="text-xs text-emerald-900/75">Verified Delivered</p>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-800 tabular-nums">
                {completedSummary.summary.deliveredConfirmedCount}
              </p>
            </div>
            <div className="py-2 pl-3 sm:px-3 sm:py-0">
              <p className="text-xs text-emerald-900/75">Dates Preserved</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                {completedSummary.summary.preservedDeliveryCount}
              </p>
            </div>
            <div className="py-2 pr-3 sm:px-3 sm:py-0">
              <p className="text-xs text-emerald-900/75">Duplicates Skipped</p>
              <p className="mt-1 font-mono text-lg font-bold text-amber-800 tabular-nums">
                {completedSummary.summary.duplicateInFileCount}
              </p>
            </div>
            <div className="py-2 pl-3 sm:px-3 sm:py-0">
              <p className="text-xs text-emerald-900/75">Invalid / Empty</p>
              <p className="mt-1 font-mono text-lg font-bold text-red-700 tabular-nums">
                {completedSummary.summary.invalidCount + completedSummary.summary.skippedEmptyCount}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Step 2: Upload Excel / CSV Dropzone */}
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          void handleFileChange(dropped);
        }}
        className={`rounded-2xl border border-dashed p-6 text-center transition-colors sm:p-8 ${
          isDragging ? 'border-navy-900 bg-slate-50' : 'border-slate-300 bg-white'
        }`}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-navy-900">
          <Upload className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="font-display mt-4 text-base font-semibold text-slate-900">
          {fileName ? `Loaded: ${fileName}` : 'Upload Job Card Excel or CSV File'}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Supports .xlsx, .xls, and .csv · Drag and drop on desktop or tap to select on mobile
        </p>

        <input
          ref={fileInputRef}
          id="excel-file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => void handleFileChange(e.target.files?.[0])}
          className="sr-only"
        />
        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <label
            htmlFor="excel-file-input"
            className="inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-navy-800 sm:w-auto"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            <span>{fileName ? 'Choose Different File' : 'Choose Spreadsheet File'}</span>
          </label>

          {fileName && (
            <button
              type="button"
              onClick={resetCurrentFile}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto"
            >
              Clear File
            </button>
          )}
        </div>

        {parseError && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-600">
            {parseError}
          </p>
        )}
      </section>

      {/* Step 3 & 4: Worksheet Selector & Detected Headings Row */}
      {workbook && sheetNames.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="sheet-select"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
                >
                  <Layers className="h-3.5 w-3.5 text-navy-900" aria-hidden="true" />
                  <span>Spreadsheet Sheet ({sheetNames.length} available)</span>
                </label>
                <select
                  id="sheet-select"
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  {sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="header-row-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Column Headings Row (Auto-detected: Row {detectedHeaderRow + 1})
                </label>
                <select
                  id="header-row-select"
                  value={headerRowOverride ?? detectedHeaderRow}
                  onChange={(e) => handleHeaderRowChange(Number(e.target.value))}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  {rawMatrix.slice(0, 10).map((row, idx) => {
                    const sample = Array.isArray(row)
                      ? row
                          .filter((c) => String(c ?? '').trim().length > 0)
                          .slice(0, 3)
                          .join(', ')
                      : '';
                    return (
                      <option key={idx} value={idx}>
                        Row {idx + 1}
                        {sample ? ` — ${sample.slice(0, 48)}` : ' (Blank)'}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <p className="text-xs text-slate-500 tabular-nums">
              {headers.length} columns · {indexedRows.length} data rows detected
            </p>
          </div>
        </section>
      )}

      {/* Step 5 & 6: Flexible Column Mapping (4 Required + 8 Optional) & Save Mapping */}
      {headers.length > 0 && indexedRows.length > 0 && (
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Map Spreadsheet Columns
              </h3>
              <p className="text-xs text-slate-600">
                Auto-suggested from your file headings
                {activeTenant.savedImportMapping ? ' and saved garage mapping' : ''}. Adjust any
                column manually before importing.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMapping(suggestFlexibleColumnMapping(headers));
                  setMappingSavedNotice('');
                }}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Re-Run Auto-Suggest</span>
              </button>

              <button
                type="button"
                onClick={() => void handleSaveMappingNow()}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-navy-900 bg-white px-3.5 text-xs font-semibold text-navy-900 hover:bg-slate-50 whitespace-nowrap"
              >
                <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Save Mapping for Future Imports</span>
              </button>
            </div>
          </div>

          {mappingSavedNotice && (
            <p role="status" className="text-xs font-medium text-emerald-700">
              {mappingSavedNotice}
            </p>
          )}

          {/* Required Fields (4) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-900">
                Required Fields (All 4 must be mapped)
              </h4>
              {!mappingCheck.valid && (
                <span className="text-xs font-medium text-red-600">
                  Missing: {mappingCheck.missingRequired.join(', ')}
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {REQUIRED_IMPORT_FIELDS.map((field) => {
                const value = mapping[field.key] ?? '';
                return (
                  <div key={field.key}>
                    <label
                      htmlFor={`map-${field.key}`}
                      className="block text-xs font-semibold text-slate-800"
                    >
                      {field.label} <span className="text-red-600">*</span>
                    </label>
                    <select
                      id={`map-${field.key}`}
                      value={value}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className={`mt-1 min-h-[44px] w-full rounded-xl border bg-white px-3 text-sm text-slate-900 ${
                        value ? 'border-slate-300' : 'border-red-400'
                      }`}
                    >
                      <option value="">-- Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">{field.hint}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional Fields (8) */}
          <div className="space-y-3 border-t border-slate-100 pt-5">
            <h4 className="text-xs font-semibold text-slate-700">
              Optional Fields (Blank Excel cells never overwrite existing data)
            </h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {OPTIONAL_IMPORT_FIELDS.map((field) => (
                <div key={field.key}>
                  <label
                    htmlFor={`map-${field.key}`}
                    className="block text-xs font-medium text-slate-700"
                  >
                    {field.label}
                  </label>
                  <select
                    id={`map-${field.key}`}
                    value={mapping[field.key] ?? ''}
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
                  <p className="mt-1 text-[11px] text-slate-500">{field.hint}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Save mapping preference checkbox + safety rule callout */}
          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={saveMappingForFuture}
                onChange={(e) => setSaveMappingForFuture(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-navy-900"
              />
              <span>Remember this column mapping for future {activeTenant.branding.displayName} imports</span>
            </label>

            <p className="text-xs text-slate-500">
              Delivery requires both explicit Delivered status and a valid Delivery Date.
            </p>
          </div>
        </section>
      )}

      {/* Step 7, 8, 9 & 10: Preview, Validation, Duplicates & Batch Import Action */}
      {analysis && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Validation Preview &amp; Duplicate Check
              </h3>
              <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
                {analysis.summary.validNewCount} new · {analysis.summary.updatedExistingCount}{' '}
                existing updates · {analysis.summary.duplicateInFileCount} duplicate rows blocked ·{' '}
                {analysis.summary.invalidCount} invalid · {analysis.summary.skippedEmptyCount} empty
                skipped
              </p>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              {analysis.errorReportRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleDownloadErrorReport(analysis.errorReportRows, fileName)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                >
                  <FileWarning className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  <span>Download Error Report ({analysis.errorReportRows.length})</span>
                </button>
              )}

              <button
                type="button"
                disabled={
                  importing || !mappingCheck.valid || analysis.allWriteCards.length === 0
                }
                onClick={() => void handleConfirmImport()}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                <span>
                  {importing && batchProgress
                    ? `Importing Batch ${batchProgress.completed}/${batchProgress.total}...`
                    : `Confirm Import (${analysis.allWriteCards.length} Records)`}
                </span>
              </button>
            </div>
          </div>

          {/* Batch progress bar for large files */}
          {importing && batchProgress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium text-slate-700 tabular-nums">
                <span>Saving batched records to {activeTenant.branding.displayName}</span>
                <span>
                  Batch {batchProgress.completed} of {batchProgress.total}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-emerald-600 transition-all"
                  style={{
                    width: `${Math.round((batchProgress.completed / Math.max(1, batchProgress.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: `All Rows (${analysis.summary.totalScanned})` },
                {
                  id: 'ready',
                  label: `Ready (${analysis.summary.validNewCount + analysis.summary.updatedExistingCount})`,
                },
                {
                  id: 'duplicates',
                  label: `Duplicates (${analysis.summary.duplicateInFileCount + analysis.summary.updatedExistingCount})`,
                },
                {
                  id: 'issues',
                  label: `Invalid & Warnings (${analysis.errorReportRows.length})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPreviewFilter(tab.id)}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums whitespace-nowrap ${
                  previewFilter === tab.id
                    ? 'bg-white text-navy-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {analysis.summary.deliveryDateMissingCount > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <p>
                {analysis.summary.deliveryDateMissingCount} row(s) have a Delivered status without a
                valid Delivery Date. Per safety rules, they will be imported as{' '}
                <strong>Not Delivered</strong> until a valid delivery date is provided or verified.
              </p>
            </div>
          )}

          {/* Desktop Preview Table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3.5 py-2.5">Row</th>
                  <th className="px-3.5 py-2.5">Import Check</th>
                  <th className="px-3.5 py-2.5">Job Card</th>
                  <th className="px-3.5 py-2.5">Customer &amp; Mobile</th>
                  <th className="px-3.5 py-2.5">Vehicle</th>
                  <th className="px-3.5 py-2.5">Status &amp; Delivery Date</th>
                  <th className="px-3.5 py-2.5">Advisor / Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPreviewRows.map((row) => (
                  <tr key={row.rowNumber} className="align-top hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5 font-mono text-slate-500 tabular-nums">
                      #{row.rowNumber}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {row.disposition === 'new' && (
                        <span className="font-semibold text-emerald-700">New Record</span>
                      )}
                      {row.disposition === 'update' && (
                        <span className="font-semibold text-navy-900">Existing · Merge</span>
                      )}
                      {row.disposition === 'duplicate_in_file' && (
                        <span className="font-semibold text-amber-700">Duplicate in File</span>
                      )}
                      {row.disposition === 'invalid' && (
                        <span className="font-semibold text-red-700">Invalid</span>
                      )}
                      {row.disposition === 'skipped_empty' && (
                        <span className="text-slate-500">Empty Skipped</span>
                      )}
                      {row.errors.length > 0 && (
                        <p className="mt-1 text-[11px] text-red-600">{row.errors.join(' · ')}</p>
                      )}
                      {row.warnings.length > 0 && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          {row.warnings.join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono font-semibold text-slate-900">
                      {row.jobCardNumber || '—'}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <p className="font-medium text-slate-900">{row.customerName || '—'}</p>
                      <p className="font-mono text-slate-500">{row.phoneNumber || '—'}</p>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <p className="font-mono font-medium text-slate-900">
                        {row.vehicleRegistration || '—'}
                      </p>
                      <p className="text-slate-500">
                        {[row.card?.vehicleBrand, row.card?.vehicleModel]
                          .filter(Boolean)
                          .join(' ') || '—'}
                      </p>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <p className="text-slate-700">{row.rawStatus || 'Open'}</p>
                      <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {row.card?.isDelivered && row.card.deliveredAt
                          ? `Delivered: ${row.card.deliveredAt.slice(0, 10)}`
                          : 'Not marked delivered'}
                      </p>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600 tabular-nums">
                      <p>{row.card?.serviceAdvisor || '—'}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {[
                          row.card?.invoiceNumber,
                          row.card?.amount !== null && row.card?.amount !== undefined
                            ? `₹${row.card.amount.toLocaleString()}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Preview Cards (390px friendly) */}
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 md:hidden">
            {filteredPreviewRows.map((row) => (
              <li key={row.rowNumber} className="space-y-2 p-4 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold text-slate-900">
                      Row #{row.rowNumber} · {row.jobCardNumber || 'Missing JC #'}
                    </p>
                    <p className="mt-0.5 font-medium text-slate-800">
                      {row.customerName || 'Missing Customer'} · {row.phoneNumber || 'No Mobile'}
                    </p>
                  </div>
                  <span
                    className={`font-semibold shrink-0 ${
                      row.disposition === 'new'
                        ? 'text-emerald-700'
                        : row.disposition === 'update'
                          ? 'text-navy-900'
                          : row.disposition === 'invalid'
                            ? 'text-red-700'
                            : 'text-amber-700'
                    }`}
                  >
                    {row.disposition === 'new'
                      ? 'New'
                      : row.disposition === 'update'
                        ? 'Merge'
                        : row.disposition === 'duplicate_in_file'
                          ? 'Duplicate'
                          : row.disposition === 'invalid'
                            ? 'Invalid'
                            : 'Skipped'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
                  <span className="font-mono">{row.vehicleRegistration || 'No Reg'}</span>
                  <span>
                    {row.card?.isDelivered && row.card.deliveredAt
                      ? `Delivered (${row.card.deliveredAt.slice(0, 10)})`
                      : row.rawStatus || 'Open'}
                  </span>
                </div>

                {row.errors.length > 0 && (
                  <p className="text-red-600">{row.errors.join(' · ')}</p>
                )}
                {row.warnings.length > 0 && (
                  <p className="text-amber-700">{row.warnings.join(' · ')}</p>
                )}
              </li>
            ))}
          </ul>

          {analysis.rowResults.length > 60 && (
            <p className="text-xs text-slate-500 tabular-nums">
              Showing first {filteredPreviewRows.length} rows of {analysis.rowResults.length} total
              rows for fast browser preview. All valid rows will be imported in batches of 200.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
