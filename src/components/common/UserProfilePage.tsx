import React, { useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  KeyRound,
  LogOut,
  MailCheck,
  Shield,
  User,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { validatePasswordUpdate } from '../../utils/tenantLogic';

export function UserProfilePage() {
  const {
    session,
    authorizedTenants,
    resendEmailVerification,
    updateMyProfileName,
    updateMyPassword,
    logout,
  } = useAppState();

  const [fullName, setFullName] = useState(session?.fullName ?? '');
  const [nameSaved, setNameSaved] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  if (!session) return null;

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullName.trim().length < 2) return;
    await updateMyProfileName(fullName);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2500);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validatePasswordUpdate(newPassword, confirmPassword);
    if (!check.valid) {
      setPasswordError(check.error || 'Invalid password.');
      return;
    }
    setPasswordError('');
    await updateMyPassword(newPassword);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 2500);
  };

  const handleResendVerification = async () => {
    await resendEmailVerification(session.email);
    setVerificationSent(true);
  };

  const roleLabel =
    session.role === 'super_admin'
      ? 'Platform Super Admin'
      : session.role === 'garage_admin'
        ? 'Garage Admin'
        : 'Garage Staff';

  return (
    <div className="space-y-6">
      {/* Account Summary & Verification Status */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white">
              <User className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                {session.fullName}
              </h2>
              <p className="text-sm text-slate-600">{session.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 font-medium text-navy-900">
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                  Role: {roleLabel} (Protected)
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                {session.emailVerified ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                    <MailCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Email Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Email Pending Verification
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 whitespace-nowrap"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>

        {!session.emailVerified && (
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              {verificationSent
                ? `Verification email re-sent to ${session.email}.`
                : 'Check your inbox to verify your email address.'}
            </p>
            <button
              type="button"
              onClick={() => void handleResendVerification()}
              className="min-h-[40px] rounded-xl bg-navy-900 px-4 text-xs font-medium text-white"
            >
              Resend Verification Email
            </button>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit Profile Details */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="font-display text-base font-semibold text-slate-900">
            Profile Information
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Role and garage memberships are enforced by database RLS and cannot be self-modified.
          </p>

          <form onSubmit={(e) => void handleSaveName(e)} className="mt-4 space-y-4">
            <div>
              <label htmlFor="prof-name" className="block text-sm font-medium text-slate-700">
                Full Name
              </label>
              <input
                id="prof-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="prof-email" className="block text-sm font-medium text-slate-700">
                Email Address
              </label>
              <input
                id="prof-email"
                type="email"
                disabled
                value={session.email}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-500"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                {nameSaved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Profile saved
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800"
              >
                Save Profile
              </button>
            </div>
          </form>
        </section>

        {/* Change Password */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-navy-900" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold text-slate-900">
              Update Password
            </h3>
          </div>

          <form onSubmit={(e) => void handlePasswordChange(e)} className="mt-4 space-y-4">
            <div>
              <label htmlFor="prof-new-pwd" className="block text-sm font-medium text-slate-700">
                New Password
              </label>
              <input
                id="prof-new-pwd"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="prof-conf-pwd" className="block text-sm font-medium text-slate-700">
                Confirm New Password
              </label>
              <input
                id="prof-conf-pwd"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
              />
            </div>

            {passwordError && (
              <p role="alert" className="text-xs font-medium text-red-600">
                {passwordError}
              </p>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                {passwordSaved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Password updated
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800"
              >
                Update Password
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Authorized Garages (Read-only membership summary) */}
      {session.role !== 'super_admin' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-navy-900" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold text-slate-900">
              Authorized Garage Memberships ({authorizedTenants.length})
            </h3>
          </div>
          <ul className="mt-4 divide-y divide-slate-200">
            {authorizedTenants.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">{t.branding.displayName}</p>
                  <p className="text-xs text-slate-500">{t.branding.city}</p>
                </div>
                <span className="text-xs font-medium text-emerald-700">
                  {session.tenantId === t.id ? 'Active Workspace' : 'Authorized'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
