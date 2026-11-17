import type {
  GarageTenant,
  JobCard,
  MessageTemplate,
  WhatsAppMessageLog,
} from '../types/garage';
import { evaluateCustomerOutreachEligibility } from './jobCardDelivery';
import { normalizePhoneNumber, type TemplateRenderVariables } from './tenantLogic';

export function validateWhatsAppCredentialsInput(input: {
  phoneNumberId: string;
  wabaId: string;
}): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const phoneId = input.phoneNumberId.trim();
  const wabaId = input.wabaId.trim();

  if (!phoneId) {
    errors.phoneNumberId = 'Phone Number ID is required.';
  } else if (!/^\d{6,30}$/.test(phoneId)) {
    errors.phoneNumberId = 'Phone Number ID must be a numeric Meta ID (6–30 digits).';
  }

  if (!wabaId) {
    errors.wabaId = 'WABA Account ID is required.';
  } else if (!/^\d{6,30}$/.test(wabaId)) {
    errors.wabaId = 'WABA Account ID must be a numeric Meta ID (6–30 digits).';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function normalizeWhatsAppRecipientPhone(rawPhone: string): string | null {
  const normalized = normalizePhoneNumber(rawPhone);
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  if (!normalized.startsWith('+') && digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export function buildMetaTemplateBodyParameters(
  templateBody: string,
  vars: TemplateRenderVariables,
): { renderedMessage: string; parameters: string[] } {
  const tokenRegex =
    /\{\{(customer_name|garage_name|vehicle_reg|vehicle_model|job_card_no|google_review_url|instagram_url|\d+)\}\}/g;

  const mapByName: Record<string, string> = {
    customer_name: vars.customerName || 'Customer',
    garage_name: vars.garageName || 'Our Garage',
    vehicle_reg: vars.vehicleReg || '-',
    vehicle_model: vars.vehicleModel || 'your vehicle',
    job_card_no: vars.jobCardNumber || '-',
    google_review_url: vars.googleReviewUrl || '-',
    instagram_url: vars.instagramUrl || '-',
  };

  const positionalFallback = [
    mapByName.customer_name,
    mapByName.vehicle_model,
    mapByName.vehicle_reg,
    mapByName.job_card_no,
    mapByName.garage_name,
    mapByName.google_review_url,
  ];

  const parameters: string[] = [];
  const renderedMessage = templateBody.replace(tokenRegex, (_match, key: string) => {
    let val = '-';
    if (/^\d+$/.test(key)) {
      const idx = Math.max(0, Number(key) - 1);
      val = positionalFallback[idx] ?? '-';
    } else {
      val = mapByName[key] ?? '-';
    }
    parameters.push(val);
    return val;
  });

  return { renderedMessage, parameters };
}

export function validateLiveDispatchPreconditions(params: {
  tenant: GarageTenant | null;
  template: MessageTemplate | null | undefined;
  selectedCards: readonly JobCard[];
  existingLogs: readonly WhatsAppMessageLog[];
}):
  | {
      valid: true;
      eligibleCards: JobCard[];
      skippedReasons: Array<{ jobCardId: string; customerName: string; reason: string }>;
    }
  | { valid: false; error: string } {
  const { tenant, template, selectedCards, existingLogs } = params;

  if (!tenant) {
    return { valid: false, error: 'Active garage workspace not found.' };
  }
  if (tenant.status !== 'active') {
    return { valid: false, error: 'Garage account is suspended or pending activation.' };
  }
  if (
    tenant.whatsappSettings.connectionStatus !== 'connected' ||
    !tenant.whatsappSettings.phoneNumberId.trim() ||
    !tenant.whatsappSettings.wabaId.trim()
  ) {
    return {
      valid: false,
      error:
        'WhatsApp Cloud API is not connected. Run and pass "Test WhatsApp Connection" before sending live messages.',
    };
  }

  if (!template || template.tenantId !== tenant.id) {
    return {
      valid: false,
      error: 'Select a valid WhatsApp template belonging to this garage.',
    };
  }
  if (template.approvalStatus !== 'approved' || !template.metaTemplateName.trim()) {
    return {
      valid: false,
      error:
        'Only Meta-approved templates with a Meta Template Name can be sent externally via WhatsApp Cloud API.',
    };
  }

  if (selectedCards.length === 0) {
    return {
      valid: false,
      error: 'Select at least one delivered customer before sending.',
    };
  }

  const eligibleCards: JobCard[] = [];
  const skippedReasons: Array<{ jobCardId: string; customerName: string; reason: string }> = [];

  for (const card of selectedCards) {
    if (card.tenantId !== tenant.id) {
      skippedReasons.push({
        jobCardId: card.id,
        customerName: card.customerName,
        reason: 'Cross-tenant access denied.',
      });
      continue;
    }
    const eligibility = evaluateCustomerOutreachEligibility(card, existingLogs, tenant.id);
    if (!eligibility.eligible) {
      skippedReasons.push({
        jobCardId: card.id,
        customerName: card.customerName,
        reason: eligibility.reason ?? 'Ineligible for outreach.',
      });
      continue;
    }
    if (!normalizeWhatsAppRecipientPhone(card.phoneNumber)) {
      skippedReasons.push({
        jobCardId: card.id,
        customerName: card.customerName,
        reason: 'Phone number must have 10–15 digits for WhatsApp delivery.',
      });
      continue;
    }
    eligibleCards.push(card);
  }

  if (eligibleCards.length === 0) {
    return {
      valid: false,
      error:
        skippedReasons[0]?.reason ||
        'None of the selected customers are eligible for live WhatsApp delivery.',
    };
  }

  return {
    valid: true,
    eligibleCards,
    skippedReasons,
  };
}

const LOG_STATUS_ORDER: Record<WhatsAppMessageLog['status'], number> = {
  draft_not_sent_api_disconnected: 0,
  draft_not_sent: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 99,
};

export function canTransitionWhatsAppLogStatus(
  currentStatus: WhatsAppMessageLog['status'],
  incomingStatus: 'sent' | 'delivered' | 'read' | 'failed',
): boolean {
  if (incomingStatus === 'failed') {
    return currentStatus !== 'delivered' && currentStatus !== 'read';
  }
  if (currentStatus === 'failed') return false;
  return LOG_STATUS_ORDER[incomingStatus] > LOG_STATUS_ORDER[currentStatus];
}

export function formatWhatsAppLogStatusMeta(status: WhatsAppMessageLog['status']): {
  label: string;
  toneClass: string;
} {
  switch (status) {
    case 'read':
      return { label: 'Read', toneClass: 'text-emerald-700' };
    case 'delivered':
      return { label: 'Delivered', toneClass: 'text-emerald-700' };
    case 'sent':
      return { label: 'Sent (Awaiting Delivery)', toneClass: 'text-navy-900' };
    case 'failed':
      return { label: 'Failed', toneClass: 'text-red-600' };
    case 'queued':
      return { label: 'Queued', toneClass: 'text-slate-700' };
    default:
      return { label: 'Draft Only (Not Sent)', toneClass: 'text-amber-700' };
  }
}
