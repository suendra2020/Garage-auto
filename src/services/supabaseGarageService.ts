import { getSupabaseClient } from '../lib/supabase';
import type {
  ExcelColumnMapping,
  GarageRegistrationInput,
  GarageStatus,
  GarageTenant,
  ImportBatch,
  JobCard,
  MessageTemplate,
  PlatformRole,
  PublicGarageConnectionProfile,
  StaffCreationInput,
  TemplateCategory,
  TenantUser,
  UserSession,
  WhatsAppMessageLog,
} from '../types/garage';
import { chunkArray } from '../utils/excelImportEngine';
import {
  DEFAULT_CUSTOMER_WELCOME_TEXT,
  buildPublicGarageProfile,
  normalizeGarageSlug,
} from '../utils/garageConnection';
import { generateSlug, isDeliveredStatus } from '../utils/tenantLogic';

interface DbGarageRow {
  id: string;
  garage_name: string;
  slug?: string | null;
  logo_url: string | null;
  address: string | null;
  phone_number: string | null;
  email: string | null;
  google_review_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  customer_welcome_text?: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_waba_id?: string | null;
  whatsapp_display_name?: string | null;
  whatsapp_default_message?: string | null;
  whatsapp_connection_status?: 'not_connected' | 'pending_setup' | 'connected' | null;
  whatsapp_verified_at?: string | null;
  whatsapp_verified_phone_number?: string | null;
  whatsapp_verified_name?: string | null;
  whatsapp_last_test_error?: string | null;
  subscription_plan: string;
  account_status: GarageStatus;
  created_at: string;
  saved_import_mapping?: ExcelColumnMapping | null;
}

const LOCAL_MAPPING_PREFIX = 'gc_import_mapping_';

export function readLocalGarageImportMapping(garageId: string): ExcelColumnMapping | null {
  if (typeof window === 'undefined' || !garageId) return null;
  try {
    const raw = localStorage.getItem(`${LOCAL_MAPPING_PREFIX}${garageId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ExcelColumnMapping;
  } catch {
    return null;
  }
}

export function writeLocalGarageImportMapping(
  garageId: string,
  mapping: ExcelColumnMapping | null,
): void {
  if (typeof window === 'undefined' || !garageId) return;
  try {
    if (!mapping) {
      localStorage.removeItem(`${LOCAL_MAPPING_PREFIX}${garageId}`);
    } else {
      localStorage.setItem(`${LOCAL_MAPPING_PREFIX}${garageId}`, JSON.stringify(mapping));
    }
  } catch {
    // ignore storage errors
  }
}

const PUBLIC_GARAGE_CACHE_PREFIX = 'gc_public_garage_slug_';

export function writeLocalPublicGarageCache(
  profile: PublicGarageConnectionProfile,
  previousSlug?: string | null,
): void {
  if (typeof window === 'undefined' || !profile.slug) return;
  try {
    if (previousSlug) {
      const prevNorm = normalizeGarageSlug(previousSlug);
      if (prevNorm && prevNorm !== profile.slug) {
        localStorage.removeItem(`${PUBLIC_GARAGE_CACHE_PREFIX}${prevNorm}`);
      }
    }
    localStorage.setItem(
      `${PUBLIC_GARAGE_CACHE_PREFIX}${normalizeGarageSlug(profile.slug)}`,
      JSON.stringify(profile),
    );
  } catch {
    // ignore storage errors
  }
}

export function readLocalPublicGarageCache(
  slug: string,
): PublicGarageConnectionProfile | null {
  if (typeof window === 'undefined' || !slug) return null;
  const targetSlug = normalizeGarageSlug(slug);
  if (!targetSlug) return null;
  try {
    const raw = localStorage.getItem(`${PUBLIC_GARAGE_CACHE_PREFIX}${targetSlug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicGarageConnectionProfile;
    if (normalizeGarageSlug(parsed.slug) !== targetSlug) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function mapDbGarageToTenant(row: DbGarageRow): GarageTenant {
  const effectiveSlug = normalizeGarageSlug(row.slug || '') || generateSlug(row.garage_name);
  const tenant: GarageTenant = {
    id: row.id,
    name: row.garage_name,
    slug: effectiveSlug,
    planId: row.subscription_plan || 'plan_starter',
    status: row.account_status,
    createdAt: row.created_at,
    savedImportMapping: row.saved_import_mapping ?? readLocalGarageImportMapping(row.id),
    branding: {
      displayName: row.garage_name,
      tagline: 'Authorized Vehicle Service & Care',
      city: row.address ?? '',
      contactPhone: row.phone_number ?? '',
      contactEmail: row.email ?? '',
      logoUrl: row.logo_url ?? '',
      accentColor: '#0B192C',
      customerWelcomeText: row.customer_welcome_text ?? '',
    },
    whatsappSettings: {
      phoneNumberId: row.whatsapp_phone_number_id ?? '',
      wabaId: row.whatsapp_waba_id ?? '',
      businessDisplayName: row.whatsapp_display_name || row.garage_name,
      defaultMessage: row.whatsapp_default_message ?? '',
      connectionStatus:
        row.whatsapp_connection_status === 'connected' &&
        Boolean(row.whatsapp_phone_number_id?.trim()) &&
        Boolean(row.whatsapp_waba_id?.trim())
          ? 'connected'
          : row.whatsapp_connection_status === 'pending_setup'
            ? 'pending_setup'
            : 'not_connected',
      verifiedAt: row.whatsapp_verified_at ?? null,
      verifiedPhoneNumber: row.whatsapp_verified_phone_number ?? null,
      verifiedName: row.whatsapp_verified_name ?? null,
      lastTestError: row.whatsapp_last_test_error ?? null,
    },
    reviewSocialLinks: {
      googleReviewUrl: row.google_review_url ?? '',
      instagramUrl: row.instagram_url ?? '',
      facebookUrl: '',
      youtubeUrl: row.youtube_url ?? '',
      websiteUrl: '',
    },
  };

  if (row.account_status === 'active') {
    writeLocalPublicGarageCache(buildPublicGarageProfile(tenant));
  }
  return tenant;
}

export async function signInSupabasePassword(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function registerGarageOwnerSupabase(
  input: GarageRegistrationInput,
): Promise<
  | { status: 'authenticated' }
  | { status: 'verification_required'; email: string }
> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');

  const cleanEmail = input.email.trim().toLowerCase();
  const { data, error } = await client.auth.signUp({
    email: cleanEmail,
    password: input.password,
    options: {
      emailRedirectTo:
        typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
      data: {
        full_name: input.ownerName.trim(),
        pending_garage_registration: {
          garageName: input.garageName.trim(),
          ownerName: input.ownerName.trim(),
          mobileNumber: input.mobileNumber.trim(),
          address: input.address.trim(),
          email: cleanEmail,
        },
      },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes('rate limit')) {
      throw new Error(
        'Email rate limit reached on Supabase Auth. Wait a few minutes or configure Custom SMTP in your Supabase project.',
      );
    }
    throw error;
  }

  if (data.session && data.user) {
    // Immediate session active: create garage + link owner as garage_admin
    await createSupabaseGarageWorkspace({
      garageName: input.garageName,
      ownerName: input.ownerName,
      address: input.address,
      phoneNumber: input.mobileNumber,
      email: cleanEmail,
      planId: 'plan_starter',
    });
    return { status: 'authenticated' };
  }

  return { status: 'verification_required', email: cleanEmail };
}

export async function sendPasswordResetEmailSupabase(email: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?auth_flow=reset_password`
      : undefined;
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  });
  if (error) throw error;
}

export async function updatePasswordSupabase(newPassword: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function resendVerificationEmailSupabase(email: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const { error } = await client.auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
  });
  if (error) throw error;
}

export async function updateProfileNameSupabase(userId: string, fullName: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const cleanName = fullName.trim();
  const { error: authErr } = await client.auth.updateUser({
    data: { full_name: cleanName },
  });
  if (authErr) throw authErr;
  const { error: profErr } = await client
    .from('profiles')
    .update({ full_name: cleanName })
    .eq('id', userId);
  if (profErr) throw profErr;
}

export async function signOutSupabase() {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export async function loadSupabaseAuthenticatedContext(): Promise<{
  session: UserSession;
  authorizedTenants: GarageTenant[];
} | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: userRes } = await client.auth.getUser();
  const authUser = userRes.user;
  if (!authUser) return null;

  // Accept any pending staff invitations matching this user's verified email
  try {
    await client.rpc('accept_pending_garage_invitations');
  } catch {
    // ignore if 0003 migration not yet applied
  }

  let { data: memberships } = await client
    .from('garage_users')
    .select('garage_id, role, garages(*)')
    .eq('user_id', authUser.id);

  // If user registered and verified their email later, finish creating their pending garage
  const pending = authUser.user_metadata?.pending_garage_registration as
    | {
        garageName?: string;
        ownerName?: string;
        mobileNumber?: string;
        address?: string;
        email?: string;
      }
    | undefined;

  if ((!memberships || memberships.length === 0) && pending?.garageName) {
    await createSupabaseGarageWorkspace({
      garageName: pending.garageName,
      ownerName: pending.ownerName,
      address: pending.address ?? '',
      phoneNumber: pending.mobileNumber ?? '',
      email: pending.email ?? authUser.email ?? '',
      planId: 'plan_starter',
    });
    await client.auth.updateUser({ data: { pending_garage_registration: null } });
    const reloaded = await client
      .from('garage_users')
      .select('garage_id, role, garages(*)')
      .eq('user_id', authUser.id);
    memberships = reloaded.data;
  }

  const { data: profile, error: profErr } = await client
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', authUser.id)
    .single();

  if (profErr || !profile) {
    const msg = profErr?.message || '';
    if (msg.includes('schema cache') || msg.includes('does not exist')) {
      throw new Error(
        'Supabase database tables are not created yet. Run SQL migrations 0001, 0002, and 0003 in your Supabase SQL Editor.',
      );
    }
    throw new Error(msg || 'Authenticated user profile record not found in public.profiles.');
  }

  let effectiveRole: PlatformRole = profile.role as PlatformRole;
  let authorizedTenants: GarageTenant[] = [];

  if (effectiveRole === 'super_admin') {
    const { data: allGarages, error: garErr } = await client
      .from('garages')
      .select('*')
      .order('created_at', { ascending: false });
    if (garErr) {
      throw new Error(garErr.message);
    }
    authorizedTenants = (allGarages ?? []).map((g) => mapDbGarageToTenant(g as DbGarageRow));
  } else {
    (memberships ?? []).forEach((m: Record<string, unknown>) => {
      const g = m.garages as DbGarageRow | null;
      if (g) {
        authorizedTenants.push(mapDbGarageToTenant(g));
      }
      if (m.role === 'garage_admin') {
        effectiveRole = 'garage_admin';
      }
    });
  }

  const authorizedTenantIds = authorizedTenants.map((t) => t.id);

  return {
    session: {
      userId: profile.id,
      email: profile.email,
      fullName: profile.full_name || profile.email,
      role: effectiveRole,
      tenantId: effectiveRole === 'super_admin' ? null : authorizedTenantIds[0] ?? null,
      authorizedTenantIds,
      emailVerified: Boolean(authUser.email_confirmed_at),
      authMode: 'supabase',
    },
    authorizedTenants,
  };
}

export async function fetchSupabaseSuperAdminData(): Promise<{
  tenants: GarageTenant[];
  users: TenantUser[];
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { tenants: [], users: [] };
  }

  const [garagesRes, profilesRes, membershipsRes] = await Promise.all([
    client.from('garages').select('*').order('created_at', { ascending: false }),
    client
      .from('profiles')
      .select('id, full_name, email, role, created_at')
      .order('created_at', { ascending: false }),
    client.from('garage_users').select('garage_id, user_id, role'),
  ]);

  const queryErr = garagesRes.error || profilesRes.error;
  if (queryErr) {
    throw new Error(queryErr.message);
  }

  const membershipByUser = new Map<string, { garageId: string; role: PlatformRole }>();
  (membershipsRes.data ?? []).forEach((m: Record<string, unknown>) => {
    const uid = m.user_id as string;
    if (!membershipByUser.has(uid)) {
      membershipByUser.set(uid, {
        garageId: m.garage_id as string,
        role: m.role as PlatformRole,
      });
    }
  });

  const tenants = (garagesRes.data ?? []).map((g) => mapDbGarageToTenant(g as DbGarageRow));
  const users: TenantUser[] = (profilesRes.data ?? []).map((p: Record<string, unknown>) => {
    const uid = p.id as string;
    const mem = membershipByUser.get(uid);
    const profileRole = p.role as PlatformRole;
    return {
      id: uid,
      tenantId: profileRole === 'super_admin' ? null : mem?.garageId ?? null,
      fullName: (p.full_name as string) || (p.email as string) || 'User',
      email: (p.email as string) || '',
      role: profileRole === 'super_admin' ? 'super_admin' : mem?.role ?? profileRole,
      status: 'active',
      createdAt: (p.created_at as string) || new Date().toISOString(),
    };
  });

  return { tenants, users };
}

export async function createSupabaseGarageWorkspace(input: {
  garageName: string;
  ownerName?: string;
  address: string;
  phoneNumber: string;
  email: string;
  planId: string;
}): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const { data, error } = await client.rpc('create_garage_workspace', {
    p_garage_name: input.garageName,
    p_address: input.address,
    p_phone_number: input.phoneNumber,
    p_email: input.email,
    p_subscription_plan: input.planId,
    p_owner_name: input.ownerName ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function createStaffAccountSupabase(
  garageId: string,
  input: StaffCreationInput,
): Promise<{ mode: 'created_active' | 'invited_pending' }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');

  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;

  if (token) {
    const resp = await fetch('/api/staff/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        garageId,
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        password: input.password,
      }),
    });

    if (resp.ok) {
      return { mode: 'created_active' };
    }
    if (resp.status !== 503) {
      const payload = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || 'Failed to create staff account.');
    }
  }

  // Fallback when SUPABASE_SERVICE_ROLE_KEY is not configured on the server:
  // Record an RLS-protected garage_staff invitation so the staff member links on signup.
  const { error: invErr } = await client.from('garage_staff_invitations').upsert(
    {
      garage_id: garageId,
      full_name: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      role: 'garage_staff',
      status: 'pending',
    },
    { onConflict: 'garage_id,email' },
  );
  if (invErr) throw invErr;

  return { mode: 'invited_pending' };
}

export async function fetchSupabaseGarageScopedData(garageId: string): Promise<{
  jobCards: JobCard[];
  importBatches: ImportBatch[];
  templates: MessageTemplate[];
  whatsappLogs: WhatsAppMessageLog[];
  users: TenantUser[];
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      jobCards: [],
      importBatches: [],
      templates: [],
      whatsappLogs: [],
      users: [],
    };
  }

  const [cardsRes, importsRes, tplRes, logsRes, membersRes, invitesRes] = await Promise.all([
    client
      .from('job_cards')
      .select('*')
      .eq('garage_id', garageId)
      .order('created_at', { ascending: false }),
    client
      .from('excel_imports')
      .select('*')
      .eq('garage_id', garageId)
      .order('created_at', { ascending: false }),
    client
      .from('whatsapp_templates')
      .select('*')
      .eq('garage_id', garageId)
      .order('created_at', { ascending: false }),
    client
      .from('whatsapp_logs')
      .select('*, job_cards(job_card_number, customer_name, vehicle_number)')
      .eq('garage_id', garageId)
      .order('sent_at', { ascending: false, nullsFirst: false }),
    client
      .from('garage_users')
      .select('id, garage_id, user_id, role, created_at, profiles(full_name, email)')
      .eq('garage_id', garageId),
    client
      .from('garage_staff_invitations')
      .select('id, garage_id, full_name, email, role, status, created_at')
      .eq('garage_id', garageId)
      .eq('status', 'pending'),
  ]);

  const queryError = cardsRes.error || importsRes.error || tplRes.error || logsRes.error;
  if (queryError) {
    throw new Error(queryError.message);
  }

  const jobCards: JobCard[] = (cardsRes.data ?? []).map((r) => ({
    id: r.id,
    tenantId: r.garage_id,
    importBatchId: 'db',
    jobCardNumber: r.job_card_number,
    customerName: r.customer_name,
    phoneNumber: r.mobile_number ?? '',
    vehicleRegistration: r.vehicle_number,
    vehicleBrand: r.vehicle_brand ?? '',
    vehicleModel: r.vehicle_model ?? '',
    serviceType: r.service_details ?? '',
    rawStatus: r.job_card_status,
    isDelivered: isDeliveredStatus(r.job_card_status) && Boolean(r.delivery_date),
    deliveredAt: r.delivery_date,
    deliveredBy: ((r as Record<string, unknown>).delivered_by as string | null | undefined) ?? null,
    deliveryConfirmedAt:
      ((r as Record<string, unknown>).delivery_confirmed_at as string | null | undefined) ?? null,
    serviceAdvisor: (r as Record<string, unknown>).service_advisor as string | undefined,
    invoiceNumber: (r as Record<string, unknown>).invoice_number as string | undefined,
    amount:
      (r as Record<string, unknown>).amount !== null &&
      (r as Record<string, unknown>).amount !== undefined
        ? Number((r as Record<string, unknown>).amount)
        : null,
    importedAt: r.imported_at ?? r.created_at,
    createdAt: r.created_at,
    whatsappDispatchStatus: 'not_sent',
  }));

  const importBatches: ImportBatch[] = (importsRes.data ?? []).map((r) => ({
    id: r.id,
    tenantId: r.garage_id,
    fileName: r.file_name,
    importedAt: r.created_at,
    totalRows: r.total_records,
    importedCount: r.imported_records,
    updatedCount: (r as Record<string, unknown>).updated_records as number | undefined,
    duplicateCount: (r as Record<string, unknown>).duplicate_records as number | undefined,
    deliveredCount: 0,
    skippedCount: r.skipped_records,
    failedCount: r.failed_records,
  }));

  const templates: MessageTemplate[] = (tplRes.data ?? []).map((r) => {
    const ext = r as Record<string, unknown>;
    return {
      id: r.id,
      tenantId: r.garage_id,
      name: r.template_name,
      category: (r.template_category as TemplateCategory) || 'delivery_notification',
      body: r.template_content,
      metaTemplateName: r.meta_template_name ?? '',
      metaLanguageCode: (ext.meta_language_code as string) || 'en',
      approvalStatus: r.approval_status,
      updatedAt: (ext.updated_at as string) || r.created_at,
    };
  });

  const whatsappLogs: WhatsAppMessageLog[] = (logsRes.data ?? []).map(
    (r: Record<string, unknown>) => mapDbWhatsAppLogRow(r),
  );

  const activeMembers: TenantUser[] = (membersRes.data ?? []).map((r: Record<string, unknown>) => {
    const p = r.profiles as { full_name?: string; email?: string } | null;
    return {
      id: r.user_id as string,
      tenantId: r.garage_id as string,
      fullName: p?.full_name ?? 'Garage User',
      email: p?.email ?? '',
      role: r.role as PlatformRole,
      status: 'active',
      createdAt: r.created_at as string,
    };
  });

  const invitedMembers: TenantUser[] = (invitesRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    tenantId: r.garage_id as string,
    fullName: (r.full_name as string) ?? 'Invited Staff',
    email: (r.email as string) ?? '',
    role: 'garage_staff',
    status: 'invited',
    createdAt: r.created_at as string,
  }));

  return {
    jobCards,
    importBatches,
    templates,
    whatsappLogs,
    users: [...activeMembers, ...invitedMembers],
  };
}

export async function updateSupabaseJobCardDelivery(params: {
  garageId: string;
  jobCardId: string;
  isDelivered: boolean;
  deliveredAt: string | null;
  deliveredBy: string | null;
  deliveryConfirmedAt: string | null;
}) {
  const client = getSupabaseClient();
  if (!client) return;

  const fullUpdate = {
    job_card_status: params.isDelivered ? 'Delivered' : 'In Progress',
    delivery_date: params.isDelivered ? params.deliveredAt : null,
    delivered_by: params.isDelivered ? params.deliveredBy : null,
    delivery_confirmed_at: params.isDelivered ? params.deliveryConfirmedAt : null,
  };

  let { error } = await client
    .from('job_cards')
    .update(fullUpdate)
    .eq('id', params.jobCardId)
    .eq('garage_id', params.garageId);

  if (
    error &&
    (error.message.includes('delivered_by') ||
      error.message.includes('delivery_confirmed_at'))
  ) {
    const fallbackRes = await client
      .from('job_cards')
      .update({
        job_card_status: fullUpdate.job_card_status,
        delivery_date: fullUpdate.delivery_date,
      })
      .eq('id', params.jobCardId)
      .eq('garage_id', params.garageId);
    error = fallbackRes.error;
  }

  if (error) throw error;
}

export async function insertSupabaseWhatsAppLogDraft(
  garageId: string,
  log: WhatsAppMessageLog,
) {
  await insertSupabaseWhatsAppLogDrafts(garageId, [log]);
}

export async function insertSupabaseWhatsAppLogDrafts(
  garageId: string,
  logs: readonly WhatsAppMessageLog[],
) {
  const client = getSupabaseClient();
  if (!client || logs.length === 0) return;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rows = logs.map((log) => ({
    garage_id: garageId,
    job_card_id: uuidRegex.test(log.jobCardId) ? log.jobCardId : null,
    template_id: log.templateId && uuidRegex.test(log.templateId) ? log.templateId : null,
    meta_template_name: log.metaTemplateName || null,
    recipient_number: log.phoneNumber,
    message_type: log.templateName,
    rendered_message: log.renderedMessage,
    message_status: 'draft_not_sent',
    sent_at: log.createdAt,
    error_message: null,
  }));

  let { error } = await client.from('whatsapp_logs').insert(rows);
  if (
    error &&
    (error.message.includes('rendered_message') ||
      error.message.includes('template_id') ||
      error.message.includes('meta_template_name'))
  ) {
    const legacyRows = logs.map((log) => ({
      garage_id: garageId,
      job_card_id: uuidRegex.test(log.jobCardId) ? log.jobCardId : null,
      recipient_number: log.phoneNumber,
      message_type: log.templateName,
      message_status: 'draft_not_sent',
      sent_at: log.createdAt,
      error_message: log.renderedMessage,
    }));
    const fallbackRes = await client.from('whatsapp_logs').insert(legacyRows);
    error = fallbackRes.error;
  }
  if (error) throw error;
}

export async function saveSupabaseGarageImportMapping(
  garageId: string,
  mapping: ExcelColumnMapping | null,
) {
  writeLocalGarageImportMapping(garageId, mapping);
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client
    .from('garages')
    .update({ saved_import_mapping: mapping })
    .eq('id', garageId);
  if (error && !error.message.includes('saved_import_mapping')) {
    throw error;
  }
}

export async function insertSupabaseImportAndJobCards(
  garageId: string,
  batch: ImportBatch,
  cards: JobCard[],
  onBatchProgress?: (completedBatches: number, totalBatches: number) => void,
) {
  const client = getSupabaseClient();
  if (!client) return;

  const fullBatchPayload = {
    garage_id: garageId,
    file_name: batch.fileName,
    total_records: batch.totalRows,
    imported_records: batch.importedCount ?? cards.length,
    updated_records: batch.updatedCount ?? 0,
    duplicate_records: batch.duplicateCount ?? 0,
    skipped_records: batch.skippedCount,
    failed_records: batch.failedCount,
  };

  let { error: impErr } = await client.from('excel_imports').insert(fullBatchPayload);
  if (impErr && (impErr.message.includes('updated_records') || impErr.message.includes('duplicate_records'))) {
    const fallbackRes = await client.from('excel_imports').insert({
      garage_id: garageId,
      file_name: batch.fileName,
      total_records: batch.totalRows,
      imported_records: cards.length,
      skipped_records: batch.skippedCount,
      failed_records: batch.failedCount,
    });
    impErr = fallbackRes.error;
  }
  if (impErr) throw impErr;

  if (cards.length > 0) {
    const chunks = chunkArray(cards, 200);
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const extendedPayload = chunk.map((c) => ({
        garage_id: garageId,
        job_card_number: c.jobCardNumber,
        customer_name: c.customerName,
        mobile_number: c.phoneNumber || null,
        vehicle_number: c.vehicleRegistration,
        vehicle_brand: c.vehicleBrand || null,
        vehicle_model: c.vehicleModel || null,
        service_details: c.serviceType || null,
        job_card_status: c.rawStatus,
        delivery_date: c.deliveredAt,
        service_advisor: c.serviceAdvisor || null,
        invoice_number: c.invoiceNumber || null,
        amount: c.amount ?? null,
      }));

      let { error: cardsErr } = await client
        .from('job_cards')
        .upsert(extendedPayload, { onConflict: 'garage_id,job_card_number' });

      if (
        cardsErr &&
        (cardsErr.message.includes('service_advisor') ||
          cardsErr.message.includes('invoice_number') ||
          cardsErr.message.includes('amount'))
      ) {
        const corePayload = chunk.map((c) => ({
          garage_id: garageId,
          job_card_number: c.jobCardNumber,
          customer_name: c.customerName,
          mobile_number: c.phoneNumber || null,
          vehicle_number: c.vehicleRegistration,
          vehicle_brand: c.vehicleBrand || null,
          vehicle_model: c.vehicleModel || null,
          service_details: c.serviceType || null,
          job_card_status: c.rawStatus,
          delivery_date: c.deliveredAt,
        }));
        const fallbackUpsert = await client
          .from('job_cards')
          .upsert(corePayload, { onConflict: 'garage_id,job_card_number' });
        cardsErr = fallbackUpsert.error;
      }

      if (cardsErr) throw cardsErr;
      onBatchProgress?.(i + 1, chunks.length);
    }
  }
}

export async function updateSupabaseGarageFields(
  garageId: string,
  updates: Partial<{
    garage_name: string;
    slug: string;
    logo_url: string;
    address: string;
    phone_number: string;
    email: string;
    google_review_url: string;
    instagram_url: string;
    youtube_url: string;
    customer_welcome_text: string;
    whatsapp_phone_number_id: string;
    whatsapp_waba_id: string;
    whatsapp_display_name: string;
    whatsapp_default_message: string;
    whatsapp_connection_status: 'not_connected' | 'pending_setup' | 'connected';
    whatsapp_verified_at: string | null;
    whatsapp_verified_phone_number: string | null;
    whatsapp_verified_name: string | null;
    whatsapp_last_test_error: string | null;
    account_status: GarageStatus;
  }>,
) {
  const client = getSupabaseClient();
  if (!client) return;

  let { error } = await client.from('garages').update(updates).eq('id', garageId);

  if (error?.code === '23505' || error?.message.toLowerCase().includes('duplicate key')) {
    throw new Error('This public URL slug is already taken by another garage.');
  }

  if (
    error &&
    (error.message.includes('slug') ||
      error.message.includes('customer_welcome_text') ||
      error.message.includes('whatsapp_waba_id') ||
      error.message.includes('whatsapp_display_name') ||
      error.message.includes('whatsapp_default_message') ||
      error.message.includes('whatsapp_connection_status') ||
      error.message.includes('whatsapp_verified_at') ||
      error.message.includes('whatsapp_verified_phone_number') ||
      error.message.includes('whatsapp_verified_name') ||
      error.message.includes('whatsapp_last_test_error'))
  ) {
    const coreUpdates: Record<string, unknown> = {};
    if (updates.garage_name !== undefined) coreUpdates.garage_name = updates.garage_name;
    if (updates.logo_url !== undefined) coreUpdates.logo_url = updates.logo_url;
    if (updates.address !== undefined) coreUpdates.address = updates.address;
    if (updates.phone_number !== undefined) coreUpdates.phone_number = updates.phone_number;
    if (updates.email !== undefined) coreUpdates.email = updates.email;
    if (updates.google_review_url !== undefined) coreUpdates.google_review_url = updates.google_review_url;
    if (updates.instagram_url !== undefined) coreUpdates.instagram_url = updates.instagram_url;
    if (updates.youtube_url !== undefined) coreUpdates.youtube_url = updates.youtube_url;
    if (updates.whatsapp_phone_number_id !== undefined) {
      coreUpdates.whatsapp_phone_number_id = updates.whatsapp_phone_number_id;
    }
    if (updates.account_status !== undefined) coreUpdates.account_status = updates.account_status;

    if (Object.keys(coreUpdates).length > 0) {
      const fallbackRes = await client.from('garages').update(coreUpdates).eq('id', garageId);
      error = fallbackRes.error;
    } else {
      error = null;
    }
  }

  if (error) throw error;
}

export async function fetchPublicGarageConnectionBySlug(
  slug: string,
): Promise<PublicGarageConnectionProfile | null> {
  const targetSlug = normalizeGarageSlug(slug);
  if (!targetSlug) return null;

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client.rpc('get_public_garage_connection_page', {
        p_slug: targetSlug,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        const row = data[0] as Record<string, unknown>;
        const resolvedSlug = normalizeGarageSlug(String(row.slug ?? ''));
        if (resolvedSlug === targetSlug) {
          const profile: PublicGarageConnectionProfile = {
            id: String(row.id ?? ''),
            slug: resolvedSlug,
            displayName: String(row.garage_name ?? ''),
            logoUrl: String(row.logo_url ?? ''),
            contactPhone: String(row.phone_number ?? ''),
            address: String(row.address ?? ''),
            customerWelcomeText:
              String(row.customer_welcome_text ?? '').trim() ||
              DEFAULT_CUSTOMER_WELCOME_TEXT,
            googleReviewUrl: String(row.google_review_url ?? ''),
            instagramUrl: String(row.instagram_url ?? ''),
            youtubeUrl: String(row.youtube_url ?? ''),
          };
          writeLocalPublicGarageCache(profile);
          return profile;
        }
      }
    } catch {
      // Fall through to exact slug-keyed local cache when RPC migration 0006 isn't applied yet
    }
  }

  return readLocalPublicGarageCache(targetSlug);
}

function mapDbWhatsAppLogRow(r: Record<string, unknown>): WhatsAppMessageLog {
  const joinedCard = r.job_cards as
    | { job_card_number?: string; customer_name?: string; vehicle_number?: string }
    | null;
  const dbStatus = (r.message_status as WhatsAppMessageLog['status']) || 'draft_not_sent';
  const renderedCol = typeof r.rendered_message === 'string' ? r.rendered_message : '';
  const legacyErrOrDraft = typeof r.error_message === 'string' ? r.error_message : '';

  return {
    id: String(r.id ?? ''),
    tenantId: String(r.garage_id ?? ''),
    jobCardId: String(r.job_card_id ?? ''),
    jobCardNumber: joinedCard?.job_card_number || '',
    customerName: joinedCard?.customer_name || String(r.recipient_number ?? ''),
    phoneNumber: String(r.recipient_number ?? ''),
    vehicleRegistration: joinedCard?.vehicle_number || '',
    templateId: (r.template_id as string | null | undefined) ?? null,
    templateName: String(r.message_type ?? ''),
    metaTemplateName: (r.meta_template_name as string | null | undefined) ?? null,
    renderedMessage: renderedCol || (dbStatus === 'draft_not_sent' ? legacyErrOrDraft : ''),
    whatsappMessageId: (r.whatsapp_message_id as string | null | undefined) ?? null,
    errorMessage: dbStatus === 'failed' ? legacyErrOrDraft : null,
    deliveredAt: (r.delivered_at as string | null | undefined) ?? null,
    readAt: (r.read_at as string | null | undefined) ?? null,
    failedAt: (r.failed_at as string | null | undefined) ?? null,
    statusUpdatedAt: (r.status_updated_at as string | null | undefined) ?? null,
    status: dbStatus,
    createdAt: (r.sent_at as string) ?? new Date().toISOString(),
  };
}

export async function fetchSupabaseWhatsAppLogs(
  garageId: string,
): Promise<WhatsAppMessageLog[]> {
  const client = getSupabaseClient();
  if (!client || !garageId) return [];

  const { data, error } = await client
    .from('whatsapp_logs')
    .select('*, job_cards(job_card_number, customer_name, vehicle_number)')
    .eq('garage_id', garageId)
    .order('sent_at', { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapDbWhatsAppLogRow(r as Record<string, unknown>));
}

export async function saveSupabaseWhatsAppTemplate(
  garageId: string,
  template: MessageTemplate,
): Promise<MessageTemplate> {
  const client = getSupabaseClient();
  if (!client) return template;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const payload = {
    garage_id: garageId,
    template_name: template.name.trim(),
    template_category: template.category,
    template_content: template.body,
    meta_template_name: template.metaTemplateName.trim(),
    meta_language_code: (template.metaLanguageCode || 'en').trim() || 'en',
    approval_status: template.approvalStatus,
    updated_at: new Date().toISOString(),
  };

  if (uuidRegex.test(template.id)) {
    let { data, error } = await client
      .from('whatsapp_templates')
      .update(payload)
      .eq('id', template.id)
      .eq('garage_id', garageId)
      .select('*')
      .single();

    if (
      error &&
      (error.message.includes('meta_language_code') || error.message.includes('updated_at'))
    ) {
      const fallbackUpdate = await client
        .from('whatsapp_templates')
        .update({
          template_name: payload.template_name,
          template_category: payload.template_category,
          template_content: payload.template_content,
          meta_template_name: payload.meta_template_name,
          approval_status: payload.approval_status,
        })
        .eq('id', template.id)
        .eq('garage_id', garageId)
        .select('*')
        .single();
      data = fallbackUpdate.data;
      error = fallbackUpdate.error;
    }
    if (error) throw error;
    const ext = data as Record<string, unknown>;
    return {
      ...template,
      id: data.id,
      metaLanguageCode: (ext.meta_language_code as string) || payload.meta_language_code,
      updatedAt: (ext.updated_at as string) || data.created_at,
    };
  }

  let { data, error } = await client
    .from('whatsapp_templates')
    .insert(payload)
    .select('*')
    .single();

  if (
    error &&
    (error.message.includes('meta_language_code') || error.message.includes('updated_at'))
  ) {
    const fallbackInsert = await client
      .from('whatsapp_templates')
      .insert({
        garage_id: garageId,
        template_name: payload.template_name,
        template_category: payload.template_category,
        template_content: payload.template_content,
        meta_template_name: payload.meta_template_name,
        approval_status: payload.approval_status,
      })
      .select('*')
      .single();
    data = fallbackInsert.data;
    error = fallbackInsert.error;
  }
  if (error) throw error;
  const ext = data as Record<string, unknown>;
  return {
    ...template,
    id: data.id,
    metaLanguageCode: (ext.meta_language_code as string) || payload.meta_language_code,
    updatedAt: (ext.updated_at as string) || data.created_at,
  };
}

export async function deleteSupabaseWhatsAppTemplate(
  garageId: string,
  templateId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(templateId)) return;

  const { error } = await client
    .from('whatsapp_templates')
    .delete()
    .eq('id', templateId)
    .eq('garage_id', garageId);
  if (error) throw error;
}

async function invokeWhatsAppDispatchEdge<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Connect your Supabase project first.');
  }

  const { data, error } = await client.functions.invoke('whatsapp-dispatch', {
    body,
  });

  if (error) {
    // Extract real server error payload from FunctionsHttpError when available
    const maybeContext = (error as { context?: Response }).context;
    if (maybeContext && typeof maybeContext.json === 'function') {
      try {
        const errPayload = (await maybeContext.json()) as { error?: string };
        if (errPayload?.error) {
          throw new Error(errPayload.error);
        }
      } catch (inner) {
        if (inner instanceof Error && inner.message !== error.message) {
          throw inner;
        }
      }
    }
    const msg = error.message || 'Unable to reach Supabase Edge Function whatsapp-dispatch.';
    if (
      msg.toLowerCase().includes('failed to send a request') ||
      msg.toLowerCase().includes('networkerror') ||
      msg.toLowerCase().includes('not found')
    ) {
      throw new Error(
        'Supabase Edge Function "whatsapp-dispatch" is not deployed or unreachable yet. Deploy it with supabase functions deploy whatsapp-dispatch.',
      );
    }
    throw new Error(msg);
  }

  const typed = data as { error?: string } | null;
  if (typed && typeof typed === 'object' && typed.error) {
    throw new Error(typed.error);
  }

  return data as T;
}

export interface WhatsAppConnectionTestResponse {
  connected: boolean;
  verifiedAt?: string;
  verifiedPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  error?: string;
}

export async function testWhatsAppConnectionSupabaseEdge(
  garageId: string,
): Promise<WhatsAppConnectionTestResponse> {
  return invokeWhatsAppDispatchEdge<WhatsAppConnectionTestResponse>({
    action: 'test_connection',
    garageId,
  });
}

export interface SyncedMetaTemplateItem {
  metaTemplateName: string;
  approvalStatus: 'draft' | 'pending' | 'approved' | 'rejected';
  languageCode: string;
  category: string;
  body: string;
}

export async function syncMetaTemplatesSupabaseEdge(
  garageId: string,
): Promise<{ templates: SyncedMetaTemplateItem[] }> {
  return invokeWhatsAppDispatchEdge<{ templates: SyncedMetaTemplateItem[] }>({
    action: 'sync_templates',
    garageId,
  });
}

export interface LiveWhatsAppDispatchResultItem {
  jobCardId: string;
  logId?: string;
  status: 'sent' | 'failed' | 'skipped';
  whatsappMessageId?: string | null;
  error?: string;
}

export interface LiveWhatsAppBatchResponse {
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  results: LiveWhatsAppDispatchResultItem[];
}

export async function sendLiveWhatsAppBatchSupabaseEdge(params: {
  garageId: string;
  templateId: string;
  jobCardIds: string[];
}): Promise<LiveWhatsAppBatchResponse> {
  return invokeWhatsAppDispatchEdge<LiveWhatsAppBatchResponse>({
    action: 'send_batch',
    garageId: params.garageId,
    templateId: params.templateId,
    jobCardIds: params.jobCardIds,
  });
}
