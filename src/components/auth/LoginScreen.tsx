import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Car,
  CheckCircle2,
  KeyRound,
  Lock,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import {
  validateGarageRegistrationInput,
  validateLoginInput,
  validatePasswordUpdate,
} from '../../utils/tenantLogic';

type LoginPortalTab = 'garage' | 'super-admin';

export function LoginScreen() {
  const {
    supabaseConfigured,
    authLoading,
    authError,
    authView,
    setAuthView,
    pendingVerificationEmail,
    tenants,
    registerGarageOwner,
    loginGarageWithCredentials,
    loginSuperAdmin,
    requestPasswordReset,
    completePasswordReset,
    resendEmailVerification,
    completeLocalEmailVerification,
    refreshAuthSession,
  } = useAppState();

  const [portalTab, setPortalTab] = useState<LoginPortalTab>('garage');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState<string>(tenants[0]?.id ?? '');

  // Garage registration form state (all 6 required fields)
  const [regGarageName, setRegGarageName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMobileNumber, setRegMobileNumber] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Forgot & Reset Password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSentTo, setForgotSentTo] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Verification feedback state
  const [resendSuccess, setResendSuccess] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const switchView = (next: typeof authView) => {
    setFormErrors({});
    setResendSuccess('');
    setForgotSentTo('');
    setAuthView(next);
  };

  const handleGarageLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateLoginInput(loginEmail, loginPassword);
    if (!check.valid) {
      setFormErrors(check.errors);
      return;
    }
    setFormErrors({});
    await loginGarageWithCredentials(
      loginEmail,
      loginPassword,
      selectedTenantId || tenants[0]?.id,
    );
  };

  const handleSuperAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateLoginInput(loginEmail, loginPassword);
    if (!check.valid) {
      setFormErrors(check.errors);
      return;
    }
    setFormErrors({});
    if (supabaseConfigured) {
      await loginGarageWithCredentials(loginEmail, loginPassword);
      return;
    }
    loginSuperAdmin(loginEmail);
  };

  const handleGarageRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      garageName: regGarageName,
      ownerName: regOwnerName,
      email: regEmail,
      mobileNumber: regMobileNumber,
      address: regAddress,
      password: regPassword,
    };
    const check = validateGarageRegistrationInput(input);
    if (!check.valid) {
      setFormErrors(check.errors);
      return;
    }
    setFormErrors({});
    await registerGarageOwner(input);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = forgotEmail.trim();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setFormErrors({ forgotEmail: 'Enter a valid email address.' });
      return;
    }
    setFormErrors({});
    const ok = await requestPasswordReset(clean);
    if (ok) {
      setForgotSentTo(clean);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validatePasswordUpdate(newPassword, confirmPassword);
    if (!check.valid) {
      setFormErrors({ resetPassword: check.error || 'Invalid password.' });
      return;
    }
    setFormErrors({});
    await completePasswordReset(newPassword);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleResendVerification = async () => {
    const targetEmail = pendingVerificationEmail || regEmail || loginEmail;
    if (!targetEmail) return;
    const ok = await resendEmailVerification(targetEmail);
    if (ok) {
      setResendSuccess(`Verification link sent to ${targetEmail}.`);
    }
  };

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-12">
      {/* Left Brand Panel (Dark Navy) */}
      <div className="bg-navy-900 px-6 py-8 text-white lg:col-span-5 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Car className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display text-lg font-bold tracking-tight text-white">
                GARAGE-CONNECT-APP
              </p>
              <p className="text-xs text-slate-300">
                Multi-Tenant Garage Delivery &amp; Review SaaS
              </p>
            </div>
          </div>

          <div className="mt-10 lg:mt-16">
            <h1 className="font-display text-2xl font-bold tracking-tight text-white text-balance sm:text-3xl lg:text-4xl">
              Turn completed job cards into verified deliveries and Google reviews.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300 sm:text-base">
              Register your automobile workshop, import Excel job cards, assign workshop staff
              strictly to your garage, and manage WhatsApp delivery outreach.
            </p>

            <ul className="mt-8 space-y-3.5 text-sm text-slate-200">
              <li className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <span>Row-Level Security &amp; strict per-garage isolation via Supabase PostgreSQL</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <span>Role-enforced Garage Admin &amp; Garage Staff accounts</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <span>Built for desktop bays, service advisor tablets, Android, and iPhone</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-navy-700 pt-5 text-xs text-slate-300 lg:mt-0">
          <div className="flex items-center gap-2">
            <Lock
              className={`h-3.5 w-3.5 ${supabaseConfigured ? 'text-emerald-400' : 'text-amber-400'}`}
              aria-hidden="true"
            />
            <span>
              {supabaseConfigured
                ? 'Supabase Auth & PostgreSQL Connected · WhatsApp Cloud API Pending'
                : 'Local Preview Mode · Configure VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY to connect live Supabase'}
            </span>
          </div>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="flex items-center justify-center px-4 py-8 sm:px-8 lg:col-span-7 lg:px-14 lg:py-12">
        <div className="w-full max-w-lg">
          {/* VIEW 1: LOGIN (Garage Owner/Staff + Existing Super Admin) */}
          {authView === 'login' && (
            <>
              <div
                role="tablist"
                aria-label="Portal login role"
                className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={portalTab === 'garage'}
                  onClick={() => {
                    setPortalTab('garage');
                    setFormErrors({});
                  }}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    portalTab === 'garage'
                      ? 'bg-white text-navy-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  <span>Garage Owner &amp; Staff</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={portalTab === 'super-admin'}
                  onClick={() => {
                    setPortalTab('super-admin');
                    setFormErrors({});
                  }}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    portalTab === 'super-admin'
                      ? 'bg-white text-navy-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Super Admin</span>
                </button>
              </div>

              {portalTab === 'garage' ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    Garage Sign In
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Sign in as a Garage Owner or Staff member to access your garage dashboard.
                  </p>

                  <form
                    onSubmit={(e) => void handleGarageLogin(e)}
                    noValidate
                    className="mt-6 space-y-4"
                  >
                    {!supabaseConfigured && tenants.length > 0 && (
                      <div>
                        <label
                          htmlFor="login-garage-select"
                          className="block text-sm font-medium text-slate-700"
                        >
                          Garage Workspace
                        </label>
                        <select
                          id="login-garage-select"
                          value={selectedTenantId || tenants[0]?.id || ''}
                          onChange={(e) => setSelectedTenantId(e.target.value)}
                          className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
                        >
                          {tenants.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.branding.displayName} ({t.branding.city})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="login-email"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Email Address
                      </label>
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="owner@yourgarage.com"
                        className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-900 focus:outline-none"
                      />
                      {formErrors.email && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="login-password"
                          className="block text-sm font-medium text-slate-700"
                        >
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => switchView('forgot-password')}
                          className="text-xs font-medium text-navy-900 hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <input
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-900 focus:outline-none"
                      />
                      {formErrors.password && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.password}</p>
                      )}
                    </div>

                    {authError && (
                      <p role="alert" className="text-xs font-medium text-red-600">
                        {authError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
                    >
                      <span>{authLoading ? 'Signing In...' : 'Sign In to Garage'}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>

                  <div className="mt-6 border-t border-slate-200 pt-5">
                    <p className="text-sm text-slate-600">New automobile garage?</p>
                    <button
                      type="button"
                      onClick={() => switchView('register')}
                      className="mt-2.5 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-navy-900 bg-white px-4 py-2.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-slate-50"
                    >
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                      <span>Register Your Garage</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    Platform Super Admin Sign In
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Restricted access for authorized platform administrators only. Public registration
                    for Super Admin is disabled.
                  </p>

                  <form
                    onSubmit={(e) => void handleSuperAdminLogin(e)}
                    noValidate
                    className="mt-6 space-y-4"
                  >
                    <div>
                      <label
                        htmlFor="sa-email"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Super Admin Email
                      </label>
                      <input
                        id="sa-email"
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="admin@garageconnect.app"
                        className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-900 focus:outline-none"
                      />
                      {formErrors.email && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="sa-password"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Password
                      </label>
                      <input
                        id="sa-password"
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-900 focus:outline-none"
                      />
                      {formErrors.password && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.password}</p>
                      )}
                    </div>

                    {authError && (
                      <p role="alert" className="text-xs font-medium text-red-600">
                        {authError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
                    >
                      <span>Sign In as Super Admin</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>

                    {!supabaseConfigured && (
                      <div className="border-t border-slate-200 pt-4">
                        <button
                          type="button"
                          onClick={() => loginSuperAdmin('admin@garageconnect.app')}
                          className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100"
                        >
                          Enter Super Admin Preview (admin@garageconnect.app)
                        </button>
                      </div>
                    )}
                  </form>
                </div>
              )}
            </>
          )}

          {/* VIEW 2: GARAGE REGISTRATION */}
          {authView === 'register' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    Register Your Garage
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Creates your owner account, isolated garage record, and assigns Garage Admin access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="inline-flex min-h-[40px] items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Sign In</span>
                </button>
              </div>

              <form
                onSubmit={(e) => void handleGarageRegister(e)}
                noValidate
                className="mt-5 space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="reg-garage-name"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Garage Name
                    </label>
                    <input
                      id="reg-garage-name"
                      type="text"
                      value={regGarageName}
                      onChange={(e) => setRegGarageName(e.target.value)}
                      placeholder="e.g. Apex Auto Care"
                      className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
                    />
                    {formErrors.garageName && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.garageName}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="reg-owner-name"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Owner Full Name
                    </label>
                    <input
                      id="reg-owner-name"
                      type="text"
                      value={regOwnerName}
                      onChange={(e) => setRegOwnerName(e.target.value)}
                      placeholder="e.g. Rajesh Patil"
                      className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
                    />
                    {formErrors.ownerName && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.ownerName}</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="reg-email"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Email Address
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="rajesh@apexauto.in"
                      className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
                    />
                    {formErrors.email && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="reg-mobile"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Mobile Number
                    </label>
                    <input
                      id="reg-mobile"
                      type="tel"
                      value={regMobileNumber}
                      onChange={(e) => setRegMobileNumber(e.target.value)}
                      placeholder="+91 98200 11223"
                      className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
                    />
                    {formErrors.mobileNumber && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.mobileNumber}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reg-address"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Garage Address
                  </label>
                  <input
                    id="reg-address"
                    type="text"
                    value={regAddress}
                    onChange={(e) => setRegAddress(e.target.value)}
                    placeholder="Plot 14, Industrial Estate, Pune"
                    className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
                  />
                  {formErrors.address && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.address}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="reg-password"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Password
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
                  />
                  {formErrors.password && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.password}</p>
                  )}
                </div>

                {authError && (
                  <p role="alert" className="text-xs font-medium text-red-600">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                >
                  <span>
                    {authLoading ? 'Creating Garage...' : 'Create Garage & Open Dashboard'}
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          )}

          {/* VIEW 3: FORGOT PASSWORD */}
          {authView === 'forgot-password' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <button
                type="button"
                onClick={() => switchView('login')}
                className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Back to Sign In</span>
              </button>

              <div className="mt-4 flex items-center gap-2.5">
                <KeyRound className="h-5 w-5 text-navy-900" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold text-slate-900">
                  Forgot Password
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Enter your registered email address to receive a password recovery link.
              </p>

              <form
                onSubmit={(e) => void handleForgotPassword(e)}
                noValidate
                className="mt-5 space-y-4"
              >
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Email Address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="owner@yourgarage.com"
                    className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
                  />
                  {formErrors.forgotEmail && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.forgotEmail}</p>
                  )}
                </div>

                {authError && (
                  <p role="alert" className="text-xs font-medium text-red-600">
                    {authError}
                  </p>
                )}

                {forgotSentTo && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        {supabaseConfigured
                          ? `Password reset email sent to ${forgotSentTo}. Check your inbox.`
                          : `Password reset initiated for ${forgotSentTo} (Local Preview Mode).`}
                      </span>
                    </p>
                    {!supabaseConfigured && (
                      <button
                        type="button"
                        onClick={() => switchView('reset-password')}
                        className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-navy-900 px-4 text-xs font-semibold text-navy-900 hover:bg-slate-50"
                      >
                        Set New Password (Preview)
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
                >
                  <span>{authLoading ? 'Sending...' : 'Send Reset Link'}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          )}

          {/* VIEW 4: EMAIL VERIFICATION */}
          {authView === 'verify-email' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <MailCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-slate-900">
                Verify Your Email Address
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                We sent a verification link to{' '}
                <span className="font-semibold text-slate-900">
                  {pendingVerificationEmail || regEmail || loginEmail || 'your inbox'}
                </span>
                . Confirm your email to activate your garage workspace and sign in.
              </p>

              {resendSuccess && (
                <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{resendSuccess}</span>
                </p>
              )}

              {authError && (
                <p role="alert" className="mt-3 text-xs font-medium text-red-600">
                  {authError}
                </p>
              )}

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => void refreshAuthSession()}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>I&apos;ve Verified My Email</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleResendVerification()}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Resend Verification Email
                </button>

                {!supabaseConfigured && (
                  <button
                    type="button"
                    onClick={completeLocalEmailVerification}
                    className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    Complete Verification (Preview)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="flex min-h-[40px] w-full items-center justify-center text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Return to Sign In
                </button>
              </div>
            </div>
          )}

          {/* VIEW 5: RESET PASSWORD */}
          {authView === 'reset-password' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h2 className="font-display text-xl font-bold text-slate-900">
                Set New Password
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Choose a new password for your GarageConnect account.
              </p>

              <form
                onSubmit={(e) => void handleResetPassword(e)}
                noValidate
                className="mt-5 space-y-4"
              >
                <div>
                  <label
                    htmlFor="reset-new-pwd"
                    className="block text-sm font-medium text-slate-700"
                  >
                    New Password
                  </label>
                  <input
                    id="reset-new-pwd"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reset-confirm-pwd"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="reset-confirm-pwd"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
                  />
                </div>

                {(formErrors.resetPassword || authError) && (
                  <p role="alert" className="text-xs font-medium text-red-600">
                    {formErrors.resetPassword || authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
                >
                  <span>Update Password &amp; Sign In</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="flex min-h-[40px] w-full items-center justify-center text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
