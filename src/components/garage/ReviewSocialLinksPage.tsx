import React, { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Link2, Lock } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { buildPublicGaragePath } from '../../utils/garageConnection';
import { canManageGarageStaff, isValidHttpUrl } from '../../utils/tenantLogic';

export function ReviewSocialLinksPage() {
  const { session, activeTenant, updateActiveReviewLinks, setGaragePage } = useAppState();

  const [googleReviewUrl, setGoogleReviewUrl] = useState(
    activeTenant?.reviewSocialLinks.googleReviewUrl ?? '',
  );
  const [instagramUrl, setInstagramUrl] = useState(
    activeTenant?.reviewSocialLinks.instagramUrl ?? '',
  );
  const [facebookUrl, setFacebookUrl] = useState(
    activeTenant?.reviewSocialLinks.facebookUrl ?? '',
  );
  const [youtubeUrl, setYoutubeUrl] = useState(
    activeTenant?.reviewSocialLinks.youtubeUrl ?? '',
  );
  const [websiteUrl, setWebsiteUrl] = useState(
    activeTenant?.reviewSocialLinks.websiteUrl ?? '',
  );
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [copiedField, setCopiedField] = useState('');

  if (!activeTenant) return null;

  const canManage = canManageGarageStaff(session, activeTenant.id);
  const publicPath = buildPublicGaragePath(activeTenant.slug);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (
      !isValidHttpUrl(googleReviewUrl) ||
      !isValidHttpUrl(instagramUrl) ||
      !isValidHttpUrl(facebookUrl) ||
      !isValidHttpUrl(youtubeUrl) ||
      !isValidHttpUrl(websiteUrl)
    ) {
      setError('All links must begin with https:// or http:// (or leave optional links blank).');
      return;
    }
    setError('');
    try {
      await updateActiveReviewLinks({
        googleReviewUrl: googleReviewUrl.trim(),
        instagramUrl: instagramUrl.trim(),
        facebookUrl: facebookUrl.trim(),
        youtubeUrl: youtubeUrl.trim(),
        websiteUrl: websiteUrl.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save review and social links.');
    }
  };

  const handleCopy = async (label: string, value: string) => {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      setCopiedField(label);
      setTimeout(() => setCopiedField(''), 1800);
    } catch {
      // clipboard blocked in headless context
    }
  };

  const fields = [
    {
      id: 'google-review-url',
      label: 'Google Business Profile Review URL (Optional)',
      value: googleReviewUrl,
      setter: setGoogleReviewUrl,
      placeholder: 'https://g.page/r/your-garage-id/review',
      helper: 'Optional and accessible to all customers equally without incentives or filtering.',
    },
    {
      id: 'instagram-url',
      label: 'Instagram Page URL',
      value: instagramUrl,
      setter: setInstagramUrl,
      placeholder: 'https://instagram.com/yourgarage',
      helper: 'Displayed on your public Customer Connection Page and {{instagram_url}} templates.',
    },
    {
      id: 'youtube-url',
      label: 'YouTube Channel URL',
      value: youtubeUrl,
      setter: setYoutubeUrl,
      placeholder: 'https://youtube.com/@yourgarage',
      helper: 'Displayed on your public Customer Connection Page for customer follow-ups.',
    },
    {
      id: 'facebook-url',
      label: 'Facebook Page URL',
      value: facebookUrl,
      setter: setFacebookUrl,
      placeholder: 'https://facebook.com/yourgarage',
      helper: 'Optional Facebook page link.',
    },
    {
      id: 'website-url',
      label: 'Garage Website URL',
      value: websiteUrl,
      setter: setWebsiteUrl,
      placeholder: 'https://yourgarage.com',
      helper: 'Optional website link.',
    },
  ];

  return (
    <div className="space-y-6">
      {!canManage && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p>
            Read-only Garage Staff view. Only an authorized Garage Admin can modify review and social links.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Link2 className="mt-0.5 h-5 w-5 text-navy-900" aria-hidden="true" />
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Google Review &amp; Social Links
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Dedicated strictly to{' '}
                <span className="font-medium text-slate-900">
                  {activeTenant.branding.displayName}
                </span>
                . Other garages cannot access or overwrite these URLs.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setGaragePage('garage-settings')}
              className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              Logo &amp; Preview Settings
            </button>
            <a
              href={publicPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-navy-900 px-3.5 text-xs font-medium text-white hover:bg-navy-800 whitespace-nowrap"
            >
              <span>Open Public Page</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>

        <form onSubmit={(e) => void handleSave(e)} className="mt-6 space-y-5">
          {fields.map((f) => (
            <div key={f.id}>
              <label htmlFor={f.id} className="block text-sm font-medium text-slate-700">
                {f.label}
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id={f.id}
                  type="url"
                  disabled={!canManage}
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  placeholder={f.placeholder}
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-900 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                />
                {f.value.trim() && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleCopy(f.id, f.value)}
                      aria-label={`Copy ${f.label}`}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <a
                      href={f.value}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${f.label}`}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {copiedField === f.id ? 'Copied to clipboard' : f.helper}
              </p>
            </div>
          ))}

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}

          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div>
                {saved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Review &amp; social links saved
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-800 whitespace-nowrap"
              >
                Save Links
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
