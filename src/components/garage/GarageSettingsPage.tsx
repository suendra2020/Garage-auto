import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Instagram,
  Lock,
  Star,
  Trash2,
  Upload,
  UserPlus,
  X,
  Youtube,
} from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import type { PublicGarageConnectionProfile } from '../../types/garage';
import {
  DEFAULT_CUSTOMER_WELCOME_TEXT,
  buildPublicGaragePath,
  getInitials,
  normalizeGarageSlug,
  validateGarageProfileSettingsInput,
  validateGarageSocialLinksInput,
} from '../../utils/garageConnection';
import {
  canManageGarageStaff,
  validateStaffCreationInput,
} from '../../utils/tenantLogic';
import { validateWhatsAppCredentialsInput } from '../../utils/whatsappCloud';
import { CustomerConnectionCard } from '../public/CustomerConnectionCard';

async function fileToResizedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read logo image file.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Invalid image file.'));
        return;
      }
      // Keep crisp SVG uploads directly if compact, otherwise draw onto a 256px max canvas
      if (file.type === 'image/svg+xml' && result.length < 100_000) {
        resolve(result);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported logo image format.'));
      img.onload = () => {
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(result);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png', 0.9));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export function GarageSettingsPage() {
  const {
    session,
    activeTenant,
    tenants,
    tenantUsers,
    updateActiveBranding,
    updateActiveReviewLinks,
    updateActiveWhatsAppSettings,
    testActiveWhatsAppConnection,
    createGarageStaffAccount,
  } = useAppState();

  // Profile & Customer Connection Page fields
  const [displayName, setDisplayName] = useState(activeTenant?.branding.displayName ?? '');
  const [slug, setSlug] = useState(activeTenant?.slug ?? '');
  const [logoUrl, setLogoUrl] = useState(activeTenant?.branding.logoUrl ?? '');
  const [city, setCity] = useState(activeTenant?.branding.city ?? '');
  const [contactPhone, setContactPhone] = useState(activeTenant?.branding.contactPhone ?? '');
  const [customerWelcomeText, setCustomerWelcomeText] = useState(
    activeTenant?.branding.customerWelcomeText ?? '',
  );
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState('');
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Google Review & Social Links fields
  const [googleReviewUrl, setGoogleReviewUrl] = useState(
    activeTenant?.reviewSocialLinks.googleReviewUrl ?? '',
  );
  const [instagramUrl, setInstagramUrl] = useState(
    activeTenant?.reviewSocialLinks.instagramUrl ?? '',
  );
  const [youtubeUrl, setYoutubeUrl] = useState(
    activeTenant?.reviewSocialLinks.youtubeUrl ?? '',
  );
  const [socialErrors, setSocialErrors] = useState<Record<string, string>>({});
  const [socialSaving, setSocialSaving] = useState(false);
  const [socialSaveError, setSocialSaveError] = useState('');
  const [socialSaved, setSocialSaved] = useState(false);

  // WhatsApp Settings fields
  const [phoneNumberId, setPhoneNumberId] = useState(
    activeTenant?.whatsappSettings.phoneNumberId ?? '',
  );
  const [wabaId, setWabaId] = useState(activeTenant?.whatsappSettings.wabaId ?? '');
  const [businessDisplayName, setBusinessDisplayName] = useState(
    activeTenant?.whatsappSettings.businessDisplayName ?? '',
  );
  const [defaultMessage, setDefaultMessage] = useState(
    activeTenant?.whatsappSettings.defaultMessage ?? '',
  );
  const [waSaving, setWaSaving] = useState(false);
  const [waSaveError, setWaSaveError] = useState('');
  const [waSaved, setWaSaved] = useState(false);
  const [waFieldErrors, setWaFieldErrors] = useState<Record<string, string>>({});
  const [waTesting, setWaTesting] = useState(false);
  const [waTestFeedback, setWaTestFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Staff Account fields
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffErrors, setStaffErrors] = useState<Record<string, string>>({});
  const [staffFeedback, setStaffFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [staffSubmitting, setStaffSubmitting] = useState(false);

  // Sync form state whenever user switches active garage tenant
  useEffect(() => {
    if (!activeTenant) return;
    setDisplayName(activeTenant.branding.displayName);
    setSlug(activeTenant.slug);
    setLogoUrl(activeTenant.branding.logoUrl);
    setCity(activeTenant.branding.city);
    setContactPhone(activeTenant.branding.contactPhone);
    setCustomerWelcomeText(activeTenant.branding.customerWelcomeText ?? '');
    setGoogleReviewUrl(activeTenant.reviewSocialLinks.googleReviewUrl);
    setInstagramUrl(activeTenant.reviewSocialLinks.instagramUrl);
    setYoutubeUrl(activeTenant.reviewSocialLinks.youtubeUrl);
    setPhoneNumberId(activeTenant.whatsappSettings.phoneNumberId);
    setWabaId(activeTenant.whatsappSettings.wabaId);
    setBusinessDisplayName(activeTenant.whatsappSettings.businessDisplayName);
    setDefaultMessage(activeTenant.whatsappSettings.defaultMessage ?? '');
    setProfileErrors({});
    setSocialErrors({});
  }, [activeTenant?.id]);

  const effectiveSlug = normalizeGarageSlug(slug || activeTenant?.slug || displayName);
  const publicPath = buildPublicGaragePath(effectiveSlug);
  const fullPublicUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${publicPath}` : publicPath;

  const previewProfile = useMemo<PublicGarageConnectionProfile>(
    () => ({
      id: activeTenant?.id ?? '',
      slug: effectiveSlug,
      displayName: displayName.trim() || activeTenant?.branding.displayName || 'Garage',
      logoUrl: logoUrl.trim(),
      contactPhone: contactPhone.trim(),
      address: city.trim(),
      customerWelcomeText: customerWelcomeText.trim() || DEFAULT_CUSTOMER_WELCOME_TEXT,
      googleReviewUrl: googleReviewUrl.trim(),
      instagramUrl: instagramUrl.trim(),
      youtubeUrl: youtubeUrl.trim(),
    }),
    [
      activeTenant,
      effectiveSlug,
      displayName,
      logoUrl,
      contactPhone,
      city,
      customerWelcomeText,
      googleReviewUrl,
      instagramUrl,
      youtubeUrl,
    ],
  );

  if (!activeTenant) return null;

  const canManage = canManageGarageStaff(session, activeTenant.id);

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploadError('');
    if (!file.type.startsWith('image/')) {
      setLogoUploadError('Please choose a PNG, JPG, WebP, or SVG logo image.');
      return;
    }
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setLogoUrl(dataUrl);
    } catch (err) {
      setLogoUploadError(
        err instanceof Error ? err.message : 'Unable to process selected logo file.',
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setProfileSaveError('');
    setBrandingSaved(false);

    const validation = validateGarageProfileSettingsInput(
      {
        displayName,
        slug,
        logoUrl,
        contactPhone,
        address: city,
        customerWelcomeText,
      },
      activeTenant.id,
      tenants,
    );

    if (!validation.valid) {
      setProfileErrors(validation.errors);
      return;
    }

    setProfileErrors({});
    setProfileSaving(true);
    try {
      setSlug(validation.normalizedSlug);
      await updateActiveBranding(
        {
          ...activeTenant.branding,
          displayName: displayName.trim(),
          logoUrl: logoUrl.trim(),
          city: city.trim(),
          contactPhone: contactPhone.trim(),
          customerWelcomeText: customerWelcomeText.trim(),
        },
        validation.normalizedSlug,
      );
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 3000);
    } catch (err) {
      setProfileSaveError(
        err instanceof Error ? err.message : 'Unable to save garage profile settings.',
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveSocialLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSocialSaveError('');
    setSocialSaved(false);

    const validation = validateGarageSocialLinksInput({
      googleReviewUrl,
      instagramUrl,
      youtubeUrl,
    });
    if (!validation.valid) {
      setSocialErrors(validation.errors);
      return;
    }

    setSocialErrors({});
    setSocialSaving(true);
    try {
      await updateActiveReviewLinks({
        ...activeTenant.reviewSocialLinks,
        googleReviewUrl: googleReviewUrl.trim(),
        instagramUrl: instagramUrl.trim(),
        youtubeUrl: youtubeUrl.trim(),
      });
      setSocialSaved(true);
      setTimeout(() => setSocialSaved(false), 3000);
    } catch (err) {
      setSocialSaveError(
        err instanceof Error ? err.message : 'Unable to save review and social URLs.',
      );
    } finally {
      setSocialSaving(false);
    }
  };

  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setWaSaveError('');
    setWaSaved(false);
    setWaTestFeedback(null);

    if (phoneNumberId.trim() || wabaId.trim()) {
      const check = validateWhatsAppCredentialsInput({ phoneNumberId, wabaId });
      if (!check.valid) {
        setWaFieldErrors(check.errors);
        return;
      }
    }
    setWaFieldErrors({});

    setWaSaving(true);
    try {
      await updateActiveWhatsAppSettings({
        ...activeTenant.whatsappSettings,
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaId.trim(),
        businessDisplayName: businessDisplayName.trim() || displayName.trim(),
        defaultMessage: defaultMessage.trim(),
      });
      setWaSaved(true);
      setTimeout(() => setWaSaved(false), 3000);
    } catch (err) {
      setWaSaveError(
        err instanceof Error ? err.message : 'Unable to save WhatsApp settings.',
      );
    } finally {
      setWaSaving(false);
    }
  };

  const handleTestWhatsAppConnection = async () => {
    if (!canManage) return;
    setWaSaveError('');
    setWaTestFeedback(null);

    const check = validateWhatsAppCredentialsInput({ phoneNumberId, wabaId });
    if (!check.valid) {
      setWaFieldErrors(check.errors);
      setWaTestFeedback({
        ok: false,
        message: 'Enter valid numeric Phone Number ID and WABA Account ID before testing.',
      });
      return;
    }
    setWaFieldErrors({});
    setWaTesting(true);

    try {
      // Persist edited IDs first so the Edge Function tests the latest garage credentials
      const idsChanged =
        phoneNumberId.trim() !== activeTenant.whatsappSettings.phoneNumberId.trim() ||
        wabaId.trim() !== activeTenant.whatsappSettings.wabaId.trim() ||
        businessDisplayName.trim() !== activeTenant.whatsappSettings.businessDisplayName.trim() ||
        defaultMessage.trim() !== (activeTenant.whatsappSettings.defaultMessage ?? '').trim();

      if (idsChanged) {
        await updateActiveWhatsAppSettings({
          ...activeTenant.whatsappSettings,
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim(),
          businessDisplayName: businessDisplayName.trim() || displayName.trim(),
          defaultMessage: defaultMessage.trim(),
        });
      }

      const res = await testActiveWhatsAppConnection();
      if (res.connected) {
        const detail = [
          res.verifiedName ? `Verified Name: ${res.verifiedName}` : '',
          res.verifiedPhoneNumber ? `Phone: ${res.verifiedPhoneNumber}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        setWaTestFeedback({
          ok: true,
          message: `WhatsApp Cloud API connected${detail ? ` (${detail})` : ''}.`,
        });
      } else {
        setWaTestFeedback({
          ok: false,
          message: res.error || 'Meta Graph API connection test failed.',
        });
      }
    } catch (err) {
      setWaTestFeedback({
        ok: false,
        message: err instanceof Error ? err.message : 'WhatsApp Cloud API connection test failed.',
      });
    } finally {
      setWaTesting(false);
    }
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

  const handleCopyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(fullPublicUrl);
      setCopiedPublicUrl(true);
      setTimeout(() => setCopiedPublicUrl(false), 2000);
    } catch {
      // clipboard blocked in headless mode
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
            update garage settings, public links, or staff accounts.
          </p>
        </div>
      )}

      {/* Public Customer Connection Page Banner & Preview Controls */}
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Customer Connection Page URL
          </h2>
          <p className="text-sm text-slate-600">
            Mobile-friendly public page displaying strictly{' '}
            <span className="font-medium text-slate-900">{previewProfile.displayName}</span>{' '}
            details and links.
          </p>
          <p className="font-mono text-xs text-navy-900 break-all">{fullPublicUrl}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleCopyPublicUrl()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            <span>{copiedPublicUrl ? 'Copied Link' : 'Copy Link'}</span>
          </button>

          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            <span>Preview Connection Page</span>
          </button>

          <a
            href={publicPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 whitespace-nowrap"
          >
            <span>Open Public Page</span>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* Section 1: Garage Profile, Logo, Address & Customer Welcome Text */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Garage Identity, Logo &amp; Welcome Message
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Configure how your workshop appears on your public Customer Connection Page and WhatsApp messages.
        </p>

        <form onSubmit={(e) => void handleSaveProfile(e)} noValidate className="mt-5 space-y-5">
          {/* Logo Upload + URL Preview Row */}
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-navy-900 text-white">
              {logoUrl.trim() ? (
                <img
                  src={logoUrl.trim()}
                  alt={`${displayName || activeTenant.branding.displayName} logo preview`}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-display text-xl font-bold">
                  {getInitials(displayName || activeTenant.branding.displayName)}
                </span>
              )}
            </div>

            <div className="flex-1 space-y-2">
              <label htmlFor="gs-logo-url" className="block text-sm font-medium text-slate-700">
                Garage Logo URL or Upload Image
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="gs-logo-url"
                  type="url"
                  disabled={!canManage}
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://your-cdn.com/garage-logo.png"
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
                />
                {canManage && (
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap">
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      <span>Upload Logo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleLogoFileUpload(e)}
                        className="sr-only"
                      />
                    </label>
                    {logoUrl.trim() && (
                      <button
                        type="button"
                        aria-label="Remove garage logo"
                        onClick={() => setLogoUrl('')}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {profileErrors.logoUrl && (
                <p className="text-xs font-medium text-red-600">{profileErrors.logoUrl}</p>
              )}
              {logoUploadError && (
                <p className="text-xs font-medium text-red-600">{logoUploadError}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="gs-name" className="block text-sm font-medium text-slate-700">
                Garage Name
              </label>
              <input
                id="gs-name"
                type="text"
                disabled={!canManage}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
              />
              {profileErrors.displayName && (
                <p className="mt-1 text-xs text-red-600">{profileErrors.displayName}</p>
              )}
            </div>

            <div>
              <label htmlFor="gs-slug" className="block text-sm font-medium text-slate-700">
                Public Connection Slug
              </label>
              <div className="mt-1 flex items-center overflow-hidden rounded-xl border border-slate-300 focus-within:border-navy-900">
                <span className="border-r border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap">
                  /g/
                </span>
                <input
                  id="gs-slug"
                  type="text"
                  disabled={!canManage}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  onBlur={() => setSlug((prev) => normalizeGarageSlug(prev || displayName))}
                  placeholder="apex-auto-care"
                  className="min-h-[44px] w-full px-3 font-mono text-sm text-slate-900 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              {profileErrors.slug && (
                <p className="mt-1 text-xs text-red-600">{profileErrors.slug}</p>
              )}
            </div>

            <div>
              <label htmlFor="gs-phone" className="block text-sm font-medium text-slate-700">
                Contact Phone Number
              </label>
              <input
                id="gs-phone"
                type="tel"
                disabled={!canManage}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 98200 11223"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
              />
              {profileErrors.contactPhone && (
                <p className="mt-1 text-xs text-red-600">{profileErrors.contactPhone}</p>
              )}
            </div>

            <div>
              <label htmlFor="gs-city" className="block text-sm font-medium text-slate-700">
                Workshop Address
              </label>
              <input
                id="gs-city"
                type="text"
                disabled={!canManage}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Plot 12, Baner Road, Pune 411045"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="gs-welcome" className="block text-sm font-medium text-slate-700">
                  Customer Welcome Text
                </label>
                <span className="text-xs text-slate-500 tabular-nums">
                  {customerWelcomeText.length}/500
                </span>
              </div>
              <textarea
                id="gs-welcome"
                rows={3}
                disabled={!canManage}
                value={customerWelcomeText}
                onChange={(e) => setCustomerWelcomeText(e.target.value)}
                placeholder={DEFAULT_CUSTOMER_WELCOME_TEXT}
                className="mt-1 w-full rounded-xl border border-slate-300 p-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
              />
              {profileErrors.customerWelcomeText && (
                <p className="mt-1 text-xs text-red-600">{profileErrors.customerWelcomeText}</p>
              )}
            </div>
          </div>

          {profileSaveError && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {profileSaveError}
            </p>
          )}

          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div>
                {brandingSaved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Garage profile &amp; welcome message saved
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={profileSaving}
                className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60 whitespace-nowrap"
              >
                {profileSaving ? 'Saving...' : 'Save Garage Profile'}
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Section 2: Google Review & Social Links */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Google Review &amp; Social Media Links
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          All links are optional and appear only on {previewProfile.displayName}&apos;s Customer Connection Page. Google Reviews remain open equally to all customers with no incentives or feedback filtering.
        </p>

        <form onSubmit={(e) => void handleSaveSocialLinks(e)} noValidate className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="gs-google-review"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-700"
            >
              <Star className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span>Google Review URL</span>
            </label>
            <input
              id="gs-google-review"
              type="url"
              disabled={!canManage}
              value={googleReviewUrl}
              onChange={(e) => setGoogleReviewUrl(e.target.value)}
              placeholder="https://g.page/r/your-garage/review"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
            {socialErrors.googleReviewUrl && (
              <p className="mt-1 text-xs text-red-600">{socialErrors.googleReviewUrl}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="gs-instagram"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-700"
            >
              <Instagram className="h-4 w-4 text-pink-600" aria-hidden="true" />
              <span>Instagram Profile URL</span>
            </label>
            <input
              id="gs-instagram"
              type="url"
              disabled={!canManage}
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              placeholder="https://instagram.com/yourgarage"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
            {socialErrors.instagramUrl && (
              <p className="mt-1 text-xs text-red-600">{socialErrors.instagramUrl}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="gs-youtube"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-700"
            >
              <Youtube className="h-4 w-4 text-red-600" aria-hidden="true" />
              <span>YouTube Channel URL</span>
            </label>
            <input
              id="gs-youtube"
              type="url"
              disabled={!canManage}
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/@yourgarage"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
            {socialErrors.youtubeUrl && (
              <p className="mt-1 text-xs text-red-600">{socialErrors.youtubeUrl}</p>
            )}
          </div>

          {socialSaveError && (
            <p role="alert" className="text-xs font-medium text-red-600 sm:col-span-3">
              {socialSaveError}
            </p>
          )}

          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:col-span-3">
              <div>
                {socialSaved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Review &amp; social links saved
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={socialSaving}
                className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60 whitespace-nowrap"
              >
                {socialSaving ? 'Saving...' : 'Save Review & Social Links'}
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Section 3: WhatsApp Message Settings */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              WhatsApp Message Settings
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Configure this garage&apos;s Meta Phone Number ID and WABA ID. The permanent WhatsApp Access Token is stored strictly as a server-side Supabase Edge Function secret.
            </p>
          </div>
          {activeTenant.whatsappSettings.connectionStatus === 'connected' ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Connected
              {activeTenant.whatsappSettings.verifiedPhoneNumber
                ? ` · ${activeTenant.whatsappSettings.verifiedPhoneNumber}`
                : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              Not Connected
            </span>
          )}
        </div>

        <form onSubmit={(e) => void handleSaveWhatsApp(e)} noValidate className="mt-5 grid gap-4 sm:grid-cols-3">
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
            {waFieldErrors.phoneNumberId && (
              <p className="mt-1 text-xs text-red-600">{waFieldErrors.phoneNumberId}</p>
            )}
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
            {waFieldErrors.wabaId && (
              <p className="mt-1 text-xs text-red-600">{waFieldErrors.wabaId}</p>
            )}
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

          <div className="sm:col-span-3">
            <label htmlFor="wa-default-msg" className="block text-sm font-medium text-slate-700">
              Default WhatsApp Delivery Note
            </label>
            <textarea
              id="wa-default-msg"
              rows={2}
              disabled={!canManage}
              value={defaultMessage}
              onChange={(e) => setDefaultMessage(e.target.value)}
              placeholder="Hi {{customer_name}}, your {{vehicle_model}} ({{vehicle_reg}}) from {{garage_name}} is delivered! Connect with us: {{google_review_url}}"
              className="mt-1 w-full rounded-xl border border-slate-300 p-3.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          {waSaveError && (
            <p role="alert" className="text-xs font-medium text-red-600 sm:col-span-3">
              {waSaveError}
            </p>
          )}

          {waTestFeedback && (
            <div
              role="status"
              className={`rounded-xl border p-3 text-xs font-medium sm:col-span-3 ${
                waTestFeedback.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {waTestFeedback.message}
            </div>
          )}

          {!waTestFeedback &&
            activeTenant.whatsappSettings.connectionStatus !== 'connected' &&
            activeTenant.whatsappSettings.lastTestError && (
              <p className="text-xs text-red-600 sm:col-span-3">
                Last API test error: {activeTenant.whatsappSettings.lastTestError}
              </p>
            )}

          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 sm:col-span-3">
              <div>
                {waSaved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    WhatsApp settings saved. Run Test Connection to verify live API access.
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={waTesting || waSaving}
                  onClick={() => void handleTestWhatsAppConnection()}
                  className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
                >
                  {waTesting ? 'Testing Connection...' : 'Test WhatsApp Connection'}
                </button>
                <button
                  type="submit"
                  disabled={waSaving || waTesting}
                  className="min-h-[44px] rounded-xl bg-navy-900 px-5 py-2 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60 whitespace-nowrap"
                >
                  {waSaving ? 'Saving...' : 'Save WhatsApp Settings'}
                </button>
              </div>
            </div>
          )}
        </form>
      </section>

      {/* Section 4: Tenant-Scoped Staff Account Creation */}
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

      {/* Admin Live Preview Modal for Customer Connection Page */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="connection-preview-title"
        >
          <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-slate-50 shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5">
              <div>
                <h3
                  id="connection-preview-title"
                  className="font-display text-sm font-semibold text-slate-900"
                >
                  Live Customer Connection Preview
                </h3>
                <p className="font-mono text-xs text-slate-500">{publicPath}</p>
              </div>
              <button
                type="button"
                aria-label="Close connection page preview"
                onClick={() => setPreviewOpen(false)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              <CustomerConnectionCard profile={previewProfile} isPreview />
              {(!previewProfile.googleReviewUrl ||
                !previewProfile.instagramUrl ||
                !previewProfile.youtubeUrl) && (
                <p className="text-center text-xs text-slate-500">
                  Optional links left blank remain hidden on the live customer page.
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-slate-200 bg-white px-5 py-3.5">
              <a
                href={publicPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                <ExternalLink className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <span>Open /g/{effectiveSlug}</span>
              </a>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="min-h-[44px] rounded-xl bg-navy-900 px-5 text-sm font-medium text-white hover:bg-navy-800 whitespace-nowrap"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
