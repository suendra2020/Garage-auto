import type {
  DashboardDateFilter,
  ImportBatch,
  JobCard,
  WhatsAppMessageLog,
} from '../types/garage';
import { isDeliveredStatus, scopeByTenant } from './tenantLogic';

export type JobCardStage = 'pending' | 'in_progress' | 'delivered';

const IN_PROGRESS_TOKENS = [
  'in progress',
  'work in progress',
  'wip',
  'servicing',
  'washing',
  'inspection',
  'quality check',
  'qc',
  'ready for delivery',
  'ready',
  'repairing',
  'diagnosed',
];

/**
 * Classifies a job card into Pending, In-Progress, or Delivered.
 */
export function classifyJobCardStage(
  rawStatus: string,
  isDeliveredFlag: boolean,
): JobCardStage {
  if (isDeliveredFlag || isDeliveredStatus(rawStatus)) {
    return 'delivered';
  }
  const normalized = rawStatus.trim().toLowerCase();
  if (normalized && IN_PROGRESS_TOKENS.some((token) => normalized.includes(token))) {
    return 'in_progress';
  }
  return 'pending';
}

export function toLocalDateKey(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toLocalMonthKey(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const dateKey = toLocalDateKey(value);
  return dateKey ? dateKey.slice(0, 7) : '';
}

export function createDefaultDateFilter(referenceDate = new Date()): DashboardDateFilter {
  return {
    period: 'all',
    selectedDate: toLocalDateKey(referenceDate),
    selectedMonth: toLocalMonthKey(referenceDate),
  };
}

export function matchesDashboardDateFilter(
  timestamp: string | null | undefined,
  filter: DashboardDateFilter,
): boolean {
  if (filter.period === 'all') {
    return true;
  }
  if (!timestamp) {
    return false;
  }
  if (filter.period === 'daily') {
    return toLocalDateKey(timestamp) === filter.selectedDate;
  }
  if (filter.period === 'monthly') {
    return toLocalMonthKey(timestamp) === filter.selectedMonth;
  }
  return true;
}

export function getJobCardReferenceTimestamp(card: JobCard): string | null {
  return card.deliveredAt || card.importedAt || card.createdAt || null;
}

export function isWhatsAppSentStatus(status: WhatsAppMessageLog['status']): boolean {
  return status === 'sent' || status === 'delivered' || status === 'read';
}

export function isWhatsAppDeliveredStatus(status: WhatsAppMessageLog['status']): boolean {
  return status === 'delivered' || status === 'read';
}

export interface GarageDashboardStats {
  totalImportedJobCards: number;
  pendingJobCards: number;
  inProgressJobCards: number;
  deliveredVehicles: number;
  whatsappMessagesSent: number;
  whatsappMessagesDelivered: number;
  whatsappMessagesFailed: number;
  whatsappDraftsPrepared: number;
  todaysDeliveredVehicles: JobCard[];
  recentImports: ImportBatch[];
  recentWhatsAppActivity: WhatsAppMessageLog[];
  hasAnyRecordsInGarage: boolean;
  hasRecordsInFilter: boolean;
}

export function computeGarageDashboardStats(params: {
  tenantId: string | null | undefined;
  jobCards: readonly JobCard[];
  importBatches: readonly ImportBatch[];
  whatsappLogs: readonly WhatsAppMessageLog[];
  filter: DashboardDateFilter;
  referenceDate?: Date;
}): GarageDashboardStats {
  const { tenantId, jobCards, importBatches, whatsappLogs, filter } = params;
  const referenceDate = params.referenceDate ?? new Date();
  const todayKey = toLocalDateKey(referenceDate);

  const scopedCards = scopeByTenant(jobCards, tenantId);
  const scopedImports = scopeByTenant(importBatches, tenantId);
  const scopedLogs = scopeByTenant(whatsappLogs, tenantId);

  const filteredCards = scopedCards.filter((card) =>
    matchesDashboardDateFilter(getJobCardReferenceTimestamp(card), filter),
  );
  const filteredLogs = scopedLogs.filter((log) =>
    matchesDashboardDateFilter(log.createdAt, filter),
  );
  const filteredImports = scopedImports.filter((batch) =>
    matchesDashboardDateFilter(batch.importedAt, filter),
  );

  let pendingJobCards = 0;
  let inProgressJobCards = 0;
  let deliveredVehicles = 0;

  for (const card of filteredCards) {
    const stage = classifyJobCardStage(card.rawStatus, card.isDelivered);
    if (stage === 'delivered') {
      deliveredVehicles += 1;
    } else if (stage === 'in_progress') {
      inProgressJobCards += 1;
    } else {
      pendingJobCards += 1;
    }
  }

  let whatsappMessagesSent = 0;
  let whatsappMessagesDelivered = 0;
  let whatsappMessagesFailed = 0;
  let whatsappDraftsPrepared = 0;

  for (const log of filteredLogs) {
    if (isWhatsAppSentStatus(log.status)) {
      whatsappMessagesSent += 1;
    }
    if (isWhatsAppDeliveredStatus(log.status)) {
      whatsappMessagesDelivered += 1;
    }
    if (log.status === 'failed') {
      whatsappMessagesFailed += 1;
    }
    if (
      log.status === 'draft_not_sent' ||
      log.status === 'draft_not_sent_api_disconnected' ||
      log.status === 'queued'
    ) {
      whatsappDraftsPrepared += 1;
    }
  }

  const todaysDeliveredVehicles = scopedCards.filter((card) => {
    const stage = classifyJobCardStage(card.rawStatus, card.isDelivered);
    if (stage !== 'delivered') return false;
    const deliveredDateKey = toLocalDateKey(card.deliveredAt || card.importedAt || card.createdAt);
    return deliveredDateKey === todayKey;
  });

  const recentImports = [...filteredImports].sort(
    (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime(),
  );

  const recentWhatsAppActivity = [...filteredLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const hasAnyRecordsInGarage =
    scopedCards.length > 0 || scopedImports.length > 0 || scopedLogs.length > 0;
  const hasRecordsInFilter =
    filteredCards.length > 0 || filteredImports.length > 0 || filteredLogs.length > 0;

  return {
    totalImportedJobCards: filteredCards.length,
    pendingJobCards,
    inProgressJobCards,
    deliveredVehicles,
    whatsappMessagesSent,
    whatsappMessagesDelivered,
    whatsappMessagesFailed,
    whatsappDraftsPrepared,
    todaysDeliveredVehicles,
    recentImports,
    recentWhatsAppActivity,
    hasAnyRecordsInGarage,
    hasRecordsInFilter,
  };
}

export interface TrendBucket {
  key: string;
  label: string;
  deliveredCount: number;
  whatsappSentCount: number;
  importedCount: number;
}

/**
 * Builds a concise 7-day or monthly weekly-bucket activity series from real records.
 */
export function buildDashboardTrendSeries(params: {
  tenantId: string | null | undefined;
  jobCards: readonly JobCard[];
  whatsappLogs: readonly WhatsAppMessageLog[];
  filter: DashboardDateFilter;
  referenceDate?: Date;
}): TrendBucket[] {
  const { tenantId, jobCards, whatsappLogs, filter } = params;
  const scopedCards = scopeByTenant(jobCards, tenantId);
  const scopedLogs = scopeByTenant(whatsappLogs, tenantId);

  if (filter.period === 'monthly') {
    const monthKey = filter.selectedMonth || toLocalMonthKey(params.referenceDate ?? new Date());
    const [yStr, mStr] = monthKey.split('-');
    const year = Number(yStr) || new Date().getFullYear();
    const monthIndex = (Number(mStr) || 1) - 1;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const weekRanges = [
      { label: 'Days 1–7', start: 1, end: 7 },
      { label: 'Days 8–14', start: 8, end: 14 },
      { label: 'Days 15–21', start: 15, end: 21 },
      { label: `Days 22–${daysInMonth}`, start: 22, end: daysInMonth },
    ];

    return weekRanges.map((range, idx) => {
      const bucketKey = `${monthKey}-w${idx + 1}`;
      const matchDay = (ts: string | null | undefined) => {
        const dk = toLocalDateKey(ts);
        if (!dk || !dk.startsWith(monthKey)) return false;
        const day = Number(dk.slice(8, 10));
        return day >= range.start && day <= range.end;
      };

      const cardsInBucket = scopedCards.filter((c) => matchDay(getJobCardReferenceTimestamp(c)));
      const deliveredCount = cardsInBucket.filter(
        (c) => classifyJobCardStage(c.rawStatus, c.isDelivered) === 'delivered',
      ).length;
      const whatsappSentCount = scopedLogs.filter(
        (l) => isWhatsAppSentStatus(l.status) && matchDay(l.createdAt),
      ).length;

      return {
        key: bucketKey,
        label: range.label,
        deliveredCount,
        whatsappSentCount,
        importedCount: cardsInBucket.length,
      };
    });
  }

  // Daily or All Time: 7-day window ending on selectedDate (or today)
  const anchorStr =
    filter.period === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(filter.selectedDate)
      ? filter.selectedDate
      : toLocalDateKey(params.referenceDate ?? new Date());
  const [ay, am, ad] = anchorStr.split('-').map(Number);
  const anchor = new Date(ay, (am || 1) - 1, ad || 1);

  const buckets: TrendBucket[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - offset);
    const dk = toLocalDateKey(d);
    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const cardsOnDay = scopedCards.filter(
      (c) => toLocalDateKey(getJobCardReferenceTimestamp(c)) === dk,
    );
    const deliveredCount = cardsOnDay.filter(
      (c) => classifyJobCardStage(c.rawStatus, c.isDelivered) === 'delivered',
    ).length;
    const whatsappSentCount = scopedLogs.filter(
      (l) => isWhatsAppSentStatus(l.status) && toLocalDateKey(l.createdAt) === dk,
    ).length;

    buckets.push({
      key: dk,
      label,
      deliveredCount,
      whatsappSentCount,
      importedCount: cardsOnDay.length,
    });
  }
  return buckets;
}
