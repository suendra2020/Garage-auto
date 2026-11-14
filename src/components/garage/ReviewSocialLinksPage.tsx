import React, { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Link2 } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { isValidHttpUrl } from '../../utils/tenantLogic';

export function ReviewSocialLinksPage() {
  const { activeTenant, updateActiveReviewLinks } = useAppState();

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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
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
    updateActiveReviewLinks({
      googleReviewUrl: googleReviewUrl.trim(),
      instagramUrl: instagramUrl.trim(),
      facebookUrl: facebookUrl.trim(),
      youtubeUrl: youtubeUrl.trim(),
      websiteUrl: websiteUrl.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
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
      label: 'Google Business Profile Review URL',
      value: googleReviewUrl,
      setter: setGoogleReviewUrl,
      placeholder: 'https://g.page/r/your-garage-id/review',
      helper: 'Inserted automatically wherever {{google_review_url}} appears in templates.',
    },
    {
      id: 'instagram-url',
      label: 'Instagram Page URL',
      value: instagramUrl,
      setter: setInstagramUrl,
      placeholder: 'https://instagram.com/yourgarage',
      helper: 'Optional social link included in {{instagram_url}}.',
    },
    {
      id: 'youtube-url',
      label: 'YouTube Channel URL',
      value: youtubeUrl,
      setter: setYoutubeUrl,
      placeholder: 'https://youtube.com/@yourgarage',
      helper: 'Stored in garages.youtube_url for customer social invites.',
    },
    {
      id: 'facebook-url',
      label: 'Facebook Page URL',
      value: facebookUrl,
      setter: setFacebookUrl,
      placeholder: 'https://facebook.com/yourgarage',
      helper: 'Optional Facebook page link for customer follow-ups.',
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
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
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

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          {fields.map((f) => (
            <div key={f.id}>
              <label htmlFor={f.id} className="block text-sm font-medium text-slate-700">
                {f.label}
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id={f.id}
                  type="url"
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  placeholder={f.placeholder}
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-900 focus:outline-none"
                />
                {f.value.trim() && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleCopy(f.id, f.value)}
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
              className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-800"
            >
              Save Links
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
