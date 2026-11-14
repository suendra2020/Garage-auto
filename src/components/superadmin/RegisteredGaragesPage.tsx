import React, { useState } from 'react';
import { Building2, CheckCircle2, Plus, Search, X } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { GarageStatus } from '../../types/garage';
import { validateGarageCreation } from '../../utils/tenantLogic';
import { EmptyState } from '../common/EmptyState';

export function RegisteredGaragesPage() {
  const {
    tenants,
    plans,
    startFreshGarageWorkspace,
    updateTenantStatus,
    openTenantWorkspaceAsPreview,
  } = useAppState();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | GarageStatus>('all');
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [planId, setPlanId] = useState(plans[0]?.id ?? 'plan_starter');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredTenants = tenants.filter((t) => {
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      t.branding.displayName.toLowerCase().includes(q) ||
      t.branding.city.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateGarageCreation({
      name,
      city,
      contactPhone,
      adminEmail,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    await startFreshGarageWorkspace(
      {
        name,
        city,
        contactPhone,
        adminName: adminName || `${name.trim()} Admin`,
        adminEmail,
        planId,
      },
      false,
    );
    setName('');
    setCity('');
    setContactPhone('');
    setAdminName('');
    setAdminEmail('');
    setShowModal(false);
  };

  return (
    <div className="space-y-5">
      {/* Action & Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search registered garages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search garage name or city..."
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-900 focus:outline-none"
            />
          </div>

          <div
            role="group"
            aria-label="Filter garages by status"
            className="inline-flex rounded-xl bg-slate-100 p-1"
          >
            {(['all', 'active', 'pending', 'suspended'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-navy-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Register New Garage</span>
        </button>
      </div>

      {/* Garage Directory */}
      {tenants.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No garages registered on the platform"
          description="Each garage gets an isolated tenant boundary for job cards, customer phones, branding, review links, and WhatsApp credentials."
          actionLabel="Register First Garage"
          onAction={() => setShowModal(true)}
        />
      ) : filteredTenants.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No garages match your filter"
          description="Try clearing the search query or switching the status filter."
          actionLabel="Reset Filters"
          onAction={() => {
            setSearchQuery('');
            setStatusFilter('all');
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3.5">Garage Workspace</th>
                  <th className="px-5 py-3.5">Location</th>
                  <th className="px-5 py-3.5">Plan</th>
                  <th className="px-5 py-3.5">WhatsApp API</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTenants.map((tenant) => {
                  const plan = plans.find((p) => p.id === tenant.planId);
                  return (
                    <tr key={tenant.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900">
                          {tenant.branding.displayName}
                        </p>
                        <p className="font-mono text-xs text-slate-500">{tenant.slug}</p>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700">
                        {tenant.branding.city}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700">
                        {plan?.name ?? 'Starter Bay'}
                      </td>
                      <td className="px-5 py-3.5 text-amber-700 font-medium">
                        Not Connected
                      </td>
                      <td className="px-5 py-3.5">
                        <select
                          aria-label={`Status for ${tenant.branding.displayName}`}
                          value={tenant.status}
                          onChange={(e) =>
                            updateTenantStatus(tenant.id, e.target.value as GarageStatus)
                          }
                          className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
                        >
                          <option value="active">Active</option>
                          <option value="pending">Pending</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => openTenantWorkspaceAsPreview(tenant.id)}
                          className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                        >
                          Open Workspace
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <ul className="divide-y divide-slate-200 md:hidden">
            {filteredTenants.map((tenant) => {
              const plan = plans.find((p) => p.id === tenant.planId);
              return (
                <li key={tenant.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {tenant.branding.displayName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {tenant.branding.city} · {plan?.name ?? 'Starter Bay'}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                        tenant.status === 'active'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="capitalize">{tenant.status}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Status for ${tenant.branding.displayName}`}
                      value={tenant.status}
                      onChange={(e) =>
                        updateTenantStatus(tenant.id, e.target.value as GarageStatus)
                      }
                      className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="suspended">Suspended</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => openTenantWorkspaceAsPreview(tenant.id)}
                      className="min-h-[44px] rounded-xl bg-navy-900 px-4 text-sm font-medium text-white whitespace-nowrap"
                    >
                      Open Workspace
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Register New Garage Modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-garage-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <h2
                id="register-garage-heading"
                className="font-display text-lg font-bold text-slate-900"
              >
                Register New Garage Tenant
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close registration modal"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreate} noValidate className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="m-garage-name" className="block text-sm font-medium text-slate-700">
                    Garage Name
                  </label>
                  <input
                    id="m-garage-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Precision Motors"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="m-garage-city" className="block text-sm font-medium text-slate-700">
                    City
                  </label>
                  <input
                    id="m-garage-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Hyderabad"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                  />
                  {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city}</p>}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="m-garage-phone" className="block text-sm font-medium text-slate-700">
                    Contact Phone
                  </label>
                  <input
                    id="m-garage-phone"
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+91 98490 12345"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                  />
                  {errors.contactPhone && (
                    <p className="mt-1 text-xs text-red-600">{errors.contactPhone}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="m-garage-plan" className="block text-sm font-medium text-slate-700">
                    Plan
                  </label>
                  <select
                    id="m-garage-plan"
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (${p.monthlyPriceUsd}/mo)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="m-admin-name" className="block text-sm font-medium text-slate-700">
                    Garage Admin Name
                  </label>
                  <input
                    id="m-admin-name"
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Karan Reddy"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="m-admin-email" className="block text-sm font-medium text-slate-700">
                    Admin Email
                  </label>
                  <input
                    id="m-admin-email"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="owner@precisionmotors.in"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                  />
                  {errors.adminEmail && (
                    <p className="mt-1 text-xs text-red-600">{errors.adminEmail}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800"
                >
                  Create Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
