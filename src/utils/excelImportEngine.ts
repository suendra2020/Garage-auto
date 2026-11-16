import type {
  ExcelColumnMapping,
  ImportAnalysisSummary,
  ImportErrorReportRow,
  JobCard,
  ValidatedImportRow,
} from '../types/garage';
import { isDeliveredStatus, normalizePhoneNumber } from './tenantLogic';

export interface IndexedSheetRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

export interface ExtractedSheetTable {
  headerRowIndex: number;
  headers: string[];
  rows: IndexedSheetRow[];
}

export const REQUIRED_IMPORT_FIELDS: {
  key: keyof ExcelColumnMapping;
  label: string;
  hint: string;
}[] = [
  { key: 'jobCardNumber', label: 'Job Card Number', hint: 'Unique key with Garage ID (e.g. JC No, RO No)' },
  { key: 'customerName', label: 'Customer Name', hint: 'Vehicle owner or party name' },
  { key: 'phoneNumber', label: 'Customer Mobile Number', hint: 'WhatsApp / contact mobile (min 7 digits)' },
  { key: 'vehicleRegistration', label: 'Vehicle Registration Number', hint: 'Reg plate (e.g. MH02DN4512)' },
];

export const OPTIONAL_IMPORT_FIELDS: {
  key: keyof ExcelColumnMapping;
  label: string;
  hint: string;
}[] = [
  { key: 'vehicleBrand', label: 'Vehicle Brand', hint: 'Make / Manufacturer (e.g. Hyundai, Tata)' },
  { key: 'vehicleModel', label: 'Vehicle Model', hint: 'Model variant (e.g. Creta, Nexon)' },
  { key: 'serviceType', label: 'Service Details', hint: 'Work description / repair type' },
  { key: 'rawStatus', label: 'Job Card Status', hint: 'Open, In Progress, Delivered, Closed' },
  { key: 'deliveryDate', label: 'Delivery Date', hint: 'Required with Delivered status to confirm delivery' },
  { key: 'serviceAdvisor', label: 'Service Advisor', hint: 'Assigned advisor or SA name' },
  { key: 'invoiceNumber', label: 'Invoice Number', hint: 'Bill / invoice reference' },
  { key: 'amount', label: 'Amount', hint: 'Invoice total / bill amount' },
];

export function createEmptyMapping(): ExcelColumnMapping {
  return {
    jobCardNumber: '',
    customerName: '',
    phoneNumber: '',
    vehicleRegistration: '',
    vehicleBrand: '',
    vehicleModel: '',
    serviceType: '',
    rawStatus: '',
    deliveryDate: '',
    serviceAdvisor: '',
    invoiceNumber: '',
    amount: '',
  };
}

const KNOWN_HEADER_HINTS = [
  'job card',
  'jobcard',
  'jc no',
  'ro no',
  'ro number',
  'customer',
  'party',
  'mobile',
  'phone',
  'whatsapp',
  'vehicle',
  'reg',
  'plate',
  'brand',
  'make',
  'model',
  'service',
  'status',
  'stage',
  'delivery',
  'advisor',
  'invoice',
  'bill',
  'amount',
  'total',
];

/**
 * Scans the top rows of a 2D worksheet matrix to detect the real header row
 * (handles Autorox / DMS exports that include title/filter rows at the top).
 */
export function detectHeaderRowIndex(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 15);
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < limit; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    const nonEmptyCells = row
      .map((c) => (c === null || c === undefined ? '' : String(c).trim()))
      .filter((s) => s.length > 0);

    if (nonEmptyCells.length < 2) continue;

    let hintHits = 0;
    const seen = new Set<string>();
    for (const cell of nonEmptyCells) {
      const lower = cell.toLowerCase();
      seen.add(lower);
      if (KNOWN_HEADER_HINTS.some((hint) => lower.includes(hint))) {
        hintHits += 1;
      }
    }

    // Penalize rows that look mostly numeric/date data rather than text headers
    const textLikeCount = nonEmptyCells.filter((c) => /[a-zA-Z]/.test(c)).length;
    const score = hintHits * 10 + seen.size * 2 + textLikeCount;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

export function extractSheetTable(
  matrix: unknown[][],
  forcedHeaderRowIndex?: number,
): ExtractedSheetTable {
  if (!matrix || matrix.length === 0) {
    return { headerRowIndex: 0, headers: [], rows: [] };
  }

  const headerRowIndex =
    typeof forcedHeaderRowIndex === 'number' &&
    forcedHeaderRowIndex >= 0 &&
    forcedHeaderRowIndex < matrix.length
      ? forcedHeaderRowIndex
      : detectHeaderRowIndex(matrix);

  const rawHeaderRow = Array.isArray(matrix[headerRowIndex])
    ? matrix[headerRowIndex]
    : [];

  // Determine widest populated column across header & data rows
  let maxCols = rawHeaderRow.length;
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    if (Array.isArray(matrix[r]) && matrix[r].length > maxCols) {
      maxCols = matrix[r].length;
    }
  }

  const headers: string[] = [];
  const colIndices: number[] = [];
  const usedNames = new Map<string, number>();

  for (let c = 0; c < maxCols; c++) {
    const rawVal = rawHeaderRow[c];
    const trimmed = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();

    // Check if column has any data below header before keeping an unnamed column
    const hasDataInCol = matrix
      .slice(headerRowIndex + 1)
      .some((r) => Array.isArray(r) && String(r[c] ?? '').trim().length > 0);

    if (!trimmed && !hasDataInCol) {
      continue;
    }

    const baseName = trimmed || `Column ${c + 1}`;
    const count = usedNames.get(baseName.toLowerCase()) ?? 0;
    usedNames.set(baseName.toLowerCase(), count + 1);
    const uniqueName = count === 0 ? baseName : `${baseName} (${count + 1})`;

    headers.push(uniqueName);
    colIndices.push(c);
  }

  const rows: IndexedSheetRow[] = [];
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const rowArr = Array.isArray(matrix[r]) ? matrix[r] : [];
    const data: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const colIdx = colIndices[idx];
      data[h] = rowArr[colIdx] ?? '';
    });
    rows.push({
      rowNumber: r + 1, // 1-indexed spreadsheet row number
      data,
    });
  }

  return { headerRowIndex, headers, rows };
}

const FIELD_SYNONYMS: Record<keyof ExcelColumnMapping, string[]> = {
  jobCardNumber: [
    'job card no',
    'job card number',
    'jobcard no',
    'job_card_number',
    'jc no',
    'jc number',
    'jc #',
    'ro no',
    'ro number',
    'repair order',
    'job card',
    'jobcard',
    'job no',
    'card no',
  ],
  customerName: [
    'customer name',
    'client name',
    'party name',
    'owner name',
    'cust name',
    'customer',
    'client',
    'party',
    'name',
  ],
  phoneNumber: [
    'customer mobile number',
    'customer mobile',
    'mobile number',
    'mobile no',
    'whatsapp phone',
    'whatsapp number',
    'whatsapp',
    'contact no',
    'contact number',
    'mob no',
    'phone number',
    'phone no',
    'mobile',
    'phone',
    'contact',
    'tel',
  ],
  vehicleRegistration: [
    'vehicle registration number',
    'vehicle reg no',
    'vehicle reg',
    'vehicle number',
    'registration no',
    'registration number',
    'reg. no',
    'reg no',
    'reg plate',
    'number plate',
    'plate no',
    'registration',
    'reg',
    'vrn',
  ],
  vehicleBrand: ['vehicle brand', 'car brand', 'brand', 'make', 'oem', 'manufacturer'],
  vehicleModel: ['vehicle model', 'car model', 'model name', 'model', 'variant'],
  serviceType: [
    'service details',
    'service type',
    'work details',
    'repair details',
    'job description',
    'service',
    'job type',
    'work',
    'description',
  ],
  rawStatus: [
    'job card status',
    'jc status',
    'ro status',
    'delivery status',
    'work status',
    'status',
    'stage',
    'state',
  ],
  deliveryDate: [
    'delivery date',
    'delivered date',
    'delivered on',
    'handover date',
    'out date',
    'gate out date',
    'closed date',
    'completion date',
    'del date',
  ],
  serviceAdvisor: [
    'service advisor',
    'sa name',
    'advisor name',
    'advisor',
    'sa',
    'assigned to',
  ],
  invoiceNumber: [
    'invoice number',
    'invoice no',
    'inv no',
    'inv #',
    'bill no',
    'bill number',
    'invoice',
  ],
  amount: [
    'invoice amount',
    'total amount',
    'bill amount',
    'grand total',
    'net amount',
    'final amount',
    'amount',
    'total',
  ],
};

function normalizeHeaderToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function suggestFlexibleColumnMapping(
  headers: string[],
  savedMapping?: Partial<ExcelColumnMapping> | null,
): ExcelColumnMapping {
  const result = createEmptyMapping();
  const usedHeaders = new Set<string>();

  // 1. Apply saved mapping entries first when header still exists in this spreadsheet
  if (savedMapping) {
    (Object.keys(result) as (keyof ExcelColumnMapping)[]).forEach((field) => {
      const savedCol = savedMapping[field];
      if (!savedCol) return;
      const exactMatch = headers.find((h) => h === savedCol);
      const caseMatch =
        exactMatch ?? headers.find((h) => normalizeHeaderToken(h) === normalizeHeaderToken(savedCol));
      if (caseMatch && !usedHeaders.has(caseMatch)) {
        result[field] = caseMatch;
        usedHeaders.add(caseMatch);
      }
    });
  }

  const findBestHeader = (keywords: string[]): string => {
    const available = headers.filter((h) => !usedHeaders.has(h));

    for (const kw of keywords) {
      const exact = available.find((h) => normalizeHeaderToken(h) === kw);
      if (exact) return exact;
    }
    for (const kw of keywords) {
      const boundary = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const wordMatch = available.find((h) => boundary.test(normalizeHeaderToken(h)));
      if (wordMatch) return wordMatch;
    }
    for (const kw of keywords) {
      if (kw.length <= 3) continue;
      const partial = available.find((h) => normalizeHeaderToken(h).includes(kw));
      if (partial) return partial;
    }
    return '';
  };

  // 2. Auto-suggest remaining unmapped fields
  (Object.keys(result) as (keyof ExcelColumnMapping)[]).forEach((field) => {
    if (result[field]) return;
    const match = findBestHeader(FIELD_SYNONYMS[field]);
    if (match) {
      result[field] = match;
      usedHeaders.add(match);
    }
  });

  return result;
}

export function isMappingComplete(mapping: ExcelColumnMapping): {
  valid: boolean;
  missingRequired: string[];
} {
  const missingRequired: string[] = [];
  for (const field of REQUIRED_IMPORT_FIELDS) {
    if (!mapping[field.key]?.trim()) {
      missingRequired.push(field.label);
    }
  }
  return {
    valid: missingRequired.length === 0,
    missingRequired,
  };
}

/**
 * Parses Excel serial numbers, ISO dates, DD/MM/YYYY, DD-MM-YYYY, or readable month strings.
 * Returns normalized ISO timestamp or null if blank or invalid.
 */
export function parseExcelDeliveryDate(rawValue: unknown): string | null {
  if (rawValue === null || rawValue === undefined) return null;

  if (rawValue instanceof Date) {
    if (Number.isNaN(rawValue.getTime())) return null;
    const yr = rawValue.getUTCFullYear();
    if (yr < 2000 || yr > 2100) return null;
    return rawValue.toISOString();
  }

  if (typeof rawValue === 'number') {
    // Excel serial date number (1900 epoch; valid modern range ~2000..2100 -> 36526..73050)
    if (!Number.isFinite(rawValue) || rawValue < 36526 || rawValue > 73050) {
      return null;
    }
    const utcMillis = Math.round((rawValue - 25569) * 86400 * 1000);
    const d = new Date(utcMillis);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const trimmed = String(rawValue).trim();
  if (!trimmed) return null;

  // Numeric string representing Excel serial date
  if (/^\d{5}(\.\d+)?$/.test(trimmed)) {
    return parseExcelDeliveryDate(Number(trimmed));
  }

  // ISO format YYYY-MM-DD (optionally with time)
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return buildValidatedUtcIso(year, month, day);
  }

  // DD/MM/YYYY or DD-MM-YYYY (common in India/Autorox DMS exports)
  const dmyMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s.*)?$/.exec(trimmed);
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    let year = Number(dmyMatch[3]);
    if (year < 100) year += 2000;

    // Default DD/MM/YYYY unless second > 12 (then MM/DD/YYYY)
    if (second > 12 && first <= 12) {
      return buildValidatedUtcIso(year, first, second);
    }
    return buildValidatedUtcIso(year, second, first);
  }

  // Fallback native Date parsing (e.g., "15 Nov 2026")
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const yr = parsed.getUTCFullYear();
    if (yr >= 2000 && yr <= 2100) {
      return parsed.toISOString();
    }
  }

  return null;
}

function buildValidatedUtcIso(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt.toISOString();
}

export function parseAmountValue(rawValue: unknown): number | null {
  if (rawValue === null || rawValue === undefined) return null;
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) && rawValue >= 0 ? Math.round(rawValue * 100) / 100 : null;
  }
  const cleaned = String(rawValue)
    .replace(/[₹$€£,\s]/g, '')
    .replace(/^(rs\.?|inr)\s*/i, '')
    .trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : null;
}

function readCellText(row: Record<string, unknown>, columnName?: string): string {
  if (!columnName) return '';
  const val = row[columnName];
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function pickNonBlank(incoming: string, existing: string | undefined, fallback = ''): string {
  const cleanIncoming = incoming.trim();
  if (cleanIncoming) return cleanIncoming;
  const cleanExisting = (existing ?? '').trim();
  return cleanExisting || fallback;
}

export function analyzeAndPrepareImport(params: {
  rows: IndexedSheetRow[];
  mapping: ExcelColumnMapping;
  tenantId: string;
  existingJobCards: readonly JobCard[];
  batchId: string;
  timestampIso?: string;
}): {
  newCards: JobCard[];
  updatedCards: JobCard[];
  allWriteCards: JobCard[];
  rowResults: ValidatedImportRow[];
  errorReportRows: ImportErrorReportRow[];
  summary: ImportAnalysisSummary;
} {
  const {
    rows,
    mapping,
    tenantId,
    existingJobCards,
    batchId,
    timestampIso = new Date().toISOString(),
  } = params;

  const existingByKey = new Map<string, JobCard>();
  existingJobCards
    .filter((c) => c.tenantId === tenantId)
    .forEach((c) => {
      existingByKey.set(c.jobCardNumber.trim().toUpperCase(), c);
    });

  const seenInFile = new Set<string>();
  const newCards: JobCard[] = [];
  const updatedCards: JobCard[] = [];
  const rowResults: ValidatedImportRow[] = [];
  const errorReportRows: ImportErrorReportRow[] = [];

  let skippedEmptyCount = 0;
  let duplicateInFileCount = 0;
  let invalidCount = 0;
  let deliveredConfirmedCount = 0;
  let preservedDeliveryCount = 0;
  let deliveryDateMissingCount = 0;

  rows.forEach((indexedRow, idx) => {
    const raw = indexedRow.data;
    const rowNumber = indexedRow.rowNumber;

    const jobCardNumber = readCellText(raw, mapping.jobCardNumber);
    const customerName = readCellText(raw, mapping.customerName);
    const rawPhone = readCellText(raw, mapping.phoneNumber);
    const phoneNumber = normalizePhoneNumber(rawPhone);
    const vehicleRegistration = readCellText(raw, mapping.vehicleRegistration).toUpperCase();
    const vehicleBrand = readCellText(raw, mapping.vehicleBrand);
    const vehicleModel = readCellText(raw, mapping.vehicleModel);
    const serviceType = readCellText(raw, mapping.serviceType);
    const rawStatus = readCellText(raw, mapping.rawStatus);
    const rawDeliveryDate = mapping.deliveryDate ? raw[mapping.deliveryDate] : '';
    const parsedDeliveryDate = parseExcelDeliveryDate(rawDeliveryDate);
    const serviceAdvisor = readCellText(raw, mapping.serviceAdvisor);
    const invoiceNumber = readCellText(raw, mapping.invoiceNumber);
    const parsedAmount = mapping.amount ? parseAmountValue(raw[mapping.amount]) : null;

    // 1. Check completely blank row across all mapped fields
    const anyMappedValue = [
      jobCardNumber,
      customerName,
      rawPhone,
      vehicleRegistration,
      vehicleBrand,
      vehicleModel,
      serviceType,
      rawStatus,
      String(rawDeliveryDate ?? '').trim(),
      serviceAdvisor,
      invoiceNumber,
    ].some((v) => v.length > 0);

    if (!anyMappedValue) {
      skippedEmptyCount += 1;
      rowResults.push({
        rowNumber,
        disposition: 'skipped_empty',
        jobCardNumber: '',
        customerName: '',
        phoneNumber: '',
        vehicleRegistration: '',
        rawStatus: '',
        parsedDeliveryDate: null,
        errors: [],
        warnings: ['Completely empty spreadsheet row skipped.'],
        card: null,
      });
      errorReportRows.push({
        rowNumber,
        jobCardNumber: '',
        customerName: '',
        vehicleRegistration: '',
        issueType: 'skipped_empty',
        reason: 'Empty row skipped',
      });
      return;
    }

    // 2. Validate required fields
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!jobCardNumber) {
      errors.push('Missing Job Card Number');
    }
    if (!customerName) {
      errors.push('Missing Customer Name');
    }
    const phoneDigits = phoneNumber.replace(/\D/g, '');
    if (!rawPhone) {
      errors.push('Missing Customer Mobile Number');
    } else if (phoneDigits.length < 7) {
      errors.push(`Invalid Mobile Number ("${rawPhone}")`);
    }
    if (!vehicleRegistration) {
      errors.push('Missing Vehicle Registration Number');
    }

    const rawDeliveryDateText = String(rawDeliveryDate ?? '').trim();
    if (rawDeliveryDateText && !parsedDeliveryDate) {
      warnings.push(`Unrecognized delivery date "${rawDeliveryDateText}" ignored`);
    }

    if (errors.length > 0) {
      invalidCount += 1;
      const reason = errors.join('; ');
      rowResults.push({
        rowNumber,
        disposition: 'invalid',
        jobCardNumber,
        customerName,
        phoneNumber,
        vehicleRegistration,
        rawStatus,
        parsedDeliveryDate,
        errors,
        warnings,
        card: null,
      });
      errorReportRows.push({
        rowNumber,
        jobCardNumber,
        customerName,
        vehicleRegistration,
        issueType: 'invalid',
        reason,
      });
      return;
    }

    // 3. Check duplicate within the same spreadsheet file (garage_id + job_card_number)
    const normalizedKey = jobCardNumber.trim().toUpperCase();
    if (seenInFile.has(normalizedKey)) {
      duplicateInFileCount += 1;
      const reason = `Duplicate job card "${jobCardNumber}" inside spreadsheet (skipped to prevent duplicate record)`;
      rowResults.push({
        rowNumber,
        disposition: 'duplicate_in_file',
        jobCardNumber,
        customerName,
        phoneNumber,
        vehicleRegistration,
        rawStatus,
        parsedDeliveryDate,
        errors: [reason],
        warnings: [],
        card: null,
      });
      errorReportRows.push({
        rowNumber,
        jobCardNumber,
        customerName,
        vehicleRegistration,
        issueType: 'duplicate_in_file',
        reason,
      });
      return;
    }
    seenInFile.add(normalizedKey);

    // 4. Evaluate delivery rule: ONLY mark delivered if explicit verified delivery status AND valid delivery date
    const statusSaysDelivered = isDeliveredStatus(rawStatus);
    const verifiedDeliveredFromImport = statusSaysDelivered && parsedDeliveryDate !== null;

    if (statusSaysDelivered && parsedDeliveryDate === null) {
      deliveryDateMissingCount += 1;
      warnings.push(
        'Status indicates Delivered, but valid Delivery Date is missing — vehicle NOT marked delivered automatically.',
      );
      errorReportRows.push({
        rowNumber,
        jobCardNumber,
        customerName,
        vehicleRegistration,
        issueType: 'warning',
        reason: 'Delivered status without valid Delivery Date — kept non-delivered until valid date is provided',
      });
    }

    // 5. Check if record already exists in this garage (merge without overwriting non-blank cells or confirmed delivery date)
    const existing = existingByKey.get(normalizedKey);
    if (existing) {
      const hasConfirmedDelivery = Boolean(existing.isDelivered && existing.deliveredAt);
      let finalIsDelivered = existing.isDelivered;
      let finalDeliveredAt = existing.deliveredAt;

      if (hasConfirmedDelivery) {
        // Preserve confirmed delivery dates already recorded
        finalIsDelivered = true;
        finalDeliveredAt = existing.deliveredAt;
        preservedDeliveryCount += 1;
      } else if (verifiedDeliveredFromImport) {
        finalIsDelivered = true;
        finalDeliveredAt = parsedDeliveryDate;
        deliveredConfirmedCount += 1;
      }

      const mergedCard: JobCard = {
        ...existing,
        importBatchId: batchId,
        customerName: pickNonBlank(customerName, existing.customerName),
        phoneNumber: pickNonBlank(phoneNumber, existing.phoneNumber),
        vehicleRegistration: pickNonBlank(vehicleRegistration, existing.vehicleRegistration),
        vehicleBrand: pickNonBlank(vehicleBrand, existing.vehicleBrand),
        vehicleModel: pickNonBlank(vehicleModel, existing.vehicleModel),
        serviceType: pickNonBlank(serviceType, existing.serviceType),
        rawStatus: hasConfirmedDelivery
          ? existing.rawStatus
          : pickNonBlank(rawStatus, existing.rawStatus, 'Open'),
        isDelivered: finalIsDelivered,
        deliveredAt: finalDeliveredAt,
        serviceAdvisor: pickNonBlank(serviceAdvisor, existing.serviceAdvisor),
        invoiceNumber: pickNonBlank(invoiceNumber, existing.invoiceNumber),
        amount: parsedAmount !== null ? parsedAmount : existing.amount ?? null,
        importedAt: timestampIso,
      };

      updatedCards.push(mergedCard);
      rowResults.push({
        rowNumber,
        disposition: 'update',
        jobCardNumber: mergedCard.jobCardNumber,
        customerName: mergedCard.customerName,
        phoneNumber: mergedCard.phoneNumber,
        vehicleRegistration: mergedCard.vehicleRegistration,
        rawStatus: mergedCard.rawStatus,
        parsedDeliveryDate: mergedCard.deliveredAt,
        errors: [],
        warnings: [
          ...(hasConfirmedDelivery
            ? ['Matched existing job card — confirmed delivery date preserved; non-blank fields merged.']
            : ['Matched existing job card — merged non-blank fields without creating duplicate.']),
          ...warnings,
        ],
        card: mergedCard,
      });
      return;
    }

    // 6. New job card scoped strictly to this tenantId
    if (verifiedDeliveredFromImport) {
      deliveredConfirmedCount += 1;
    }

    const newCard: JobCard = {
      id: `${batchId}_row_${idx + 1}`,
      tenantId,
      importBatchId: batchId,
      jobCardNumber: jobCardNumber.trim(),
      customerName,
      phoneNumber,
      vehicleRegistration,
      vehicleBrand,
      vehicleModel,
      serviceType: serviceType || 'General Service',
      rawStatus: rawStatus || 'Open',
      isDelivered: verifiedDeliveredFromImport,
      deliveredAt: verifiedDeliveredFromImport ? parsedDeliveryDate : null,
      serviceAdvisor,
      invoiceNumber,
      amount: parsedAmount,
      importedAt: timestampIso,
      createdAt: timestampIso,
      whatsappDispatchStatus: 'not_sent',
    };

    newCards.push(newCard);
    rowResults.push({
      rowNumber,
      disposition: 'new',
      jobCardNumber: newCard.jobCardNumber,
      customerName: newCard.customerName,
      phoneNumber: newCard.phoneNumber,
      vehicleRegistration: newCard.vehicleRegistration,
      rawStatus: newCard.rawStatus,
      parsedDeliveryDate: newCard.deliveredAt,
      errors: [],
      warnings,
      card: newCard,
    });
  });

  return {
    newCards,
    updatedCards,
    allWriteCards: [...newCards, ...updatedCards],
    rowResults,
    errorReportRows,
    summary: {
      totalScanned: rows.length,
      validNewCount: newCards.length,
      updatedExistingCount: updatedCards.length,
      duplicateInFileCount,
      invalidCount,
      skippedEmptyCount,
      deliveredConfirmedCount,
      preservedDeliveryCount,
      deliveryDateMissingCount,
    },
  };
}

export function chunkArray<T>(items: readonly T[], batchSize = 200): T[][] {
  if (items.length === 0) return [];
  const size = Math.max(1, batchSize);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function escapeCsvCell(value: string | number): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildErrorReportCsv(errorRows: readonly ImportErrorReportRow[]): string {
  const headers = [
    'Spreadsheet Row',
    'Job Card Number',
    'Customer Name',
    'Vehicle Registration',
    'Issue Type',
    'Details',
  ];
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...errorRows.map((row) =>
      [
        row.rowNumber,
        row.jobCardNumber,
        row.customerName,
        row.vehicleRegistration,
        row.issueType,
        row.reason,
      ]
        .map(escapeCsvCell)
        .join(','),
    ),
  ];
  return lines.join('\n');
}
