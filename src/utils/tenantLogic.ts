import type {
  ExcelColumnMapping,
  GarageRegistrationInput,
  JobCard,
  PlatformRole,
  StaffCreationInput,
  UserSession,
} from '../types/garage';

/**
 * Strictly scopes any tenant-owned record list to the active garage tenant ID.
 * Returns an empty array if no tenantId is provided so data can never leak across tenants.
 */
export function scopeByTenant<T extends { tenantId: string }>(
  records: readonly T[],
  activeTenantId: string | null | undefined,
): T[] {
  if (!activeTenantId) {
    return [];
  }
  return records.filter((item) => item.tenantId === activeTenantId);
}

/**
 * Enforces role-based and multi-garage tenant membership access boundaries.
 */
export function canUserAccessTenant(
  session: UserSession | null,
  targetTenantId: string,
): boolean {
  if (!session || !targetTenantId) {
    return false;
  }
  if (session.role === 'super_admin') {
    return true;
  }
  if (session.authorizedTenantIds?.length) {
    return session.authorizedTenantIds.includes(targetTenantId);
  }
  return session.tenantId === targetTenantId;
}

/**
 * Strictly verifies whether the active user can create/manage staff in the target garage.
 * Garage staff and users from other garages are denied.
 */
export function canManageGarageStaff(
  session: UserSession | null,
  targetTenantId: string,
): boolean {
  if (!session || !targetTenantId) {
    return false;
  }
  if (session.role === 'super_admin') {
    return true;
  }
  if (session.role !== 'garage_admin') {
    return false;
  }
  return canUserAccessTenant(session, targetTenantId);
}

/**
 * Blocks privilege escalation: public users or garage admins can NEVER assign super_admin.
 */
export function canAssignRole(
  actorRole: PlatformRole | 'public',
  targetRole: PlatformRole,
): boolean {
  if (targetRole === 'super_admin') {
    return actorRole === 'super_admin';
  }
  if (actorRole === 'public') {
    return false;
  }
  if (actorRole === 'garage_staff') {
    return false;
  }
  return targetRole === 'garage_staff' || targetRole === 'garage_admin';
}

/**
 * Returns only delivered vehicles belonging strictly to the specified tenant.
 */
export function filterDeliveredVehicles(
  jobCards: readonly JobCard[],
  activeTenantId: string | null | undefined,
): JobCard[] {
  return scopeByTenant(jobCards, activeTenantId).filter((card) => card.isDelivered);
}

const DELIVERED_POSITIVE_TOKENS = [
  'delivered',
  'handed over',
  'handover complete',
  'vehicle delivered',
  'closed - delivered',
  'completed & delivered',
];

const NON_DELIVERED_GUARD_TOKENS = [
  'not delivered',
  'undelivered',
  'pending delivery',
  'awaiting delivery',
  'ready for delivery',
  'in progress',
  'wip',
  'open',
  'cancelled',
  'canceled',
  'waiting',
];

export function isDeliveredStatus(rawStatus: string): boolean {
  const normalized = rawStatus.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (NON_DELIVERED_GUARD_TOKENS.some((token) => normalized.includes(token))) {
    return false;
  }
  return DELIVERED_POSITIVE_TOKENS.some((token) => normalized.includes(token));
}

export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

export function generateSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'garage-workspace'
  );
}

export function suggestColumnMapping(headers: string[]): ExcelColumnMapping {
  const findMatch = (keywords: string[]): string => {
    for (const kw of keywords) {
      const exact = headers.find((h) => h.trim().toLowerCase() === kw);
      if (exact) return exact;
    }
    for (const kw of keywords) {
      const boundaryRegex = new RegExp(
        `\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'i',
      );
      const wordMatch = headers.find((h) => boundaryRegex.test(h));
      if (wordMatch) return wordMatch;
    }
    for (const kw of keywords) {
      if (kw.length <= 3) continue;
      const partial = headers.find((h) => h.trim().toLowerCase().includes(kw));
      if (partial) return partial;
    }
    return '';
  };

  return {
    jobCardNumber: findMatch(['job card no', 'job card', 'job_card', 'jobcard', 'jc no', 'job no', 'card no', 'id']),
    customerName: findMatch(['customer name', 'customer', 'client name', 'owner', 'name']),
    phoneNumber: findMatch(['whatsapp phone', 'whatsapp', 'mobile', 'phone', 'contact', 'tel']),
    vehicleRegistration: findMatch(['vehicle reg', 'vehicle number', 'registration', 'reg no', 'reg', 'plate', 'number plate']),
    vehicleBrand: findMatch(['vehicle brand', 'brand', 'make', 'manufacturer']),
    vehicleModel: findMatch(['vehicle model', 'car model', 'model', 'vehicle', 'car']),
    serviceType: findMatch(['service details', 'service type', 'service', 'job type', 'work', 'description', 'repair']),
    rawStatus: findMatch(['job card status', 'delivery status', 'status', 'stage', 'state']),
  };
}

export interface MappedImportResult {
  jobCards: JobCard[];
  skippedCount: number;
  deliveredCount: number;
}

export function mapImportedRows(
  rows: Record<string, unknown>[],
  mapping: ExcelColumnMapping,
  tenantId: string,
  batchId: string,
  timestampIso = new Date().toISOString(),
): MappedImportResult {
  const jobCards: JobCard[] = [];
  let skippedCount = 0;
  let deliveredCount = 0;

  rows.forEach((row, index) => {
    const readField = (columnName: string): string => {
      if (!columnName) return '';
      const val = row[columnName];
      if (val === null || val === undefined) return '';
      return String(val).trim();
    };

    const jobCardNumber = readField(mapping.jobCardNumber);
    const customerName = readField(mapping.customerName);
    const phoneNumber = normalizePhoneNumber(readField(mapping.phoneNumber));
    const vehicleRegistration = readField(mapping.vehicleRegistration).toUpperCase();
    const vehicleBrand = readField(mapping.vehicleBrand);
    const vehicleModel = readField(mapping.vehicleModel);
    const serviceType = readField(mapping.serviceType);
    const rawStatus = readField(mapping.rawStatus);

    if (!customerName && !vehicleRegistration && !jobCardNumber) {
      skippedCount += 1;
      return;
    }

    const delivered = isDeliveredStatus(rawStatus);
    if (delivered) {
      deliveredCount += 1;
    }

    jobCards.push({
      id: `${batchId}_row_${index + 1}`,
      tenantId,
      importBatchId: batchId,
      jobCardNumber: jobCardNumber || `JC-${index + 1}`,
      customerName: customerName || 'Unnamed Customer',
      phoneNumber,
      vehicleRegistration: vehicleRegistration || 'Not Provided',
      vehicleBrand,
      vehicleModel: vehicleModel || 'Vehicle Not Specified',
      serviceType: serviceType || 'General Service',
      rawStatus: rawStatus || 'Pending Review',
      isDelivered: delivered,
      deliveredAt: delivered ? timestampIso : null,
      importedAt: timestampIso,
      createdAt: timestampIso,
      whatsappDispatchStatus: 'not_sent',
    });
  });

  return { jobCards, skippedCount, deliveredCount };
}

export interface TemplateRenderVariables {
  customerName: string;
  garageName: string;
  vehicleReg: string;
  vehicleModel: string;
  jobCardNumber: string;
  googleReviewUrl: string;
  instagramUrl: string;
}

export function renderWhatsAppTemplate(
  body: string,
  vars: TemplateRenderVariables,
): string {
  return body
    .replaceAll('{{customer_name}}', vars.customerName || 'Customer')
    .replaceAll('{{garage_name}}', vars.garageName || 'Our Garage')
    .replaceAll('{{vehicle_reg}}', vars.vehicleReg || '')
    .replaceAll('{{vehicle_model}}', vars.vehicleModel || 'your vehicle')
    .replaceAll('{{job_card_no}}', vars.jobCardNumber || '')
    .replaceAll(
      '{{google_review_url}}',
      vars.googleReviewUrl || '[Google Review Link Not Configured]',
    )
    .replaceAll(
      '{{instagram_url}}',
      vars.instagramUrl || '[Instagram Link Not Configured]',
    );
}

export function validateLoginInput(
  email: string,
  password: string,
): { valid: boolean; errors: { email?: string; password?: string } } {
  const errors: { email?: string; password?: string } = {};
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!password.trim()) {
    errors.password = 'Password is required.';
  } else if (password.trim().length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateGarageRegistrationInput(
  input: GarageRegistrationInput,
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (input.garageName.trim().length < 2) {
    errors.garageName = 'Garage name must be at least 2 characters.';
  }
  if (input.ownerName.trim().length < 2) {
    errors.ownerName = 'Owner full name is required.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (normalizePhoneNumber(input.mobileNumber).length < 7) {
    errors.mobileNumber = 'Enter a valid mobile number (at least 7 digits).';
  }
  if (input.address.trim().length < 3) {
    errors.address = 'Garage address or city is required.';
  }
  if (input.password.trim().length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateStaffCreationInput(
  input: StaffCreationInput,
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (input.fullName.trim().length < 2) {
    errors.fullName = 'Staff full name is required.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Enter a valid staff email address.';
  }
  if (input.password.trim().length < 6) {
    errors.password = 'Temporary password must be at least 6 characters.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validatePasswordUpdate(
  password: string,
  confirmPassword: string,
): { valid: boolean; error?: string } {
  if (password.trim().length < 6) {
    return { valid: false, error: 'New password must be at least 6 characters.' };
  }
  if (password !== confirmPassword) {
    return { valid: false, error: 'Passwords do not match.' };
  }
  return { valid: true };
}

export function validateGarageCreation(input: {
  name: string;
  city: string;
  contactPhone: string;
  adminEmail: string;
}): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (input.name.trim().length < 2) {
    errors.name = 'Garage name must be at least 2 characters.';
  }
  if (input.city.trim().length < 2) {
    errors.city = 'City or service location is required.';
  }
  if (normalizePhoneNumber(input.contactPhone).length < 7) {
    errors.contactPhone = 'Enter a valid garage phone number.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.adminEmail.trim())) {
    errors.adminEmail = 'Enter a valid admin email address.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
