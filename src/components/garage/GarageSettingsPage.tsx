import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Lock, UserPlus } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import {
  canManageGarageStaff,
  validateStaffCreationInput,
} from '../../utils/tenantLogic';

export function GarageSettingsPage() {
  const {
    session,
    activeTenant,
    tenantUsers,
    updateActiveBranding,
    updateActiveWhatsAppSettings,
    createGarageStaffAccount,
  } = useAppState();

  const [displayName, setDisplayName] = useState(
    activeTenant?.branding.displayName ?? '',
  );
  const [tagline, setTagline] = useState(activeTenant?.branding.tagline ?? '');
  const [city, setCity] = useState(activeTenant?.branding.city ?? '');
  const [contactPhone, setContactPhone] = useState(
    activeTenant?.branding.contactPhone ?? '',
  );

  const [phoneNumberId, setPhoneNumberId] = useState(
    activeTenant?.whatsappSettings.phoneNumberId ?? '',
  );
  const [wabaId, setWabaId] = useState(
    activeTenant?.whatsappSettings.wabaId ?? '',
  );
  const [businessDisplayName, setBusinessDisplayName] = useState(
    activeTenant?.whatsappSettings.businessDisplayName ?? '',
  );

  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffErrors, setStaffErrors] = useState<Record<string, string>>({});
  const [staffFeedback, setStaffFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [staffSubmitting, setStaffSubmitting] = useState(false);

  const [brandingSaved, setBrandingSaved] = useState(false);
  const [waSaved, setWaSaved] = useState(false);

  if (!activeTenant) return null;

  const canManage = canManageGarageStaff(session, activeTenant.id);

  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !displayName.trim()) return;
    updateActiveBranding({
      ...activeTenant.branding,
      displayName: displayName.trim(),
      tagline: tagline.trim(),
      city: city.trim(),
      contactPhone: contactPhone.trim(),
    });
    setBrandingSaved(true);
    setTimeout(() => setBrandingSaved(false), 2500);
  };

  const handleSaveWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    updateActiveWhatsAppSettings({
      phoneNumberId: phoneNumberId.trim(),
      wabaId: wabaId.trim(),
      businessDisplayName: businessDisplayName.trim() || activeTenant.branding.displayName,
      connectionStatus: 'not_connected',
    });
    setWaSaved(true);
    setTimeout(() => setWaSaved(false), 2500);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setStaffFeedback(null);

    const validation = validateStaffCreationInput({
      fullName: staffName,
      email: staffEmail,
      password: staffPassword,
    });
    if (!validation.valid) {
      setStaffErrors(validation.errors);
      return;
    }

    setStaffErrors({});
    setStaffSubmitting(true);
    const result = await createGarageStaffAccount({
      fullName: staffName,
      email: staffEmail,
      password: staffPassword,
    });
    setStaffSubmitting(false);
    setStaffFeedback(result);

    if (result.ok) {
      setStaffName('');
      setStaffEmail('');
      setStaffPassword('');
    }
  };

  return (
    <div className="space-y-6">
      {!canManage && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p>
            Read-only Garage Staff view. Only an authorized Garage Admin for{' '}
            <span className="font-semibold">{activeTenant.branding.displayName}</span> can
            update garage settings or create staff accounts.
          </p>
        </div>
      )}

      {/* Garage Branding */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Garage Branding &amp; Profile
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Used in navigation headers and WhatsApp customer message templates for{' '}
          <span className="font-medium text-slate-900">
            {activeTenant.branding.displayName}
          </span>
          .
        </p>

        <form onSubmit={handleSaveBranding} className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="gs-name" className="block text-sm font-medium text-slate-700">
              Garage Display Name
            </label>
            <input
              id="gs-name"
              type="text"
              disabled={!canManage}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label htmlFor="gs-city" className="block text-sm font-medium text-slate-700">
              City / Address
            </label>
            <input
              id="gs-city"
              type="text"
              disabled={!canManage}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label htmlFor="gs-tagline" className="block text-sm font-medium text-slate-700">
              Service Tagline
            </label>
            <input
              id="gs-tagline"
              type="text"
              disabled={!canManage}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label htmlFor="gs-phone" className="block text-sm font-medium text-slate-700">
              Garage Contact Phone
            </label>
            <input
              id="gs-phone"
              type="tel"
              disabled={!canManage}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 sm:col-span-2">
              <div>
                {brandingSaved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Branding saved
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800"
              >
                Save Branding
              </button>
            </div>
          )}
        </form>
      </section>

      {/* WhatsApp Cloud API Settings */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              WhatsApp Business Settings
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Store this garage&apos;s Meta WhatsApp Cloud API identifiers separately from all other garages.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Integration Not Connected
          </span>
        </div>

        <form onSubmit={handleSaveWhatsApp} className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="wa-phone-id" className="block text-sm font-medium text-slate-700">
              Phone Number ID
            </label>
            <input
              id="wa-phone-id"
              type="text"
              disabled={!canManage}
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="e.g. 109482716354"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label htmlFor="wa-waba-id" className="block text-sm font-medium text-slate-700">
              WABA Account ID
            </label>
            <input
              id="wa-waba-id"
              type="text"
              disabled={!canManage}
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="e.g. 204958172635"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label htmlFor="wa-biz-name" className="block text-sm font-medium text-slate-700">
              Sender Display Name
            </label>
            <input
              id="wa-biz-name"
              type="text"
              disabled={!canManage}
              value={businessDisplayName}
              onChange={(e) => setBusinessDisplayName(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 sm:col-span-3">
              <div>
                {waSaved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    WhatsApp IDs stored (live dispatch still requires Edge Function)
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800"
              >
                Save WhatsApp Settings
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Tenant-Scoped Staff Account Creation */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-navy-900" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-slate-900">
            Staff Account Management ({tenantUsers.length})
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Staff accounts are strictly assigned the <span className="font-medium">garage_staff</span>{' '}
          role and can access only {activeTenant.branding.displayName}.
        </p>

        {canManage && (
          <form onSubmit={(e) => void handleCreateStaff(e)} noValidate className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="staff-name" className="block text-xs font-medium text-slate-600">
                  Staff Full Name
                </label>
                <input
                  id="staff-name"
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="e.g. Suresh Kumar"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                />
                {staffErrors.fullName && (
                  <p className="mt-1 text-xs text-red-600">{staffErrors.fullName}</p>
                )}
              </div>

              <div>
                <label htmlFor="staff-email" className="block text-xs font-medium text-slate-600">
                  Staff Work Email
                </label>
                <input
                  id="staff-email"
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="suresh@yourgarage.com"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                />
                {staffErrors.email && (
                  <p className="mt-1 text-xs text-red-600">{staffErrors.email}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="staff-password"
                  className="block text-xs font-medium text-slate-600"
                >
                  Temporary Password
                </label>
                <input
                  id="staff-password"
                  type="password"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                />
                {staffErrors.password && (
                  <p className="mt-1 text-xs text-red-600">{staffErrors.password}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Role assigned: <span className="font-semibold text-slate-700">Garage Staff</span>{' '}
                (cannot modify settings or access other garages)
              </p>
              <button
                type="submit"
                disabled={staffSubmitting}
                className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60 whitespace-nowrap"
              >
                {staffSubmitting ? 'Creating Staff...' : 'Create Staff Account'}
              </button>
            </div>
          </form>
        )}

        {staffFeedback && (
          <p
            role="status"
            className={`mt-3 text-xs font-medium ${
              staffFeedback.ok ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {staffFeedback.message}
          </p>
        )}

        <ul className="mt-5 divide-y divide-slate-200 border-t border-slate-200">
          {tenantUsers.map((member) => (
            <li
              key={member.id}
              className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{member.fullName}</p>
                <p className="text-xs text-slate-500">{member.email}</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="capitalize text-slate-600">
                  {member.role.replace('_', ' ')}
                </span>
                <span
                  className={`font-medium capitalize ${
                    member.status === 'active' ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {member.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
