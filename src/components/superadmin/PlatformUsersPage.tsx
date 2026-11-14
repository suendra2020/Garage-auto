import React, { useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { PlatformRole } from '../../types/garage';

export function PlatformUsersPage() {
  const { users, tenants, invitePlatformOrGarageUser } = useAppState();
  const [roleFilter, setRoleFilter] = useState<'all' | PlatformRole>('all');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PlatformRole>('garage_admin');
  const [tenantId, setTenantId] = useState<string>(tenants[0]?.id ?? '');
  const [error, setError] = useState('');

  const filteredUsers = users.filter(
    (u) => roleFilter === 'all' || u.role === roleFilter,
  );

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid full name and email address.');
      return;
    }
    if (role !== 'super_admin' && !tenantId && tenants.length === 0) {
      setError('Register a garage first before inviting Garage Admin or Staff users.');
      return;
    }
    setError('');
    invitePlatformOrGarageUser({
      fullName,
      email,
      role,
      tenantId: role === 'super_admin' ? null : tenantId || tenants[0]?.id || null,
    });
    setFullName('');
    setEmail('');
  };

  return (
    <div className="space-y-6">
      {/* Invite User Panel */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <UserPlus className="h-5 w-5 text-navy-900" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-slate-900">
            Assign Platform or Garage User
          </h2>
        </div>

        <form onSubmit={handleInvite} noValidate className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="u-name" className="block text-xs font-medium text-slate-600">
              Full Name
            </label>
            <input
              id="u-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Anita Sharma"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900"
            />
          </div>
          <div>
            <label htmlFor="u-email" className="block text-xs font-medium text-slate-600">
              Email Address
            </label>
            <input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="anita@garage.com"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900"
            />
          </div>
          <div>
            <label htmlFor="u-role" className="block text-xs font-medium text-slate-600">
              Role
            </label>
            <select
              id="u-role"
              value={role}
              onChange={(e) => setRole(e.target.value as PlatformRole)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="garage_admin">Garage Admin</option>
              <option value="garage_staff">Garage Staff</option>
              <option value="super_admin">Platform Super Admin</option>
            </select>
          </div>
          <div>
            <label htmlFor="u-tenant" className="block text-xs font-medium text-slate-600">
              Assigned Garage
            </label>
            <select
              id="u-tenant"
              disabled={role === 'super_admin' || tenants.length === 0}
              value={role === 'super_admin' ? '' : tenantId || tenants[0]?.id || ''}
              onChange={(e) => setTenantId(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {role === 'super_admin' ? (
                <option value="">Platform-wide</option>
              ) : tenants.length === 0 ? (
                <option value="">No garages yet</option>
              ) : (
                tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.branding.displayName}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="min-h-[44px] w-full rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 whitespace-nowrap"
            >
              Add User
            </button>
          </div>
        </form>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </section>

      {/* Role Filter & User Directory */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Users className="h-4 w-4 text-navy-900" aria-hidden="true" />
          <span className="tabular-nums">{filteredUsers.length} Users</span>
        </div>

        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {(
            [
              { id: 'all', label: 'All Roles' },
              { id: 'super_admin', label: 'Super Admin' },
              { id: 'garage_admin', label: 'Garage Admin' },
              { id: 'garage_staff', label: 'Garage Staff' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRoleFilter(item.id)}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                roleFilter === item.id
                  ? 'bg-white text-navy-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3.5">User</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Garage Scope</th>
                <th className="px-5 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map((u) => {
                const tenant = tenants.find((t) => t.id === u.tenantId);
                return (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{u.fullName}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 capitalize">
                      {u.role.replace('_', ' ')}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">
                      {u.role === 'super_admin'
                        ? 'Platform Governance'
                        : tenant?.branding.displayName ?? 'Unassigned'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`font-medium capitalize ${
                          u.status === 'active' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-slate-200 md:hidden">
          {filteredUsers.map((u) => {
            const tenant = tenants.find((t) => t.id === u.tenantId);
            return (
              <li key={u.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{u.fullName}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                  <span className="text-xs font-medium capitalize text-emerald-700">
                    {u.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {u.role.replace('_', ' ')} ·{' '}
                  {u.role === 'super_admin'
                    ? 'Platform Governance'
                    : tenant?.branding.displayName ?? 'Unassigned'}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
