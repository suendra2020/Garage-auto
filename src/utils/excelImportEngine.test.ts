import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAndPrepareImport,
  buildErrorReportCsv,
  chunkArray,
  extractSheetTable,
  isMappingComplete,
  parseAmountValue,
  parseExcelDeliveryDate,
  suggestFlexibleColumnMapping,
} from './excelImportEngine';
import type { JobCard } from '../types/garage';

test('extractSheetTable detects real header row past top Autorox report banner rows', () => {
  const matrix: unknown[][] = [
    ['Autorox Job Card Export - Apex Auto Care'],
    ['Generated On: 15-Nov-2026', '', 'Branch: Pune'],
    [],
    ['RO No', 'Party Name', 'Mob No', 'Reg. No', 'Make', 'Model', 'Stage', 'Delivered On', 'SA Name', 'Inv #', 'Grand Total'],
    ['JC-9001', 'Aarav Kulkarni', '+91 9820011223', 'mh12ab1234', 'Hyundai', 'Creta', 'Delivered', '14/11/2026', 'Vikram', 'INV-101', '₹ 8,450.50'],
  ];

  const extracted = extractSheetTable(matrix);
  assert.equal(extracted.headerRowIndex, 3);
  assert.equal(extracted.headers.length, 11);
  assert.equal(extracted.rows.length, 1);
  assert.equal(extracted.rows[0].rowNumber, 5);
  assert.equal(extracted.rows[0].data['RO No'], 'JC-9001');
});

test('suggestFlexibleColumnMapping maps Autorox/DMS columns and honors saved garage mapping', () => {
  const headers = [
    'RO No',
    'Party Name',
    'Mob No',
    'Reg. No',
    'Make',
    'Variant',
    'Work Description',
    'Stage',
    'Delivered On',
    'SA Name',
    'Inv #',
    'Grand Total',
  ];

  const auto = suggestFlexibleColumnMapping(headers);
  assert.equal(auto.jobCardNumber, 'RO No');
  assert.equal(auto.customerName, 'Party Name');
  assert.equal(auto.phoneNumber, 'Mob No');
  assert.equal(auto.vehicleRegistration, 'Reg. No');
  assert.equal(auto.vehicleBrand, 'Make');
  assert.equal(auto.serviceAdvisor, 'SA Name');
  assert.equal(auto.invoiceNumber, 'Inv #');
  assert.equal(auto.amount, 'Grand Total');
  assert.equal(auto.deliveryDate, 'Delivered On');

  assert.equal(isMappingComplete(auto).valid, true);

  // Saved garage mapping takes priority over auto-heuristics
  const customSaved = suggestFlexibleColumnMapping(headers, {
    vehicleModel: 'Variant',
  });
  assert.equal(customSaved.vehicleModel, 'Variant');
});

test('parseExcelDeliveryDate and parseAmountValue parse varied formats and reject invalid ones', () => {
  assert.ok(parseExcelDeliveryDate('2026-11-15')?.startsWith('2026-11-15'));
  assert.ok(parseExcelDeliveryDate('15/11/2026')?.startsWith('2026-11-15'));
  assert.ok(parseExcelDeliveryDate(45976)); // Excel serial date
  assert.equal(parseExcelDeliveryDate(''), null);
  assert.equal(parseExcelDeliveryDate('not-a-date'), null);
  assert.equal(parseExcelDeliveryDate('32/13/2026'), null);

  assert.equal(parseAmountValue('₹ 14,250.75'), 14250.75);
  assert.equal(parseAmountValue('Rs. 5000'), 5000);
  assert.equal(parseAmountValue(''), null);
});

test('analyzeAndPrepareImport enforces required fields, duplicate protection, non-blank merge, preserved delivery date, and strict delivery verification', () => {
  const existingCards: JobCard[] = [
    {
      id: 'existing-1',
      tenantId: 'garage-a',
      importBatchId: 'old-batch',
      jobCardNumber: 'JC-100',
      customerName: 'Suresh Menon',
      phoneNumber: '+919800011111',
      vehicleRegistration: 'KA01AB1234',
      vehicleBrand: 'Honda',
      vehicleModel: 'City ZX',
      serviceType: 'Full Service',
      rawStatus: 'Delivered',
      isDelivered: true,
      deliveredAt: '2026-11-10T10:00:00.000Z',
      serviceAdvisor: 'Ramesh',
      invoiceNumber: 'INV-50',
      amount: 6500,
      whatsappDispatchStatus: 'not_sent',
    },
  ];

  const headers = [
    'JC No',
    'Customer',
    'Mobile',
    'Reg No',
    'Brand',
    'Model',
    'Service',
    'Status',
    'Delivery Date',
    'Advisor',
    'Invoice',
    'Amount',
  ];
  const mapping = suggestFlexibleColumnMapping(headers);

  const rows = [
    // Row 2: Existing JC-100 with blank brand/advisor/date -> must NOT overwrite existing info or confirmed delivery date
    {
      rowNumber: 2,
      data: {
        'JC No': 'JC-100',
        Customer: 'Suresh Menon',
        Mobile: '+91 9800011111',
        'Reg No': 'ka01ab1234',
        Brand: '',
        Model: '',
        Service: '',
        Status: 'In Progress',
        'Delivery Date': '',
        Advisor: '',
        Invoice: '',
        Amount: '',
      },
    },
    // Row 3: New JC-101 with Delivered status AND valid delivery date -> marked delivered
    {
      rowNumber: 3,
      data: {
        'JC No': 'JC-101',
        Customer: 'Meera Iyer',
        Mobile: '+91 9811122233',
        'Reg No': 'mh02cd4455',
        Brand: 'Tata',
        Model: 'Nexon',
        Service: 'AC Service',
        Status: 'Delivered',
        'Delivery Date': '14/11/2026',
        Advisor: 'Karan',
        Invoice: 'INV-88',
        Amount: '4200',
      },
    },
    // Row 4: New JC-102 with Delivered status WITHOUT delivery date -> must NOT auto-mark delivered!
    {
      rowNumber: 4,
      data: {
        'JC No': 'JC-102',
        Customer: 'Rohan Joshi',
        Mobile: '9822334455',
        'Reg No': 'dl01ef9988',
        Brand: 'Maruti',
        Model: 'Baleno',
        Service: 'Alignment',
        Status: 'Delivered',
        'Delivery Date': '',
        Advisor: '',
        Invoice: '',
        Amount: '1500',
      },
    },
    // Row 5: Duplicate JC-101 inside same file -> rejected as duplicate_in_file
    {
      rowNumber: 5,
      data: {
        'JC No': 'jc-101',
        Customer: 'Duplicate Row',
        Mobile: '9811122233',
        'Reg No': 'MH02CD4455',
        Brand: 'Tata',
        Model: 'Nexon',
        Service: 'AC',
        Status: 'Open',
        'Delivery Date': '',
        Advisor: '',
        Invoice: '',
        Amount: '',
      },
    },
    // Row 6: Invalid row (missing phone & vehicle reg)
    {
      rowNumber: 6,
      data: {
        'JC No': 'JC-103',
        Customer: 'Incomplete User',
        Mobile: '123',
        'Reg No': '',
        Brand: '',
        Model: '',
        Service: '',
        Status: 'Open',
        'Delivery Date': '',
        Advisor: '',
        Invoice: '',
        Amount: '',
      },
    },
    // Row 7: Completely blank row -> skipped_empty
    {
      rowNumber: 7,
      data: {
        'JC No': '',
        Customer: '',
        Mobile: '',
        'Reg No': '',
        Brand: '',
        Model: '',
        Service: '',
        Status: '',
        'Delivery Date': '',
        Advisor: '',
        Invoice: '',
        Amount: '',
      },
    },
  ];

  const result = analyzeAndPrepareImport({
    rows,
    mapping,
    tenantId: 'garage-a',
    existingJobCards: existingCards,
    batchId: 'batch-test',
    timestampIso: '2026-11-15T08:00:00.000Z',
  });

  assert.equal(result.summary.updatedExistingCount, 1);
  assert.equal(result.summary.validNewCount, 2);
  assert.equal(result.summary.duplicateInFileCount, 1);
  assert.equal(result.summary.invalidCount, 1);
  assert.equal(result.summary.skippedEmptyCount, 1);
  assert.equal(result.summary.preservedDeliveryCount, 1);
  assert.equal(result.summary.deliveredConfirmedCount, 1);
  assert.equal(result.summary.deliveryDateMissingCount, 1);

  // Verify JC-100 preserved existing non-blank fields & confirmed delivery date
  const updated100 = result.updatedCards[0];
  assert.equal(updated100.vehicleBrand, 'Honda');
  assert.equal(updated100.serviceAdvisor, 'Ramesh');
  assert.equal(updated100.isDelivered, true);
  assert.equal(updated100.deliveredAt, '2026-11-10T10:00:00.000Z');

  // Verify JC-101 IS delivered (status Delivered + valid delivery date)
  const new101 = result.newCards.find((c) => c.jobCardNumber === 'JC-101');
  assert.ok(new101);
  assert.equal(new101.isDelivered, true);
  assert.ok(new101.deliveredAt?.startsWith('2026-11-14'));

  // Verify JC-102 is NOT marked delivered (status Delivered but missing delivery date)
  const new102 = result.newCards.find((c) => c.jobCardNumber === 'JC-102');
  assert.ok(new102);
  assert.equal(new102.isDelivered, false);
  assert.equal(new102.deliveredAt, null);

  // Verify error report CSV includes duplicate, invalid, skipped, and warning
  const csv = buildErrorReportCsv(result.errorReportRows);
  assert.match(csv, /duplicate_in_file/);
  assert.match(csv, /invalid/);
  assert.match(csv, /skipped_empty/);
  assert.match(csv, /JC-102/);
});

test('chunkArray splits large arrays into fixed batches', () => {
  const items = Array.from({ length: 450 }, (_, i) => i + 1);
  const batches = chunkArray(items, 200);
  assert.equal(batches.length, 3);
  assert.equal(batches[0].length, 200);
  assert.equal(batches[1].length, 200);
  assert.equal(batches[2].length, 50);
});
