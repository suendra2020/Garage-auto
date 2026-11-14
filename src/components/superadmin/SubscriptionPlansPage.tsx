import React, { useState } from 'react';
import { Check, CreditCard } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { SubscriptionPlan } from '../../types/garage';

export function SubscriptionPlansPage() {
  const { plans, tenants, updateSubscriptionPlan } = useAppState();
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState<number>(0);
  const [draftCap, setDraftCap] = useState<number>(0);
  const [draftStaff, setDraftStaff] = useState<number>(0);

  const startEditing = (plan: SubscriptionPlan) => {
    setEditingPlanId(plan.id);
    setDraftPrice(plan.monthlyPriceUsd);
    setDraftCap(plan.monthlyMessageCap);
    setDraftStaff(plan.maxStaffUsers);
  };

  const saveEdit = (plan: SubscriptionPlan) => {
    updateSubscriptionPlan({
      ...plan,
      monthlyPriceUsd: Math.max(0, Number(draftPrice) || 0),
      monthlyMessageCap: Math.max(50, Number(draftCap) || 50),
      maxStaffUsers: Math.max(1, Number(draftStaff) || 1),
    });
    setEditingPlanId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold text-slate-900">
          SaaS Subscription Tiers
        </h2>
        <p className="text-sm text-slate-600">
          Configure monthly WhatsApp delivery quotas and staff seat limits per garage tier.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const enrolledCount = tenants.filter((t) => t.planId === plan.id).length;
          const isEditing = editingPlanId === plan.id;

          return (
            <div
              key={plan.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-900">
                      {plan.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">{plan.targetAudience}</p>
                  </div>
                  <CreditCard className="h-5 w-5 text-navy-900 shrink-0" aria-hidden="true" />
                </div>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold text-slate-900 tabular-nums">
                    ${plan.monthlyPriceUsd}
                  </span>
                  <span className="text-sm text-slate-500">/ month</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-3 text-xs">
                  <div>
                    <p className="text-slate-500">WhatsApp Quota</p>
                    <p className="mt-0.5 font-semibold text-slate-900 tabular-nums">
                      {plan.monthlyMessageCap.toLocaleString()} / mo
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Staff Seats</p>
                    <p className="mt-0.5 font-semibold text-slate-900 tabular-nums">
                      Up to {plan.maxStaffUsers}
                    </p>
                  </div>
                </div>

                <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600">
                          Price ($)
                        </label>
                        <input
                          type="number"
                          value={draftPrice}
                          onChange={(e) => setDraftPrice(Number(e.target.value))}
                          className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 px-2 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600">
                          WA Cap
                        </label>
                        <input
                          type="number"
                          value={draftCap}
                          onChange={(e) => setDraftCap(Number(e.target.value))}
                          className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 px-2 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600">
                          Seats
                        </label>
                        <input
                          type="number"
                          value={draftStaff}
                          onChange={(e) => setDraftStaff(Number(e.target.value))}
                          className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 px-2 text-sm tabular-nums"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(plan)}
                        className="min-h-[40px] flex-1 rounded-xl bg-navy-900 px-3 text-xs font-medium text-white"
                      >
                        Save Quotas
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPlanId(null)}
                        className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-medium text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 tabular-nums">
                      {enrolledCount} enrolled {enrolledCount === 1 ? 'garage' : 'garages'}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEditing(plan)}
                      className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Edit Quotas
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
