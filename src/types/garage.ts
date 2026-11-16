export type PlatformRole = 'super_admin' | 'garage_admin' | 'garage_staff';

export type SuperAdminPage =
  | 'overview'
  | 'registered-garages'
  | 'users'
  | 'subscription-plans'
  | 'system-settings'
  | 'profile';

export type GaragePage =
  | 'dashboard'
  | 'import-excel'
  | 'job-cards'
  | 'delivered-vehicles'
  | 'whatsapp-messages'
  | 'message-templates'
  | 'review-social-links'
  | 'reports'
  | 'garage-settings'
  | 'profile';

export type AuthScreenView =
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'verify-email'
  | 'reset-password';

export type GarageStatus = 'active' | 'pending' | 'suspended';

export type IntegrationConnectionState = 'connected' | 'not_connected' | 'pending_setup';

export interface GarageBranding {
  displayName: string;
  tagline: string;
  city: string;
  contactPhone: string;
  contactEmail: string;
  logoUrl: string;
  accentColor: string;
}

export interface GarageWhatsAppSettings {
  phoneNumberId: string;
  wabaId: string;
  businessDisplayName: string;
  connectionStatus: IntegrationConnectionState;
}

export interface ReviewSocialLinks {
  googleReviewUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  youtubeUrl: string;
  websiteUrl: string;
}

export interface GarageTenant {
  id: string;
  name: string;
  slug: string;
  planId: string;
  status: GarageStatus;
  createdAt: string;
  branding: GarageBranding;
  whatsappSettings: GarageWhatsAppSettings;
  reviewSocialLinks: ReviewSocialLinks;
  savedImportMapping?: ExcelColumnMapping | null;
}

export interface TenantUser {
  id: string;
  tenantId: string | null;
  fullName: string;
  email: string;
  role: PlatformRole;
  status: 'active' | 'invited';
  createdAt: string;
  passwordHashPreview?: string;
}

export interface UserSession {
  userId: string;
  email: string;
  fullName: string;
  role: PlatformRole;
  tenantId: string | null;
  authorizedTenantIds: string[];
  emailVerified: boolean;
  authMode: 'supabase' | 'local_preview';
}

export interface GarageRegistrationInput {
  garageName: string;
  ownerName: string;
  email: string;
  mobileNumber: string;
  address: string;
  password: string;
}

export interface StaffCreationInput {
  fullName: string;
  email: string;
  password: string;
}

export interface JobCard {
  id: string;
  tenantId: string;
  importBatchId: string;
  jobCardNumber: string;
  customerName: string;
  phoneNumber: string;
  vehicleRegistration: string;
  vehicleBrand: string;
  vehicleModel: string;
  serviceType: string;
  rawStatus: string;
  isDelivered: boolean;
  deliveredAt: string | null;
  serviceAdvisor?: string;
  invoiceNumber?: string;
  amount?: number | null;
  importedAt?: string;
  createdAt?: string;
  whatsappDispatchStatus: 'not_sent' | 'draft_prepared';
}

export interface ImportBatch {
  id: string;
  tenantId: string;
  fileName: string;
  sheetName?: string;
  importedAt: string;
  totalRows: number;
  importedCount?: number;
  updatedCount?: number;
  duplicateCount?: number;
  deliveredCount: number;
  skippedCount: number;
  failedCount: number;
}

export type TemplateCategory =
  | 'delivery_notification'
  | 'google_review_invite'
  | 'social_follow_up';

export interface MessageTemplate {
  id: string;
  tenantId: string;
  name: string;
  category: TemplateCategory;
  body: string;
  metaTemplateName: string;
  approvalStatus: 'draft' | 'pending' | 'approved' | 'rejected';
  updatedAt: string;
}

export interface WhatsAppMessageLog {
  id: string;
  tenantId: string;
  jobCardId: string;
  customerName: string;
  phoneNumber: string;
  vehicleRegistration: string;
  templateName: string;
  renderedMessage: string;
  status:
    | 'draft_not_sent_api_disconnected'
    | 'draft_not_sent'
    | 'queued'
    | 'sent'
    | 'delivered'
    | 'read'
    | 'failed';
  createdAt: string;
}

export type DashboardDatePeriod = 'daily' | 'monthly' | 'all';

export interface DashboardDateFilter {
  period: DashboardDatePeriod;
  selectedDate: string; // YYYY-MM-DD
  selectedMonth: string; // YYYY-MM
}

export interface CustomerConsent {
  id: string;
  tenantId: string;
  customerMobile: string;
  consentType: 'whatsapp_delivery' | 'google_review_invite' | 'social_follow_up';
  consentStatus: 'opted_in' | 'opted_out' | 'pending';
  consentSource: string;
  updatedAt: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  targetAudience: string;
  monthlyPriceUsd: number;
  monthlyMessageCap: number;
  maxStaffUsers: number;
  features: string[];
}

export interface ExcelColumnMapping {
  jobCardNumber: string;
  customerName: string;
  phoneNumber: string;
  vehicleRegistration: string;
  vehicleBrand: string;
  vehicleModel: string;
  serviceType: string;
  rawStatus: string;
  deliveryDate?: string;
  serviceAdvisor?: string;
  invoiceNumber?: string;
  amount?: string;
}

export type ImportRowDisposition =
  | 'new'
  | 'update'
  | 'duplicate_in_file'
  | 'invalid'
  | 'skipped_empty';

export interface ValidatedImportRow {
  rowNumber: number;
  disposition: ImportRowDisposition;
  jobCardNumber: string;
  customerName: string;
  phoneNumber: string;
  vehicleRegistration: string;
  rawStatus: string;
  parsedDeliveryDate: string | null;
  errors: string[];
  warnings: string[];
  card: JobCard | null;
}

export interface ImportErrorReportRow {
  rowNumber: number;
  jobCardNumber: string;
  customerName: string;
  vehicleRegistration: string;
  issueType: 'invalid' | 'duplicate_in_file' | 'skipped_empty' | 'warning';
  reason: string;
}

export interface ImportAnalysisSummary {
  totalScanned: number;
  validNewCount: number;
  updatedExistingCount: number;
  duplicateInFileCount: number;
  invalidCount: number;
  skippedEmptyCount: number;
  deliveredConfirmedCount: number;
  preservedDeliveryCount: number;
  deliveryDateMissingCount: number;
}

export interface SystemSettingsState {
  platformName: string;
  enforceStrictTenantIsolation: boolean;
  allowGarageSelfOnboarding: boolean;
  supabaseProjectUrl: string;
  supabaseConnection: IntegrationConnectionState;
  whatsappCloudApiConnection: IntegrationConnectionState;
}
