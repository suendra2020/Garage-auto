import React, { useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { TemplateCategory } from '../../types/garage';
import { renderWhatsAppTemplate } from '../../utils/tenantLogic';
import { EmptyState } from '../common/EmptyState';

const VARIABLE_TOKENS = [
  '{{customer_name}}',
  '{{garage_name}}',
  '{{vehicle_reg}}',
  '{{vehicle_model}}',
  '{{job_card_no}}',
  '{{google_review_url}}',
  '{{instagram_url}}',
];

export function MessageTemplatesPage() {
  const {
    activeTenant,
    tenantTemplates,
    saveTemplateForActiveTenant,
    deleteTemplateForActiveTenant,
  } = useAppState();

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('delivery_notification');
  const [body, setBody] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [error, setError] = useState('');

  if (!activeTenant) return null;

  const openNewEditor = (preset?: {
    name: string;
    category: TemplateCategory;
    body: string;
  }) => {
    setEditingId(undefined);
    setName(preset?.name ?? '');
    setCategory(preset?.category ?? 'delivery_notification');
    setBody(
      preset?.body ??
        'Hello {{customer_name}}, your {{vehicle_model}} ({{vehicle_reg}}) under Job Card {{job_card_no}} has been delivered from {{garage_name}}. We would appreciate a quick review here: {{google_review_url}}',
    );
    setError('');
    setShowEditor(true);
  };

  const openExistingEditor = (tplId: string) => {
    const found = tenantTemplates.find((t) => t.id === tplId);
    if (!found) return;
    setEditingId(found.id);
    setName(found.name);
    setCategory(found.category);
    setBody(found.body);
    setError('');
    setShowEditor(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Template name is required.');
      return;
    }
    if (body.trim().length < 10) {
      setError('Template message body must be at least 10 characters.');
      return;
    }
    setError('');
    saveTemplateForActiveTenant({
      id: editingId,
      name,
      category,
      body,
    });
    setShowEditor(false);
  };

  const livePreview = renderWhatsAppTemplate(body, {
    customerName: 'Customer Name',
    garageName: activeTenant.branding.displayName,
    vehicleReg: 'MH12AB1234',
    vehicleModel: 'Vehicle Model',
    jobCardNumber: 'JC-101',
    googleReviewUrl: activeTenant.reviewSocialLinks.googleReviewUrl,
    instagramUrl: activeTenant.reviewSocialLinks.instagramUrl,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            WhatsApp Message Templates
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Customize delivery and Google Review templates strictly for{' '}
            <span className="font-medium text-slate-900">
              {activeTenant.branding.displayName}
            </span>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={() => openNewEditor()}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-800 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>New Template</span>
        </button>
      </div>

      {showEditor && (
        <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:grid-cols-12">
          <form onSubmit={handleSave} className="space-y-4 lg:col-span-7">
            <h3 className="font-display text-base font-semibold text-slate-900">
              {editingId ? 'Edit Template' : 'Create Message Template'}
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tpl-name" className="block text-sm font-medium text-slate-700">
                  Template Name
                </label>
                <input
                  id="tpl-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Delivery + Google Review"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="tpl-cat" className="block text-sm font-medium text-slate-700">
                  Category
                </label>
                <select
                  id="tpl-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="delivery_notification">Delivery Notification</option>
                  <option value="google_review_invite">Google Review Invite</option>
                  <option value="social_follow_up">Social Media Follow-Up</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="tpl-body" className="block text-sm font-medium text-slate-700">
                Message Body
              </label>
              <textarea
                id="tpl-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 p-3.5 text-sm text-slate-900 focus:border-navy-900 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {VARIABLE_TOKENS.map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setBody((prev) => `${prev} ${tok}`)}
                    className="min-h-[32px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs text-slate-700 hover:bg-slate-100"
                  >
                    + {tok}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800"
              >
                Save Template
              </button>
              <button
                type="button"
                onClick={() => setShowEditor(false)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>

          {/* Live WhatsApp Preview */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 lg:col-span-5">
            <p className="text-xs font-semibold text-slate-600">
              Rendered Message Preview
            </p>
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-white p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
              {livePreview}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Uses this garage&apos;s configured display name and review/social links.
            </p>
          </div>
        </section>
      )}

      {tenantTemplates.length === 0 && !showEditor ? (
        <EmptyState
          icon={FileText}
          title="No message templates configured yet"
          description="Create reusable delivery confirmation and Google Review templates with your garage branding and review link."
          actionLabel="Create Delivery & Review Template"
          onAction={() =>
            openNewEditor({
              name: 'Vehicle Delivery & Review Invite',
              category: 'delivery_notification',
              body: 'Hello {{customer_name}}, thank you for visiting {{garage_name}}! Your {{vehicle_model}} ({{vehicle_reg}}) [{{job_card_no}}] has been delivered. Please share your feedback on Google: {{google_review_url}}',
            })
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tenantTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      {tpl.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 capitalize">
                      {tpl.category.replaceAll('_', ' ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${tpl.name}`}
                    onClick={() => deleteTemplateForActiveTenant(tpl.id)}
                    className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                  {tpl.body}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">
                  Updated {new Date(tpl.updatedAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => openExistingEditor(tpl.id)}
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50"
                >
                  Edit Template
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
