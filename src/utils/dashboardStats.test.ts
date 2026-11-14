import test from 'node:test';
import assert from 'node:assert/strict';
import type { ImportBatch, JobCard, WhatsAppMessageLog } from '../types/garage';
import {
  buildDashboardTrendSeries,
  classifyJobCardStage,
  computeGarageDashboardStats,
} from './dashboardStats';

const SAMPLE_CARDS: JobCard[] = [
  {
    id: 'jc_1',
    tenantId: 'gar_a',
    importBatchId: 'imp_1',
    jobCardNumber: 'JC-101',
    customerName: 'Aarav Mehta',
    phoneNumber: '+919820011111',
    vehicleRegistration: 'MH12AB1001',
    vehicleBrand: 'Hyundai',
    vehicleModel: 'Creta',
    serviceType: 'Periodic Service',
    rawStatus: 'Open',
    isDelivered: false,
    deliveredAt: null,
    importedAt: '2026-11-14T09:00:00',
  whatsappDispatchStatus: 'not_sent',
  },
  {
    id: 'jc_2',
    tenantId: 'gar_a',
    importBatchId: 'imp_1',
    jobCardNumber: 'JC-102',
    customerName: 'Neha Kulkarni',
    phoneNumber: '+919820022222',
    vehicleRegistration: 'MH12CD2002',
    vehicleBrand: 'Maruti',
    vehicleModel: 'Swift',
    serviceType: 'Brake Pad Replacement',
    rawStatus: 'In Progress',
    isDelivered: false,
    deliveredAt: null,
    importedAt: '2026-11-14T09:30:00',
    whatsappDispatchStatus: 'not_sent',
  },
  {
    id: 'jc_3',
    tenantId: 'gar_a',
    importBatchId: 'imp_1',
    jobCardNumber: 'JC-103',
    customerName: 'Vikram Joshi',
    phoneNumber: '+919820033333',
    vehicleRegistration: 'MH14EF3003',
    vehicleBrand: 'Tata',
    vehicleModel: 'Nexon',
    serviceType: 'Full Service',
    rawStatus: 'Delivered',
    isDelivered: true,
    deliveredAt: '2026-11-14T11:15:00',
    importedAt: '2026-11-14T08:00:00',
    whatsappDispatchStatus: 'draft_prepared',
  },
  {
    id: 'jc_4',
    tenantId: 'gar_a',
    importBatchId: 'imp_0',
    jobCardNumber: 'JC-099',
    customerName: 'Rohan Desai',
    phoneNumber: '+919820044444',
    vehicleRegistration: 'MH12GH4004',
    vehicleBrand: 'Honda',
    vehicleModel: 'City',
    serviceType: 'AC Service',
    rawStatus: 'Delivered',
    isDelivered: true,
    deliveredAt: '2026-11-10T16:00:00',
    importedAt: '2026-11-10T10:00:00',
    whatsappDispatchStatus: 'draft_prepared',
  },
  {
    id: 'jc_other_garage',
    tenantId: 'gar_b',
    importBatchId: 'imp_b',
    jobCardNumber: 'JC-900',
    customerName: 'Garage B Customer',
    phoneNumber: '+919999999999',
    vehicleRegistration: 'KA01ZZ9999',
    vehicleBrand: 'Kia',
    vehicleModel: 'Seltos',
    serviceType: 'Detailing',
    rawStatus: 'Delivered',
    isDelivered: true,
    deliveredAt: '2026-11-14T10:00:00',
    importedAt: '2026-11-14T08:00:00',
    whatsappDispatchStatus: 'not_sent',
  },
];

const SAMPLE_IMPORTS: ImportBatch[] = [
  {
    id: 'imp_1',
    tenantId: 'gar_a',
    fileName: 'nov14_jobs.xlsx',
    importedAt: '2026-11-14T09:00:00',
    totalRows: 3,
    importedCount: 3,
    deliveredCount: 1,
    skippedCount: 0,
    failedCount: 0,
  },
  {
    id: 'imp_b',
    tenantId: 'gar_b',
    fileName: 'garage_b_secret.xlsx',
    importedAt: '2026-11-14T09:00:00',
    totalRows: 1,
    importedCount: 1,
    deliveredCount: 1,
    skippedCount: 0,
    failedCount: 0,
  },
];

const SAMPLE_LOGS: WhatsAppMessageLog[] = [
  {
    id: 'wa_1',
    tenantId: 'gar_a',
    jobCardId: 'jc_3',
    customerName: 'Vikram Joshi',
    phoneNumber: '+919820033333',
    vehicleRegistration: 'MH14EF3003',
    templateName: 'Delivery Notification',
    renderedMessage: 'Delivered',
    status: 'delivered',
    createdAt: '2026-11-14T11:20:00',
  },
  {
    id: 'wa_2',
    tenantId: 'gar_a',
    jobCardId: 'jc_4',
    customerName: 'Rohan Desai',
    phoneNumber: '+919820044444',
    vehicleRegistration: 'MH12GH4004',
    templateName: 'Delivery Notification',
    renderedMessage: 'Delivered',
    status: 'sent',
    createdAt: '2026-11-10T16:10:00',
  },
  {
    id: 'wa_3',
    tenantId: 'gar_a',
    jobCardId: 'jc_2',
    customerName: 'Neha Kulkarni',
    phoneNumber: '+919820022222',
    vehicleRegistration: 'MH12CD2002',
    templateName: 'Service Update',
    renderedMessage: 'Update',
    status: 'failed',
    createdAt: '2026-11-14T10:00:00',
  },
  {
    id: 'wa_4',
    tenantId: 'gar_a',
    jobCardId: 'jc_3',
    customerName: 'Vikram Joshi',
    phoneNumber: '+919820033333',
    vehicleRegistration: 'MH14EF3003',
    templateName: 'Review Invite',
    renderedMessage: 'Draft only',
    status: 'draft_not_sent_api_disconnected',
    createdAt: '2026-11-14T11:25:00',
  },
  {
    id: 'wa_b',
    tenantId: 'gar_b',
    jobCardId: 'jc_other_garage',
    customerName: 'Garage B Customer',
    phoneNumber: '+919999999999',
    vehicleRegistration: 'KA01ZZ9999',
    templateName: 'Delivery',
    renderedMessage: 'Secret',
    status: 'delivered',
    createdAt: '2026-11-14T10:15:00',
  },
];

test('classifyJobCardStage distinguishes pending, in-progress, and delivered accurately', () => {
  assert.equal(classifyJobCardStage('Open', false), 'pending');
  assert.equal(classifyJobCardStage('Pending Review', false), 'pending');
  assert.equal(classifyJobCardStage('In Progress', false), 'in_progress');
  assert.equal(classifyJobCardStage('Washing & QC', false), 'in_progress');
  assert.equal(classifyJobCardStage('Ready for Delivery', false), 'in_progress');
  assert.equal(classifyJobCardStage('Delivered', true), 'delivered');
  assert.equal(classifyJobCardStage('Handed Over', false), 'delivered');
});

test('empty garage returns exact zero statistics without hardcoded demo metrics', () => {
  const stats = computeGarageDashboardStats({
    tenantId: 'gar_empty',
    jobCards: SAMPLE_CARDS,
    importBatches: SAMPLE_IMPORTS,
    whatsappLogs: SAMPLE_LOGS,
    filter: { period: 'all', selectedDate: '2026-11-14', selectedMonth: '2026-11' },
    referenceDate: new Date('2026-11-14T12:00:00'),
  });

  assert.equal(stats.totalImportedJobCards, 0);
  assert.equal(stats.pendingJobCards, 0);
  assert.equal(stats.inProgressJobCards, 0);
  assert.equal(stats.deliveredVehicles, 0);
  assert.equal(stats.whatsappMessagesSent, 0);
  assert.equal(stats.whatsappMessagesDelivered, 0);
  assert.equal(stats.whatsappMessagesFailed, 0);
  assert.equal(stats.todaysDeliveredVehicles.length, 0);
  assert.equal(stats.hasAnyRecordsInGarage, false);
});

test('computes tenant-isolated live stats for all-time, monthly, and daily filters', () => {
  const ref = new Date('2026-11-14T12:00:00');

  const allStats = computeGarageDashboardStats({
    tenantId: 'gar_a',
    jobCards: SAMPLE_CARDS,
    importBatches: SAMPLE_IMPORTS,
    whatsappLogs: SAMPLE_LOGS,
    filter: { period: 'all', selectedDate: '2026-11-14', selectedMonth: '2026-11' },
    referenceDate: ref,
  });

  assert.equal(allStats.totalImportedJobCards, 4);
  assert.equal(allStats.pendingJobCards, 1);
  assert.equal(allStats.inProgressJobCards, 1);
  assert.equal(allStats.deliveredVehicles, 2);
  // wa_1 (delivered) + wa_2 (sent) = 2 sent; wa_3 (failed) + wa_4 (draft) excluded from sent
  assert.equal(allStats.whatsappMessagesSent, 2);
  assert.equal(allStats.whatsappMessagesDelivered, 1);
  assert.equal(allStats.whatsappMessagesFailed, 1);
  assert.equal(allStats.whatsappDraftsPrepared, 1);
  assert.equal(allStats.todaysDeliveredVehicles.length, 1);
  assert.equal(allStats.todaysDeliveredVehicles[0].id, 'jc_3');
  assert.equal(allStats.recentImports.length, 1);

  const dailyStats = computeGarageDashboardStats({
    tenantId: 'gar_a',
    jobCards: SAMPLE_CARDS,
    importBatches: SAMPLE_IMPORTS,
    whatsappLogs: SAMPLE_LOGS,
    filter: { period: 'daily', selectedDate: '2026-11-14', selectedMonth: '2026-11' },
    referenceDate: ref,
  });

  assert.equal(dailyStats.totalImportedJobCards, 3);
  assert.equal(dailyStats.deliveredVehicles, 1);
  assert.equal(dailyStats.whatsappMessagesSent, 1);
  assert.equal(dailyStats.whatsappMessagesDelivered, 1);
  assert.equal(dailyStats.whatsappMessagesFailed, 1);

  const otherMonthStats = computeGarageDashboardStats({
    tenantId: 'gar_a',
    jobCards: SAMPLE_CARDS,
    importBatches: SAMPLE_IMPORTS,
    whatsappLogs: SAMPLE_LOGS,
    filter: { period: 'monthly', selectedDate: '2026-11-14', selectedMonth: '2026-10' },
    referenceDate: ref,
  });
  assert.equal(otherMonthStats.totalImportedJobCards, 0);
  // Today's delivered vehicles remain visible regardless of historical month filter
  assert.equal(otherMonthStats.todaysDeliveredVehicles.length, 1);
});

test('buildDashboardTrendSeries returns 7 daily buckets or 4 monthly buckets scoped to tenant', () => {
  const ref = new Date('2026-11-14T12:00:00');
  const dailySeries = buildDashboardTrendSeries({
    tenantId: 'gar_a',
    jobCards: SAMPLE_CARDS,
    whatsappLogs: SAMPLE_LOGS,
    filter: { period: 'daily', selectedDate: '2026-11-14', selectedMonth: '2026-11' },
    referenceDate: ref,
  });
  assert.equal(dailySeries.length, 7);
  assert.equal(dailySeries[6].key, '2026-11-14');
  assert.equal(dailySeries[6].deliveredCount, 1);
  assert.equal(dailySeries[6].whatsappSentCount, 1);

  const monthlySeries = buildDashboardTrendSeries({
    tenantId: 'gar_a',
    jobCards: SAMPLE_CARDS,
    whatsappLogs: SAMPLE_LOGS,
    filter: { period: 'monthly', selectedDate: '2026-11-14', selectedMonth: '2026-11' },
    referenceDate: ref,
  });
  assert.equal(monthlySeries.length, 4);
  assert.equal(monthlySeries[1].deliveredCount, 2); // Nov 10 + Nov 14
  assert.equal(monthlySeries[1].whatsappSentCount, 2);
});
