import { getSupabaseClient } from '../lib/supabase';
import type {
  GarageRegistrationInput,
  GarageStatus,
  GarageTenant,
  ImportBatch,
  JobCard,
  MessageTemplate,
  PlatformRole,
  StaffCreationInput,
  TemplateCategory,
  TenantUser,
  UserSession,
  WhatsAppMessageLog,
} from '../types/garage';
import { generateSlug, isDeliveredStatus } from '../utils/tenantLogic';

interface DbGarageRow {
  id: string;
  garage_name: string;
  logo_url: string | null;
  address: string | null;
  phone_number: string | null;
  email: string | null;
  google_review_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  whatsapp_phone_number_id: string | null;
  subscription_plan: string;
  account_status: GarageStatus;
  created_at: string;
}

function mapDbGarageToTenant(row: DbGarageRow): GarageTenant {
  return {
    id: row.id,
    name: row.garage_name,
    slug: generateSlug(row.garage_name),
    planId: row.subscription_plan || 'plan_starter',
    status: row.account_status,
    createdAt: row.created_at,
    branding: {
      displayName: row.garage_name,
      tagline: 'Authorized Vehicle Service & Care',
      city: row.address ?? '',
      contactPhone: row.phone_number ?? '',
      contactEmail: row.email ?? '',
      logoUrl: row.logo_url ?? '',
      accentColor: '#0B192C',
    },
    whatsappSettings: {
      phoneNumberId: row.whatsapp_phone_number_id ?? '',
      wabaId: '',
      businessDisplayName: row.garage_name,
      connectionStatus: 'not_connected',
    },
    reviewSocialLinks: {
      googleReviewUrl: row.google_review_url ?? '',
      instagramUrl: row.instagram_url ?? '',
      facebookUrl: '',
      youtubeUrl: row.youtube_url ?? '',
      websiteUrl: '',
    },
  };
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
  if (profErr || !profile) return null;

  const authorizedTenants: GarageTenant[] = [];
  let effectiveRole: PlatformRole = profile.role as PlatformRole;

  (memberships ?? []).forEach((m: Record<string, unknown>) => {
    const g = m.garages as DbGarageRow | null;
    if (g) {
      authorizedTenants.push(mapDbGarageToTenant(g));
    }
    if (effectiveRole !== 'super_admin' && m.role === 'garage_admin') {
      effectiveRole = 'garage_admin';
    }
  });

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
      .select(
        'id, garage_id, job_card_id, recipient_number, message_type, message_status, whatsapp_message_id, sent_at, error_message, job_cards(customer_name, vehicle_number)',
      )
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
    isDelivered: isDeliveredStatus(r.job_card_status),
    deliveredAt: r.delivery_date,
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
    deliveredCount: 0,
    skippedCount: r.skipped_records,
    failedCount: r.failed_records,
  }));

  const templates: MessageTemplate[] = (tplRes.data ?? []).map((r) => ({
    id: r.id,
    tenantId: r.garage_id,
    name: r.template_name,
    category: r.template_category as TemplateCategory,
    body: r.template_content,
    metaTemplateName: r.meta_template_name ?? '',
    approvalStatus: r.approval_status,
    updatedAt: r.created_at,
  }));

  const whatsappLogs: WhatsAppMessageLog[] = (logsRes.data ?? []).map(
    (r: Record<string, unknown>) => {
      const joinedCard = r.job_cards as
        | { customer_name?: string; vehicle_number?: string }
        | null;
      const dbStatus = (r.message_status as WhatsAppMessageLog['status']) || 'draft_not_sent';
      return {
        id: r.id as string,
        tenantId: r.garage_id as string,
        jobCardId: (r.job_card_id as string) ?? '',
        customerName: joinedCard?.customer_name || (r.recipient_number as string),
        phoneNumber: r.recipient_number as string,
        vehicleRegistration: joinedCard?.vehicle_number || '',
        templateName: r.message_type as string,
        renderedMessage: (r.error_message as string) ?? '',
        status: dbStatus,
        createdAt: (r.sent_at as string) ?? new Date().toISOString(),
      };
    },
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

export async function updateSupabaseJobCardStatus(
  garageId: string,
  jobCardId: string,
  isDelivered: boolean,
) {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client
    .from('job_cards')
    .update({
      job_card_status: isDelivered ? 'Delivered' : 'In Progress',
      delivery_date: isDelivered ? new Date().toISOString() : null,
    })
    .eq('id', jobCardId)
    .eq('garage_id', garageId);
  if (error) throw error;
}

export async function insertSupabaseWhatsAppLogDraft(
  garageId: string,
  log: WhatsAppMessageLog,
) {
  const client = getSupabaseClient();
  if (!client) return;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    log.jobCardId,
  );
  const { error } = await client.from('whatsapp_logs').insert({
    garage_id: garageId,
    job_card_id: isUuid ? log.jobCardId : null,
    recipient_number: log.phoneNumber,
    message_type: log.templateName,
    message_status: 'draft_not_sent',
    sent_at: log.createdAt,
    error_message: log.renderedMessage,
  });
  if (error) throw error;
}

export async function insertSupabaseImportAndJobCards(
  garageId: string,
  batch: ImportBatch,
  cards: JobCard[],
) {
  const client = getSupabaseClient();
  if (!client) return;

  const { error: impErr } = await client.from('excel_imports').insert({
    garage_id: garageId,
    file_name: batch.fileName,
    total_records: batch.totalRows + batch.skippedCount,
    imported_records: cards.length,
    skipped_records: batch.skippedCount,
    failed_records: batch.failedCount,
  });
  if (impErr) throw impErr;

  if (cards.length > 0) {
    const payload = cards.map((c) => ({
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
    const { error: cardsErr } = await client
      .from('job_cards')
      .upsert(payload, { onConflict: 'garage_id,job_card_number' });
    if (cardsErr) throw cardsErr;
  }
}

export async function updateSupabaseGarageFields(
  garageId: string,
  updates: Partial<{
    garage_name: string;
    logo_url: string;
    address: string;
    phone_number: string;
    email: string;
    google_review_url: string;
    instagram_url: string;
    youtube_url: string;
    whatsapp_phone_number_id: string;
    account_status: GarageStatus;
  }>,
) {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.from('garages').update(updates).eq('id', garageId);
  if (error) throw error;
}
