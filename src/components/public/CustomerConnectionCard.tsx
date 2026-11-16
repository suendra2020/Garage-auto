import React, { useEffect, useState } from 'react';
import {
  ExternalLink,
  Instagram,
  MapPin,
  Phone,
  Star,
  Youtube,
} from 'lucide-react';
import type { PublicGarageConnectionProfile } from '../../types/garage';
import { buildTelHref, getInitials } from '../../utils/garageConnection';

interface CustomerConnectionCardProps {
  profile: PublicGarageConnectionProfile;
  isPreview?: boolean;
}

export function CustomerConnectionCard({
  profile,
  isPreview = false,
}: CustomerConnectionCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [profile.logoUrl]);

  const telHref = buildTelHref(profile.contactPhone);
  const showLogoImage = Boolean(profile.logoUrl.trim()) && !logoFailed;
  const HeadingTag = isPreview ? 'h2' : 'h1';

  return (
    <article className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white">
      {/* Garage Identity Header */}
      <div className="border-b border-slate-100 px-6 py-7 text-center sm:px-8">
        <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-navy-900 text-white">
          {showLogoImage ? (
            <img
              src={profile.logoUrl}
              alt={`${profile.displayName} logo`}
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-display text-2xl font-bold tracking-tight">
              {getInitials(profile.displayName)}
            </span>
          )}
        </div>

        <HeadingTag className="font-display mt-4 text-balance text-2xl font-bold tracking-tight text-slate-900">
          {profile.displayName}
        </HeadingTag>

        {(profile.address || profile.contactPhone) && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-slate-600">
            {profile.address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{profile.address}</span>
              </span>
            )}
            {profile.address && profile.contactPhone && (
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
            )}
            {profile.contactPhone && (
              <span className="font-mono text-xs text-slate-700 tabular-nums">
                {profile.contactPhone}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Customer Welcome Message & Action Links */}
      <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-7">
        <p className="text-center text-sm leading-relaxed text-slate-700 whitespace-pre-line">
          {profile.customerWelcomeText}
        </p>

        <div className="space-y-3">
          {profile.googleReviewUrl && (
            <div className="space-y-1.5">
              <a
                href={profile.googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
              >
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Star className="h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
                  <span>Review Us on Google</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
              </a>
              <p className="text-center text-xs text-slate-500">
                Optional — open to all customers to share honest feedback.
              </p>
            </div>
          )}

          {profile.instagramUrl && (
            <a
              href={profile.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <Instagram className="h-5 w-5 shrink-0 text-pink-600" aria-hidden="true" />
                <span>Follow on Instagram</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </a>
          )}

          {profile.youtubeUrl && (
            <a
              href={profile.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <Youtube className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
                <span>Watch on YouTube</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </a>
          )}

          {telHref ? (
            <a
              href={telHref}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
            >
              <span className="flex items-center gap-3 whitespace-nowrap">
                <Phone className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                <span>Contact Garage</span>
              </span>
              <span className="font-mono text-xs font-medium text-slate-600 tabular-nums">
                {profile.contactPhone}
              </span>
            </a>
          ) : (
            <div className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600">
              <span className="flex items-center gap-3 whitespace-nowrap">
                <Phone className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>Contact Garage</span>
              </span>
              <span className="text-xs text-slate-500">
                {profile.address || 'Phone number not set'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-3.5 text-center text-xs text-slate-500">
        {profile.displayName} · Direct Customer Connection
      </div>
    </article>
  );
}
