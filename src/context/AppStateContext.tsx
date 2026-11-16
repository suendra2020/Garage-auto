import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SUBSCRIPTION_PLANS, DEFAULT_SYSTEM_SETTINGS } from '../data/plans';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import {
  createStaffAccountSupabase,
  createSupabaseGarageWorkspace,
  fetchSupabaseGarageScopedData,
  fetchSupabaseSuperAdminData,
  insertSupabaseImportAndJobCards,
  insertSupabaseWhatsAppLogDrafts,
  loadSupabaseAuthenticatedContext,
  registerGarageOwnerSupabase,
  resendVerificationEmailSupabase,
  saveSupabaseGarageImportMapping,
  sendPasswordResetEmailSupabase,
  signInSupabasePassword,
  signOutSupabase,
  updatePasswordSupabase,
  updateProfileNameSupabase,
  updateSupabaseGarageFields,
  updateSupabaseJobCardDelivery,
  writeLocalGarageImportMapping,
  writeLocalPublicGarageCache,
} from '../services/supabaseGarageService';
import type {
  AuthScreenView,
  ExcelColumnMapping,
  GarageBranding,
  GaragePage,
  GarageRegistrationInput,
  GarageStatus,
  GarageTenant,
  GarageWhatsAppSettings,
  ImportBatch,
  JobCard,
  MessageTemplate,
  PlatformRole,
  ReviewSocialLinks,
  StaffCreationInput,
  SubscriptionPlan,
  SuperAdminPage,
  SystemSettingsState,
  TemplateCategory,
  TenantUser,
  UserSession,
  WhatsAppMessageLog,
} from '../types/garage';
import {
  buildPublicGarageProfile,
  normalizeGarageSlug,
} from '../utils/garageConnection';
import {
  buildConfirmedDeliveryUpdate,
  evaluateCustomerOutreachEligibility,
  isAuthorizedDeliveryConfirmer,
} from '../utils/jobCardDelivery';
import {
  canAssignRole,
  canManageGarageStaff,
  canUserAccessTenant,
  filterDeliveredVehicles,
  generateSlug,
  renderWhatsAppTemplate,
  scopeByTenant,
} from '../utils/tenantLogic';

const STORAGE_KEY = 'garage_connect_workspace_v2';

interface PersistedWorkspaceState {
  session: UserSession | null;
  superAdminPage: SuperAdminPage;
  garagePage: GaragePage;
  tenants: GarageTenant[];
  users: TenantUser[];
  jobCards: JobCard[];
  importBatches: ImportBatch[];
  templates: MessageTemplate[];
  whatsappLogs: WhatsAppMessageLog[];
  plans: SubscriptionPlan[];
  systemSettings: SystemSettingsState;
}

const DEFAULT_STATE: PersistedWorkspaceState = {
  session: null,
  superAdminPage: 'overview',
  garagePage: 'dashboard',
  tenants: [],
  users: [
    {
      id: 'usr_superadmin_1',
      tenantId: null,
      fullName: 'Platform Super Admin',
      email: 'admin@garageconnect.app',
      role: 'super_admin',
      status: 'active',
      createdAt: '2026-11-14T00:00:00.000Z',
    },
  ],
  jobCards: [],
  importBatches: [],
  templates: [],
  whatsappLogs: [],
  plans: DEFAULT_SUBSCRIPTION_PLANS,
  systemSettings: DEFAULT_SYSTEM_SETTINGS,
};

function loadInitialState(): PersistedWorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      plans: parsed.plans?.length ? parsed.plans : DEFAULT_SUBSCRIPTION_PLANS,
      systemSettings: {
        ...DEFAULT_SYSTEM_SETTINGS,
        ...(parsed.systemSettings ?? {}),
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export interface CreateGarageInput {
  name: string;
  city: string;
  contactPhone: string;
  adminName: string;
  adminEmail: string;
  planId: string;
}

interface AppStateContextValue {
  supabaseConfigured: boolean;
  authLoading: boolean;
  authError: string;
  dashboardLoading: boolean;
  dashboardError: string;
  refreshGarageDashboard: () => Promise<void>;
  authView: AuthScreenView;
  setAuthView: (view: AuthScreenView) => void;
  pendingVerificationEmail: string;
  session: UserSession | null;
  superAdminPage: SuperAdminPage;
  garagePage: GaragePage;
  setSuperAdminPage: (page: SuperAdminPage) => void;
  setGaragePage: (page: GaragePage) => void;

  tenants: GarageTenant[];
  authorizedTenants: GarageTenant[];
  users: TenantUser[];
  allImportBatches: ImportBatch[];
  allJobCardsCount: number;
  plans: SubscriptionPlan[];
  systemSettings: SystemSettingsState;

  activeTenant: GarageTenant | null;
  tenantJobCards: JobCard[];
  tenantDeliveredVehicles: JobCard[];
  tenantImportBatches: ImportBatch[];
  tenantTemplates: MessageTemplate[];
  tenantWhatsAppLogs: WhatsAppMessageLog[];
  tenantUsers: TenantUser[];

  // Auth & Registration
  registerGarageOwner: (input: GarageRegistrationInput) => Promise<boolean>;
  loginGarageWithCredentials: (
    email: string,
    password: string,
    selectedTenantId?: string,
  ) => Promise<boolean>;
  loginSuperAdmin: (email: string) => void;
  requestPasswordReset: (email: string) => Promise<boolean>;
  completePasswordReset: (newPassword: string) => Promise<boolean>;
  resendEmailVerification: (email: string) => Promise<boolean>;
  completeLocalEmailVerification: () => void;
  refreshAuthSession: () => Promise<void>;
  updateMyProfileName: (fullName: string) => Promise<void>;
  updateMyPassword: (newPassword: string) => Promise<void>;
  logout: () => Promise<void>;

  // Staff & Tenant Operations
  switchActiveGarage: (tenantId: string) => Promise<void>;
  createGarageStaffAccount: (
    input: StaffCreationInput,
  ) => Promise<{ ok: boolean; message: string }>;
  startFreshGarageWorkspace: (
    input: CreateGarageInput,
    autoSignIn?: boolean,
  ) => Promise<GarageTenant>;
  openTenantWorkspaceAsPreview: (tenantId: string) => void;
  updateTenantStatus: (tenantId: string, status: GarageStatus) => void;
  invitePlatformOrGarageUser: (input: {
    fullName: string;
    email: string;
    role: PlatformRole;
    tenantId: string | null;
  }) => void;

  importJobCardsForActiveTenant: (
    batch: ImportBatch,
    cards: JobCard[],
    onBatchProgress?: (completedBatches: number, totalBatches: number) => void,
  ) => Promise<void>;
  saveGarageImportMapping: (
    tenantId: string,
    mapping: ExcelColumnMapping | null,
  ) => Promise<void>;
  confirmJobCardDelivery: (input: {
    jobCardId: string;
    deliveryDateIso: string;
    handoverConfirmed: boolean;
  }) => Promise<JobCard>;
  revertJobCardDelivery: (jobCardId: string) => Promise<void>;
  prepareWhatsAppDraftForCard: (jobCardId: string, templateId: string) => WhatsAppMessageLog | null;
  prepareWhatsAppDraftsForCards: (
    jobCardIds: readonly string[],
    templateId: string,
  ) => WhatsAppMessageLog[];

  saveTemplateForActiveTenant: (input: {
    id?: string;
    name: string;
    category: TemplateCategory;
    body: string;
  }) => void;
  deleteTemplateForActiveTenant: (templateId: string) => void;

  updateActiveBranding: (branding: GarageBranding, nextSlug?: string) => Promise<void>;
  updateActiveWhatsAppSettings: (settings: GarageWhatsAppSettings) => Promise<void>;
  updateActiveReviewLinks: (links: ReviewSocialLinks) => Promise<void>;

  updateSubscriptionPlan: (plan: SubscriptionPlan) => void;
  updateSystemSettings: (next: SystemSettingsState) => void;
  resetLocalWorkspace: () => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const supabaseConfigured = isSupabaseConfigured();
  const [authLoading, setAuthLoading] = useState<boolean>(supabaseConfigured);
  const [authError, setAuthError] = useState<string>('');
  const [dashboardLoading, setDashboardLoading] = useState<boolean>(false);
  const [dashboardError, setDashboardError] = useState<string>('');
  const [authView, setAuthView] = useState<AuthScreenView>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth_flow') === 'reset_password') {
        return 'reset-password';
      }
    }
    return 'login';
  });
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>('');
  const [pendingLocalSession, setPendingLocalSession] = useState<UserSession | null>(null);

  const [state, setState] = useState<PersistedWorkspaceState>(() => {
    if (supabaseConfigured) {
      return DEFAULT_STATE;
    }
    const base = loadInitialState();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const autostart = params.get('autostart');
      if (autostart === 'superadmin') {
        return {
          ...base,
          session: {
            userId: 'usr_superadmin_1',
            email: 'admin@garageconnect.app',
            fullName: 'Platform Super Admin',
            role: 'super_admin',
            tenantId: null,
            authorizedTenantIds: [],
            emailVerified: true,
            authMode: 'local_preview',
          },
          superAdminPage: 'overview',
        };
      }
      if (autostart === 'garage' && base.tenants.length > 0) {
        const firstTenant = base.tenants[0];
        return {
          ...base,
          session: {
            userId: `usr_${firstTenant.id}_admin`,
            email: `manager@${firstTenant.slug}.com`,
            fullName: `${firstTenant.name} Admin`,
            role: 'garage_admin',
            tenantId: firstTenant.id,
            authorizedTenantIds: [firstTenant.id],
            emailVerified: true,
            authMode: 'local_preview',
          },
          garagePage: 'dashboard',
        };
      }
    }
    return base;
  });

  useEffect(() => {
    if (supabaseConfigured) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
  }, [state, supabaseConfigured]);

  const syncSupabaseContext = async () => {
    if (!supabaseConfigured) return;
    setAuthLoading(true);
    try {
      const ctx = await loadSupabaseAuthenticatedContext();
      if (!ctx) {
        setState((prev) => ({ ...prev, session: null }));
        return;
      }

      if (ctx.session.role === 'super_admin') {
        const adminData = await fetchSupabaseSuperAdminData();
        setAuthError('');
        setState((prev) => ({
          ...prev,
          session: ctx.session,
          tenants: adminData.tenants,
          jobCards: [],
          importBatches: [],
          templates: [],
          whatsappLogs: [],
          users: adminData.users,
        }));
        return;
      }

      const activeId = ctx.session.tenantId;
      const scoped = activeId
        ? await fetchSupabaseGarageScopedData(activeId)
        : { jobCards: [], importBatches: [], templates: [], whatsappLogs: [], users: [] };

      setAuthError('');
      setState((prev) => ({
        ...prev,
        session: ctx.session,
        tenants: ctx.authorizedTenants,
        jobCards: scoped.jobCards,
        importBatches: scoped.importBatches,
        templates: scoped.templates,
        whatsappLogs: scoped.whatsappLogs,
        users: scoped.users,
      }));
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to load Supabase session.');
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!supabaseConfigured) return;
    const client = getSupabaseClient();
    if (!client) return;

    void syncSupabaseContext();
    const { data: sub } = client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthView('reset-password');
        return;
      }
      void syncSupabaseContext();
    });
    return () => sub.subscription.unsubscribe();
  }, [supabaseConfigured]);

  const activeTenantId = state.session?.tenantId ?? null;

  const authorizedTenants = useMemo(() => {
    if (!state.session) return [];
    if (state.session.role === 'super_admin') return state.tenants;
    return state.tenants.filter((t) => canUserAccessTenant(state.session, t.id));
  }, [state.session, state.tenants]);

  const activeTenant = useMemo(() => {
    if (!activeTenantId) return null;
    if (!canUserAccessTenant(state.session, activeTenantId)) return null;
    return state.tenants.find((t) => t.id === activeTenantId) ?? null;
  }, [state.session, state.tenants, activeTenantId]);

  const tenantJobCards = useMemo(
    () => scopeByTenant(state.jobCards, activeTenantId),
    [state.jobCards, activeTenantId],
  );

  const tenantDeliveredVehicles = useMemo(
    () => filterDeliveredVehicles(state.jobCards, activeTenantId),
    [state.jobCards, activeTenantId],
  );

  const tenantImportBatches = useMemo(
    () => scopeByTenant(state.importBatches, activeTenantId),
    [state.importBatches, activeTenantId],
  );

  const tenantTemplates = useMemo(
    () => scopeByTenant(state.templates, activeTenantId),
    [state.templates, activeTenantId],
  );

  const tenantWhatsAppLogs = useMemo(
    () => scopeByTenant(state.whatsappLogs, activeTenantId),
    [state.whatsappLogs, activeTenantId],
  );

  const tenantUsers = useMemo(() => {
    if (!activeTenantId) return [];
    return state.users.filter((u) => u.tenantId === activeTenantId);
  }, [state.users, activeTenantId]);

  const setSuperAdminPage = (page: SuperAdminPage) => {
    setState((prev) => ({ ...prev, superAdminPage: page }));
  };

  const setGaragePage = (page: GaragePage) => {
    setState((prev) => ({ ...prev, garagePage: page }));
  };

  const registerGarageOwner = async (
    input: GarageRegistrationInput,
  ): Promise<boolean> => {
    setAuthError('');
    const cleanEmail = input.email.trim().toLowerCase();

    if (supabaseConfigured) {
      try {
        setAuthLoading(true);
        const result = await registerGarageOwnerSupabase(input);
        if (result.status === 'verification_required') {
          setPendingVerificationEmail(result.email);
          setAuthView('verify-email');
          return true;
        }
        await syncSupabaseContext();
        return true;
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Garage registration failed.');
        return false;
      } finally {
        setAuthLoading(false);
      }
    }

    // Local preview registration: creates garage, owner profile, garage_admin link, and opens dashboard
    const existingEmail = state.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existingEmail) {
      setAuthError('An account with this email already exists. Please sign in instead.');
      return false;
    }

    const now = new Date().toISOString();
    const garageId = `gar_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const userId = `usr_${Date.now()}`;
    const newTenant: GarageTenant = {
      id: garageId,
      name: input.garageName.trim(),
      slug: generateSlug(input.garageName),
      planId: 'plan_starter',
      status: 'active',
      createdAt: now,
      branding: {
        displayName: input.garageName.trim(),
        tagline: 'Authorized Vehicle Service & Care',
        city: input.address.trim(),
        contactPhone: input.mobileNumber.trim(),
        contactEmail: cleanEmail,
        logoUrl: '',
        accentColor: '#0B192C',
      },
      whatsappSettings: {
        phoneNumberId: '',
        wabaId: '',
        businessDisplayName: input.garageName.trim(),
        connectionStatus: 'not_connected',
      },
      reviewSocialLinks: {
        googleReviewUrl: '',
        instagramUrl: '',
        facebookUrl: '',
        youtubeUrl: '',
        websiteUrl: '',
      },
    };

    const newOwner: TenantUser = {
      id: userId,
      tenantId: garageId,
      fullName: input.ownerName.trim(),
      email: cleanEmail,
      role: 'garage_admin',
      status: 'active',
      createdAt: now,
      passwordHashPreview: input.password,
    };

    setState((prev) => ({
      ...prev,
      tenants: [newTenant, ...prev.tenants],
      users: [newOwner, ...prev.users],
      session: {
        userId,
        email: cleanEmail,
        fullName: input.ownerName.trim(),
        role: 'garage_admin',
        tenantId: garageId,
        authorizedTenantIds: [garageId],
        emailVerified: true,
        authMode: 'local_preview',
      },
      garagePage: 'dashboard',
    }));

    return true;
  };

  const loginGarageWithCredentials = async (
    email: string,
    password: string,
    selectedTenantId?: string,
  ): Promise<boolean> => {
    setAuthError('');
    const cleanEmail = email.trim().toLowerCase();

    if (supabaseConfigured) {
      try {
        setAuthLoading(true);
        const data = await signInSupabasePassword(cleanEmail, password);
        if (data.user && !data.user.email_confirmed_at) {
          setPendingVerificationEmail(cleanEmail);
          setAuthView('verify-email');
          return false;
        }
        await syncSupabaseContext();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sign in failed.';
        if (msg.toLowerCase().includes('email not confirmed')) {
          setPendingVerificationEmail(cleanEmail);
          setAuthView('verify-email');
          return false;
        }
        setAuthError(msg);
        return false;
      } finally {
        setAuthLoading(false);
      }
    }

    // Local preview credential check: respect registered user role & garage memberships!
    const matchingUsers = state.users.filter(
      (u) => u.email.toLowerCase() === cleanEmail && u.role !== 'super_admin',
    );

    if (matchingUsers.length > 0) {
      const passMatch = matchingUsers.find(
        (u) => !u.passwordHashPreview || u.passwordHashPreview === password,
      );
      if (!passMatch) {
        setAuthError('Incorrect email or password.');
        return false;
      }
      const authorizedIds = matchingUsers
        .map((u) => u.tenantId)
        .filter((id): id is string => Boolean(id));
      const targetId =
        selectedTenantId && authorizedIds.includes(selectedTenantId)
          ? selectedTenantId
          : authorizedIds[0];

      if (!targetId) {
        setAuthError('No garage workspace is linked to this account.');
        return false;
      }

      const activeMember =
        matchingUsers.find((u) => u.tenantId === targetId) ?? matchingUsers[0];

      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.id === activeMember.id && u.status === 'invited'
            ? { ...u, status: 'active' }
            : u,
        ),
        session: {
          userId: activeMember.id,
          email: cleanEmail,
          fullName: activeMember.fullName,
          role: activeMember.role,
          tenantId: targetId,
          authorizedTenantIds: authorizedIds,
          emailVerified: true,
          authMode: 'local_preview',
        },
        garagePage: 'dashboard',
      }));
      return true;
    }

    // Preview convenience fallback ONLY if user selected an existing preview tenant on login
    if (selectedTenantId) {
      const targetTenant = state.tenants.find((t) => t.id === selectedTenantId);
      if (!targetTenant) {
        setAuthError('Selected garage workspace not found.');
        return false;
      }
      setState((prev) => ({
        ...prev,
        session: {
          userId: `usr_${Date.now()}`,
          email: cleanEmail,
          fullName: `${targetTenant.branding.displayName} Admin`,
          role: 'garage_admin',
          tenantId: targetTenant.id,
          authorizedTenantIds: [targetTenant.id],
          emailVerified: true,
          authMode: 'local_preview',
        },
        garagePage: 'dashboard',
      }));
      return true;
    }

    setAuthError('No account found for this email. Register your garage first.');
    return false;
  };

  const loginSuperAdmin = (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const existing = state.users.find(
      (u) => u.role === 'super_admin' && u.email.toLowerCase() === cleanEmail,
    );
    setState((prev) => ({
      ...prev,
      session: {
        userId: existing?.id ?? 'usr_superadmin_1',
        email: cleanEmail,
        fullName: existing?.fullName ?? 'Platform Super Admin',
        role: 'super_admin',
        tenantId: null,
        authorizedTenantIds: [],
        emailVerified: true,
        authMode: 'local_preview',
      },
      superAdminPage: 'overview',
    }));
  };

  const requestPasswordReset = async (email: string): Promise<boolean> => {
    setAuthError('');
    if (supabaseConfigured) {
      try {
        setAuthLoading(true);
        await sendPasswordResetEmailSupabase(email);
        return true;
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'Unable to send password reset email.',
        );
        return false;
      } finally {
        setAuthLoading(false);
      }
    }
    setPendingVerificationEmail(email.trim().toLowerCase());
    return true;
  };

  const completePasswordReset = async (newPassword: string): Promise<boolean> => {
    setAuthError('');
    if (supabaseConfigured) {
      try {
        setAuthLoading(true);
        await updatePasswordSupabase(newPassword);
        setAuthView('login');
        await syncSupabaseContext();
        return true;
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Unable to update password.');
        return false;
      } finally {
        setAuthLoading(false);
      }
    }
    if (pendingVerificationEmail) {
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.email.toLowerCase() === pendingVerificationEmail
            ? { ...u, passwordHashPreview: newPassword }
            : u,
        ),
      }));
    }
    setAuthView('login');
    return true;
  };

  const resendEmailVerification = async (email: string): Promise<boolean> => {
    setAuthError('');
    if (supabaseConfigured) {
      try {
        await resendVerificationEmailSupabase(email);
        return true;
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'Failed to resend verification email.',
        );
        return false;
      }
    }
    return true;
  };

  const completeLocalEmailVerification = () => {
    if (pendingLocalSession) {
      setState((prev) => ({
        ...prev,
        session: { ...pendingLocalSession, emailVerified: true },
        garagePage: 'dashboard',
      }));
      setPendingLocalSession(null);
    }
    setAuthView('login');
  };

  const refreshAuthSession = async () => {
    if (supabaseConfigured) {
      await syncSupabaseContext();
    }
  };

  const updateMyProfileName = async (fullName: string) => {
    if (!state.session) return;
    const clean = fullName.trim();
    if (!clean) return;

    if (supabaseConfigured && state.session.authMode === 'supabase') {
      await updateProfileNameSupabase(state.session.userId, clean);
    }

    setState((prev) => ({
      ...prev,
      session: prev.session ? { ...prev.session, fullName: clean } : null,
      users: prev.users.map((u) =>
        u.id === prev.session?.userId ? { ...u, fullName: clean } : u,
      ),
    }));
  };

  const updateMyPassword = async (newPassword: string) => {
    if (!state.session) return;
    if (supabaseConfigured && state.session.authMode === 'supabase') {
      await updatePasswordSupabase(newPassword);
      return;
    }
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === prev.session?.userId ? { ...u, passwordHashPreview: newPassword } : u,
      ),
    }));
  };

  const refreshGarageDashboard = async () => {
    if (!activeTenantId || !canUserAccessTenant(state.session, activeTenantId)) return;
    setDashboardError('');
    if (!supabaseConfigured || state.session?.authMode !== 'supabase') {
      return;
    }
    setDashboardLoading(true);
    try {
      const scoped = await fetchSupabaseGarageScopedData(activeTenantId);
      setState((prev) => ({
        ...prev,
        jobCards: scoped.jobCards,
        importBatches: scoped.importBatches,
        templates: scoped.templates,
        whatsappLogs: scoped.whatsappLogs,
        users: scoped.users,
      }));
    } catch (err) {
      setDashboardError(
        err instanceof Error ? err.message : 'Unable to fetch live garage statistics from Supabase.',
      );
    } finally {
      setDashboardLoading(false);
    }
  };

  const switchActiveGarage = async (tenantId: string) => {
    if (!state.session || !canUserAccessTenant(state.session, tenantId)) return;
    setDashboardError('');
    if (supabaseConfigured) {
      setDashboardLoading(true);
      try {
        const scoped = await fetchSupabaseGarageScopedData(tenantId);
        setState((prev) => ({
          ...prev,
          session: prev.session ? { ...prev.session, tenantId } : null,
          jobCards: scoped.jobCards,
          importBatches: scoped.importBatches,
          templates: scoped.templates,
          whatsappLogs: scoped.whatsappLogs,
          users: scoped.users,
          garagePage: 'dashboard',
        }));
      } catch (err) {
        setDashboardError(
          err instanceof Error ? err.message : 'Unable to switch garage workspace.',
        );
      } finally {
        setDashboardLoading(false);
      }
      return;
    }
    setState((prev) => ({
      ...prev,
      session: prev.session ? { ...prev.session, tenantId } : null,
      garagePage: 'dashboard',
    }));
  };

  const createGarageStaffAccount = async (
    input: StaffCreationInput,
  ): Promise<{ ok: boolean; message: string }> => {
    if (!activeTenant || !state.session) {
      return { ok: false, message: 'No active garage session.' };
    }
    if (!canManageGarageStaff(state.session, activeTenant.id)) {
      return {
        ok: false,
        message: 'Only an authorized Garage Admin can create staff accounts for this garage.',
      };
    }

    const cleanEmail = input.email.trim().toLowerCase();

    if (supabaseConfigured && state.session.authMode === 'supabase') {
      try {
        const res = await createStaffAccountSupabase(activeTenant.id, input);
        await syncSupabaseContext();
        return {
          ok: true,
          message:
            res.mode === 'created_active'
              ? `Staff account created for ${cleanEmail} with garage_staff access to ${activeTenant.branding.displayName}.`
              : `Invitation recorded for ${cleanEmail}. They will be linked as garage_staff to ${activeTenant.branding.displayName} upon registration.`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Unable to create staff account.',
        };
      }
    }

    const duplicate = state.users.some(
      (u) => u.tenantId === activeTenant.id && u.email.toLowerCase() === cleanEmail,
    );
    if (duplicate) {
      return {
        ok: false,
        message: 'A user with this email is already assigned to this garage.',
      };
    }

    const newStaff: TenantUser = {
      id: `usr_staff_${Date.now()}`,
      tenantId: activeTenant.id,
      fullName: input.fullName.trim(),
      email: cleanEmail,
      role: 'garage_staff',
      status: 'active',
      createdAt: new Date().toISOString(),
      passwordHashPreview: input.password,
    };

    setState((prev) => ({
      ...prev,
      users: [newStaff, ...prev.users],
    }));

    return {
      ok: true,
      message: `Staff account created for ${cleanEmail} (garage_staff · scoped strictly to ${activeTenant.branding.displayName}).`,
    };
  };

  const startFreshGarageWorkspace = async (
    input: CreateGarageInput,
    autoSignIn = false,
  ): Promise<GarageTenant> => {
    if (supabaseConfigured && state.session?.authMode === 'supabase') {
      const garageId = await createSupabaseGarageWorkspace({
        garageName: input.name,
        ownerName: input.adminName,
        address: input.city,
        phoneNumber: input.contactPhone,
        email: input.adminEmail,
        planId: input.planId,
      });
      await syncSupabaseContext();
      const created = state.tenants.find((t) => t.id === garageId);
      if (created) return created;
    }

    const now = new Date().toISOString();
    const id = `gar_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const slug = generateSlug(input.name);
    const newTenant: GarageTenant = {
      id,
      name: input.name.trim(),
      slug,
      planId: input.planId || 'plan_starter',
      status: 'active',
      createdAt: now,
      branding: {
        displayName: input.name.trim(),
        tagline: 'Authorized Vehicle Service & Care',
        city: input.city.trim(),
        contactPhone: input.contactPhone.trim(),
        contactEmail: input.adminEmail.trim().toLowerCase(),
        logoUrl: '',
        accentColor: '#0B192C',
      },
      whatsappSettings: {
        phoneNumberId: '',
        wabaId: '',
        businessDisplayName: input.name.trim(),
        connectionStatus: 'not_connected',
      },
      reviewSocialLinks: {
        googleReviewUrl: '',
        instagramUrl: '',
        facebookUrl: '',
        youtubeUrl: '',
        websiteUrl: '',
      },
    };

    const newAdminUser: TenantUser = {
      id: `usr_${Date.now()}`,
      tenantId: id,
      fullName: input.adminName.trim() || `${input.name.trim()} Admin`,
      email: input.adminEmail.trim().toLowerCase(),
      role: 'garage_admin',
      status: 'active',
      createdAt: now,
    };

    setState((prev) => ({
      ...prev,
      tenants: [newTenant, ...prev.tenants],
      users: [newAdminUser, ...prev.users],
      session: autoSignIn
        ? {
            userId: newAdminUser.id,
            email: newAdminUser.email,
            fullName: newAdminUser.fullName,
            role: 'garage_admin',
            tenantId: newTenant.id,
            authorizedTenantIds: [newTenant.id],
            emailVerified: true,
            authMode: 'local_preview',
          }
        : prev.session,
      garagePage: autoSignIn ? 'dashboard' : prev.garagePage,
    }));

    return newTenant;
  };

  const openTenantWorkspaceAsPreview = (tenantId: string) => {
    const tenant = state.tenants.find((t) => t.id === tenantId);
    if (!tenant) return;
    const adminUser = state.users.find(
      (u) => u.tenantId === tenantId && u.role === 'garage_admin',
    );
    setState((prev) => ({
      ...prev,
      session: {
        userId: adminUser?.id ?? `usr_preview_${tenant.id}`,
        email: adminUser?.email ?? `admin@${tenant.slug}.com`,
        fullName: adminUser?.fullName ?? `${tenant.branding.displayName} Admin`,
        role: 'garage_admin',
        tenantId: tenant.id,
        authorizedTenantIds: [tenant.id],
        emailVerified: true,
        authMode: 'local_preview',
      },
      garagePage: 'dashboard',
    }));
  };

  const logout = async () => {
    if (supabaseConfigured) {
      await signOutSupabase();
    }
    setAuthError('');
    setAuthView('login');
    setState((prev) => ({
      ...prev,
      session: null,
    }));
  };

  const updateTenantStatus = (tenantId: string, status: GarageStatus) => {
    if (state.session?.role !== 'super_admin') return;
    if (supabaseConfigured) {
      void updateSupabaseGarageFields(tenantId, { account_status: status });
    }
    setState((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) => (t.id === tenantId ? { ...t, status } : t)),
    }));
  };

  const invitePlatformOrGarageUser = (input: {
    fullName: string;
    email: string;
    role: PlatformRole;
    tenantId: string | null;
  }) => {
    const actorRole = state.session?.role ?? 'public';
    if (!canAssignRole(actorRole, input.role)) return;

    const targetTenantId = input.role === 'super_admin' ? null : input.tenantId;
    if (
      state.session?.role !== 'super_admin' &&
      (!targetTenantId || !canManageGarageStaff(state.session, targetTenantId))
    ) {
      return;
    }

    const newUser: TenantUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      tenantId: targetTenantId,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      status: 'invited',
      createdAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      users: [newUser, ...prev.users],
    }));
  };

  const importJobCardsForActiveTenant = async (
    batch: ImportBatch,
    cards: JobCard[],
    onBatchProgress?: (completedBatches: number, totalBatches: number) => void,
  ) => {
    const targetTenantId = batch.tenantId;
    if (!targetTenantId || !canUserAccessTenant(state.session, targetTenantId)) {
      throw new Error('You are not authorized to import job cards into this garage.');
    }
    const strictlyScopedCards = cards.filter((c) => c.tenantId === targetTenantId);

    if (supabaseConfigured && state.session?.authMode === 'supabase') {
      await insertSupabaseImportAndJobCards(
        targetTenantId,
        batch,
        strictlyScopedCards,
        onBatchProgress,
      );
    } else if (strictlyScopedCards.length > 0) {
      const totalChunks = Math.max(1, Math.ceil(strictlyScopedCards.length / 200));
      for (let i = 1; i <= totalChunks; i += 1) {
        onBatchProgress?.(i, totalChunks);
      }
    }

    setState((prev) => {
      const incomingByKey = new Map<string, JobCard>();
      strictlyScopedCards.forEach((c) => {
        incomingByKey.set(`${c.tenantId}::${c.jobCardNumber.trim().toUpperCase()}`, c);
      });

      const preservedExisting = prev.jobCards.filter(
        (c) => !incomingByKey.has(`${c.tenantId}::${c.jobCardNumber.trim().toUpperCase()}`),
      );

      return {
        ...prev,
        importBatches: [batch, ...prev.importBatches],
        jobCards: [...strictlyScopedCards, ...preservedExisting],
      };
    });
  };

  const saveGarageImportMapping = async (
    tenantId: string,
    mapping: ExcelColumnMapping | null,
  ) => {
    if (!tenantId || !canUserAccessTenant(state.session, tenantId)) {
      throw new Error('Unauthorized garage mapping update.');
    }
    if (supabaseConfigured && state.session?.authMode === 'supabase') {
      await saveSupabaseGarageImportMapping(tenantId, mapping);
    } else {
      writeLocalGarageImportMapping(tenantId, mapping);
    }
    setState((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) =>
        t.id === tenantId ? { ...t, savedImportMapping: mapping } : t,
      ),
    }));
  };

  const confirmJobCardDelivery = async (input: {
    jobCardId: string;
    deliveryDateIso: string;
    handoverConfirmed: boolean;
  }): Promise<JobCard> => {
    if (!activeTenantId || !state.session || !isAuthorizedDeliveryConfirmer(state.session, activeTenantId)) {
      throw new Error('Only authorized garage staff can confirm vehicle delivery.');
    }
    if (!input.handoverConfirmed) {
      throw new Error('Actual vehicle handover confirmation is required.');
    }
    const targetCard = state.jobCards.find(
      (c) => c.id === input.jobCardId && c.tenantId === activeTenantId,
    );
    if (!targetCard) {
      throw new Error('Job card not found in your active garage.');
    }

    const confirmationTimestampIso = new Date().toISOString();
    const updatedCard = buildConfirmedDeliveryUpdate({
      card: targetCard,
      deliveryDateIso: input.deliveryDateIso,
      confirmedByUserId: state.session.userId,
      confirmationTimestampIso,
    });

    if (supabaseConfigured && state.session.authMode === 'supabase') {
      await updateSupabaseJobCardDelivery({
        garageId: activeTenantId,
        jobCardId: targetCard.id,
        isDelivered: true,
        deliveredAt: updatedCard.deliveredAt,
        deliveredBy: updatedCard.deliveredBy ?? state.session.userId,
        deliveryConfirmedAt: updatedCard.deliveryConfirmedAt ?? confirmationTimestampIso,
      });
    }

    setState((prev) => ({
      ...prev,
      jobCards: prev.jobCards.map((card) =>
        card.id === targetCard.id && card.tenantId === activeTenantId ? updatedCard : card,
      ),
    }));

    return updatedCard;
  };

  const revertJobCardDelivery = async (jobCardId: string) => {
    if (!activeTenantId || !state.session || !isAuthorizedDeliveryConfirmer(state.session, activeTenantId)) {
      throw new Error('Only authorized garage staff can modify delivery status.');
    }
    if (supabaseConfigured && state.session.authMode === 'supabase') {
      await updateSupabaseJobCardDelivery({
        garageId: activeTenantId,
        jobCardId,
        isDelivered: false,
        deliveredAt: null,
        deliveredBy: null,
        deliveryConfirmedAt: null,
      });
    }
    setState((prev) => ({
      ...prev,
      jobCards: prev.jobCards.map((card) =>
        card.id === jobCardId && card.tenantId === activeTenantId
          ? {
              ...card,
              isDelivered: false,
              rawStatus: 'In Progress',
              deliveredAt: null,
              deliveredBy: null,
              deliveryConfirmedAt: null,
            }
          : card,
      ),
    }));
  };

  const prepareWhatsAppDraftsForCards = (
    jobCardIds: readonly string[],
    templateId: string,
  ): WhatsAppMessageLog[] => {
    if (!activeTenant) return [];
    const template = state.templates.find(
      (t) => t.id === templateId && t.tenantId === activeTenant.id,
    );
    if (!template) return [];

    const idSet = new Set(jobCardIds);
    const eligibleCards = state.jobCards.filter((card) => {
      if (!idSet.has(card.id) || card.tenantId !== activeTenant.id) return false;
      return evaluateCustomerOutreachEligibility(card, state.whatsappLogs, activeTenant.id).eligible;
    });

    if (eligibleCards.length === 0) return [];

    const now = new Date().toISOString();
    const createdLogs: WhatsAppMessageLog[] = eligibleCards.map((card, idx) => {
      const rendered = renderWhatsAppTemplate(template.body, {
        customerName: card.customerName,
        garageName: activeTenant.branding.displayName,
        vehicleReg: card.vehicleRegistration,
        vehicleModel: card.vehicleModel,
        jobCardNumber: card.jobCardNumber,
        googleReviewUrl: activeTenant.reviewSocialLinks.googleReviewUrl,
        instagramUrl: activeTenant.reviewSocialLinks.instagramUrl,
      });

      return {
        id: `wa_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
        tenantId: activeTenant.id,
        jobCardId: card.id,
        customerName: card.customerName,
        phoneNumber: card.phoneNumber,
        vehicleRegistration: card.vehicleRegistration,
        templateName: template.name,
        renderedMessage: rendered,
        status: 'draft_not_sent_api_disconnected',
        createdAt: now,
      };
    });

    if (supabaseConfigured && state.session?.authMode === 'supabase') {
      void insertSupabaseWhatsAppLogDrafts(activeTenant.id, createdLogs);
    }

    const preparedCardIds = new Set(eligibleCards.map((c) => c.id));
    setState((prev) => ({
      ...prev,
      whatsappLogs: [...createdLogs, ...prev.whatsappLogs],
      jobCards: prev.jobCards.map((c) =>
        preparedCardIds.has(c.id) && c.tenantId === activeTenant.id
          ? { ...c, whatsappDispatchStatus: 'draft_prepared' }
          : c,
      ),
    }));

    return createdLogs;
  };

  const prepareWhatsAppDraftForCard = (
    jobCardId: string,
    templateId: string,
  ): WhatsAppMessageLog | null => {
    const created = prepareWhatsAppDraftsForCards([jobCardId], templateId);
    return created[0] ?? null;
  };

  const saveTemplateForActiveTenant = (input: {
    id?: string;
    name: string;
    category: TemplateCategory;
    body: string;
  }) => {
    if (!activeTenantId) return;
    const now = new Date().toISOString();

    if (input.id) {
      setState((prev) => ({
        ...prev,
        templates: prev.templates.map((t) =>
          t.id === input.id && t.tenantId === activeTenantId
            ? {
                ...t,
                name: input.name.trim(),
                category: input.category,
                body: input.body,
                updatedAt: now,
              }
            : t,
        ),
      }));
    } else {
      const created: MessageTemplate = {
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        tenantId: activeTenantId,
        name: input.name.trim(),
        category: input.category,
        body: input.body,
        metaTemplateName: generateSlug(input.name),
        approvalStatus: 'draft',
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        templates: [created, ...prev.templates],
      }));
    }
  };

  const deleteTemplateForActiveTenant = (templateId: string) => {
    if (!activeTenantId) return;
    setState((prev) => ({
      ...prev,
      templates: prev.templates.filter(
        (t) => !(t.id === templateId && t.tenantId === activeTenantId),
      ),
    }));
  };

  const updateActiveBranding = async (branding: GarageBranding, nextSlug?: string) => {
    if (!activeTenantId || !activeTenant || !canManageGarageStaff(state.session, activeTenantId)) {
      throw new Error('Only an authorized Garage Admin can update garage settings.');
    }
    const previousSlug = activeTenant.slug;
    const resolvedSlug =
      normalizeGarageSlug(nextSlug ?? activeTenant.slug) || generateSlug(branding.displayName);

    if (supabaseConfigured && state.session?.authMode === 'supabase') {
      await updateSupabaseGarageFields(activeTenantId, {
        garage_name: branding.displayName,
        slug: resolvedSlug,
        address: branding.city,
        phone_number: branding.contactPhone,
        email: branding.contactEmail,
        logo_url: branding.logoUrl,
        customer_welcome_text: branding.customerWelcomeText ?? '',
      });
    }

    const updatedTenant: GarageTenant = {
      ...activeTenant,
      name: branding.displayName,
      slug: resolvedSlug,
      branding,
    };
    if (updatedTenant.status === 'active') {
      writeLocalPublicGarageCache(buildPublicGarageProfile(updatedTenant), previousSlug);
    }

    setState((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) => (t.id === activeTenantId ? updatedTenant : t)),
    }));
  };

  const updateActiveWhatsAppSettings = async (whatsappSettings: GarageWhatsAppSettings) => {
    if (!activeTenantId || !activeTenant || !canManageGarageStaff(state.session, activeTenantId)) {
      throw new Error('Only an authorized Garage Admin can update WhatsApp settings.');
    }
    if (supabaseConfigured && state.session?.authMode === 'supabase') {
      await updateSupabaseGarageFields(activeTenantId, {
        whatsapp_phone_number_id: whatsappSettings.phoneNumberId,
        whatsapp_waba_id: whatsappSettings.wabaId,
        whatsapp_display_name: whatsappSettings.businessDisplayName,
        whatsapp_default_message: whatsappSettings.defaultMessage ?? '',
      });
    }
    setState((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) =>
        t.id === activeTenantId ? { ...t, whatsappSettings } : t,
      ),
    }));
  };

  const updateActiveReviewLinks = async (reviewSocialLinks: ReviewSocialLinks) => {
    if (!activeTenantId || !activeTenant || !canManageGarageStaff(state.session, activeTenantId)) {
      throw new Error('Only an authorized Garage Admin can update review & social links.');
    }
    if (supabaseConfigured && state.session?.authMode === 'supabase') {
      await updateSupabaseGarageFields(activeTenantId, {
        google_review_url: reviewSocialLinks.googleReviewUrl,
        instagram_url: reviewSocialLinks.instagramUrl,
        youtube_url: reviewSocialLinks.youtubeUrl,
      });
    }
    const updatedTenant: GarageTenant = {
      ...activeTenant,
      reviewSocialLinks,
    };
    if (updatedTenant.status === 'active') {
      writeLocalPublicGarageCache(buildPublicGarageProfile(updatedTenant));
    }
    setState((prev) => ({
      ...prev,
      tenants: prev.tenants.map((t) => (t.id === activeTenantId ? updatedTenant : t)),
    }));
  };

  const updateSubscriptionPlan = (plan: SubscriptionPlan) => {
    if (state.session?.role !== 'super_admin') return;
    setState((prev) => ({
      ...prev,
      plans: prev.plans.map((p) => (p.id === plan.id ? plan : p)),
    }));
  };

  const updateSystemSettings = (next: SystemSettingsState) => {
    if (state.session?.role !== 'super_admin') return;
    setState((prev) => ({
      ...prev,
      systemSettings: next,
    }));
  };

  const resetLocalWorkspace = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState(DEFAULT_STATE);
  };

  return (
    <AppStateContext.Provider
      value={{
        supabaseConfigured,
        authLoading,
        authError,
        dashboardLoading,
        dashboardError,
        refreshGarageDashboard,
        authView,
        setAuthView,
        pendingVerificationEmail,
        session: state.session,
        superAdminPage: state.superAdminPage,
        garagePage: state.garagePage,
        setSuperAdminPage,
        setGaragePage,
        tenants: state.tenants,
        authorizedTenants,
        users: state.users,
        allImportBatches: state.importBatches,
        allJobCardsCount: state.jobCards.length,
        plans: state.plans,
        systemSettings: state.systemSettings,
        activeTenant,
        tenantJobCards,
        tenantDeliveredVehicles,
        tenantImportBatches,
        tenantTemplates,
        tenantWhatsAppLogs,
        tenantUsers,
        registerGarageOwner,
        loginGarageWithCredentials,
        loginSuperAdmin,
        requestPasswordReset,
        completePasswordReset,
        resendEmailVerification,
        completeLocalEmailVerification,
        refreshAuthSession,
        updateMyProfileName,
        updateMyPassword,
        logout,
        switchActiveGarage,
        createGarageStaffAccount,
        startFreshGarageWorkspace,
        openTenantWorkspaceAsPreview,
        updateTenantStatus,
        invitePlatformOrGarageUser,
        importJobCardsForActiveTenant,
        saveGarageImportMapping,
        confirmJobCardDelivery,
        revertJobCardDelivery,
        prepareWhatsAppDraftForCard,
        prepareWhatsAppDraftsForCards,
        saveTemplateForActiveTenant,
        deleteTemplateForActiveTenant,
        updateActiveBranding,
        updateActiveWhatsAppSettings,
        updateActiveReviewLinks,
        updateSubscriptionPlan,
        updateSystemSettings,
        resetLocalWorkspace,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used inside AppStateProvider');
  }
  return ctx;
}
