import type {
  DashboardDateFilter,
  JobCard,
  UserSession,
  WhatsAppMessageLog,
} from '../types/garage';
import {
  classifyJobCardStage,
  isWhatsAppSentStatus,
  matchesDashboardDateFilter,
} from './dashboardStats';
import {
  canUserAccessTenant,
  isDeliveredStatus,
  normalizePhoneNumber,
  scopeByTenant,
} from './tenantLogic';

export type JobCardFilterStatus =
  | 'all'
  | 'pending'
  | 'in_progress'
  | 'delivered'
  | 'cancelled';

export interface JobCardsFilterCriteria {
  search: string;
  statusFilter: JobCardFilterStatus;
  dateFilter: DashboardDateFilter;
}

export interface DeliveredVehiclesFilterCriteria {
  search: string;
  dateFilter: DashboardDateFilter;
}

export interface CustomerOutreachEligibility {
  eligible: boolean;
  reason: string | null;
}

export interface AnnotatedDeliveredVehicle {
  card: JobCard;
  eligibility: CustomerOutreachEligibility;
}

const CANCELLED_TOKENS = ['cancel', 'canceled', 'cancelled', 'void', 'rejected'];

export function isCancelledStatus(rawStatus: string): boolean {
  const normalized = rawStatus.trim().toLowerCase();
  if (!normalized) return false;
  return CANCELLED_TOKENS.some((token) => normalized.includes(token));
}

export function classifyJobCardFilterStage(
  card: Pick<JobCard, 'rawStatus' | 'isDelivered'>,
): Exclude<JobCardFilterStatus, 'all'> {
  if (isCancelledStatus(card.rawStatus)) {
    return 'cancelled';
  }
  if (card.isDelivered && isDeliveredStatus(card.rawStatus)) {
    return 'delivered';
  }
  const stage = classifyJobCardStage(card.rawStatus, false);
  return stage === 'delivered' ? 'pending' : stage;
}

/**
 * Only authorized garage staff / garage admins belonging to the target garage
 * can confirm vehicle deliveries.
 */
export function isAuthorizedDeliveryConfirmer(
  session: UserSession | null,
  tenantId: string | null | undefined,
): boolean {
  if (!session || !tenantId) return false;
  if (session.role !== 'garage_admin' && session.role !== 'garage_staff') {
    return false;
  }
  return canUserAccessTenant(session, tenantId);
}

/**
 * Strict confirmation gate for the Delivered Vehicles page:
 * excludes pending, in-progress, cancelled, or unconfirmed rows lacking a valid delivery timestamp.
 */
export function isConfirmedDeliveredCard(card: JobCard): boolean {
  if (!card.isDelivered) return false;
  if (isCancelledStatus(card.rawStatus)) return false;
  if (!isDeliveredStatus(card.rawStatus)) return false;
  if (!card.deliveredAt) return false;
  const parsed = new Date(card.deliveredAt);
  return !Number.isNaN(parsed.getTime());
}

export function hasValidMobileNumber(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber) return false;
  const digits = normalizePhoneNumber(phoneNumber).replace(/\D/g, '');
  return digits.length >= 7;
}

export function toDateTimeLocalInputValue(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const target = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  const hours = String(target.getHours()).padStart(2, '0');
  const minutes = String(target.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function validateDeliveryConfirmationInput(input: {
  handoverConfirmed: boolean;
  deliveryDateTimeLocal: string;
}): { valid: true; deliveredAtIso: string } | { valid: false; error: string } {
  if (!input.handoverConfirmed) {
    return {
      valid: false,
      error: 'Confirm actual vehicle handover before saving delivery status.',
    };
  }
  const trimmed = input.deliveryDateTimeLocal.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Enter a valid delivery date and time.',
    };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return {
      valid: false,
      error: 'Delivery date and time is invalid.',
    };
  }
  return {
    valid: true,
    deliveredAtIso: parsed.toISOString(),
  };
}

export function buildConfirmedDeliveryUpdate(params: {
  card: JobCard;
  deliveryDateIso: string;
  confirmedByUserId: string;
  confirmationTimestampIso?: string;
}): JobCard {
  const confirmationTs = params.confirmationTimestampIso ?? new Date().toISOString();
  return {
    ...params.card,
    isDelivered: true,
    rawStatus: 'Delivered',
    deliveredAt: params.deliveryDateIso,
    deliveredBy: params.confirmedByUserId,
    deliveryConfirmedAt: confirmationTs,
  };
}

export function filterJobCardsList(
  cards: readonly JobCard[],
  tenantId: string | null | undefined,
  criteria: JobCardsFilterCriteria,
): JobCard[] {
  const scoped = scopeByTenant(cards, tenantId);
  const query = criteria.search.trim().toLowerCase();

  return scoped.filter((card) => {
    const stage = classifyJobCardFilterStage(card);
    if (criteria.statusFilter !== 'all' && stage !== criteria.statusFilter) {
      return false;
    }

    const dateRef = card.deliveredAt || card.importedAt || card.createdAt || null;
    if (!matchesDashboardDateFilter(dateRef, criteria.dateFilter)) {
      return false;
    }

    if (!query) return true;
    return (
      card.jobCardNumber.toLowerCase().includes(query) ||
      card.customerName.toLowerCase().includes(query) ||
      card.vehicleRegistration.toLowerCase().includes(query) ||
      card.vehicleModel.toLowerCase().includes(query) ||
      card.phoneNumber.toLowerCase().includes(query)
    );
  });
}

/**
 * Evaluates whether a delivered vehicle customer is eligible for WhatsApp outreach selection.
 * Excludes pending/in-progress/cancelled cards, missing/invalid mobile numbers, and customers
 * already successfully notified (sent/delivered/read) for the same delivery event.
 */
export function evaluateCustomerOutreachEligibility(
  card: JobCard,
  whatsappLogs: readonly WhatsAppMessageLog[],
  tenantId: string | null | undefined,
): CustomerOutreachEligibility {
  if (!tenantId || card.tenantId !== tenantId) {
    return { eligible: false, reason: 'Unauthorized garage scope' };
  }
  if (isCancelledStatus(card.rawStatus)) {
    return { eligible: false, reason: 'Cancelled job card' };
  }
  if (!isConfirmedDeliveredCard(card)) {
    return { eligible: false, reason: 'Delivery not confirmed' };
  }
  if (!hasValidMobileNumber(card.phoneNumber)) {
    return { eligible: false, reason: 'Missing or invalid mobile number' };
  }

  const cardPhone = normalizePhoneNumber(card.phoneNumber);
  const cardReg = card.vehicleRegistration.trim().toUpperCase();
  const deliveryEventRef = card.deliveryConfirmedAt || card.deliveredAt;
  const deliveryEventMs = deliveryEventRef ? new Date(deliveryEventRef).getTime() : 0;

  const scopedLogs = scopeByTenant(whatsappLogs, tenantId);
  const alreadyNotified = scopedLogs.some((log) => {
    if (!isWhatsAppSentStatus(log.status)) {
      return false;
    }

    const sameJobCard = Boolean(log.jobCardId && log.jobCardId === card.id);
    const sameCustomerAndVehicle =
      Boolean(cardPhone) &&
      normalizePhoneNumber(log.phoneNumber) === cardPhone &&
      Boolean(cardReg) &&
      log.vehicleRegistration.trim().toUpperCase() === cardReg;

    if (!sameJobCard && !sameCustomerAndVehicle) {
      return false;
    }

    const logMs = new Date(log.createdAt).getTime();
    if (Number.isNaN(logMs) || Number.isNaN(deliveryEventMs)) {
      return sameJobCard;
    }
    return logMs >= deliveryEventMs;
  });

  if (alreadyNotified) {
    return {
      eligible: false,
      reason: 'Already notified for this delivery',
    };
  }

  return { eligible: true, reason: null };
}

export function filterConfirmedDeliveredVehicles(
  cards: readonly JobCard[],
  whatsappLogs: readonly WhatsAppMessageLog[],
  tenantId: string | null | undefined,
  criteria: DeliveredVehiclesFilterCriteria,
): AnnotatedDeliveredVehicle[] {
  const scoped = scopeByTenant(cards, tenantId).filter(isConfirmedDeliveredCard);
  const query = criteria.search.trim().toLowerCase();

  return scoped
    .filter((card) => {
      if (!matchesDashboardDateFilter(card.deliveredAt, criteria.dateFilter)) {
        return false;
      }
      if (!query) return true;
      return (
        card.customerName.toLowerCase().includes(query) ||
        card.vehicleRegistration.toLowerCase().includes(query) ||
        card.jobCardNumber.toLowerCase().includes(query) ||
        card.vehicleModel.toLowerCase().includes(query) ||
        card.phoneNumber.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const timeA = new Date(a.deliveredAt || 0).getTime();
      const timeB = new Date(b.deliveredAt || 0).getTime();
      return timeB - timeA;
    })
    .map((card) => ({
      card,
      eligibility: evaluateCustomerOutreachEligibility(card, whatsappLogs, tenantId),
    }));
}
