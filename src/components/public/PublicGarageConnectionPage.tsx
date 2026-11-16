import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Car } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { fetchPublicGarageConnectionBySlug } from '../../services/supabaseGarageService';
import type { PublicGarageConnectionProfile } from '../../types/garage';
import {
  buildPublicGarageProfile,
  findPublicGarageBySlug,
  normalizeGarageSlug,
} from '../../utils/garageConnection';
import { CustomerConnectionCard } from './CustomerConnectionCard';

interface PublicGarageConnectionPageProps {
  slug: string;
}

export function PublicGarageConnectionPage({ slug }: PublicGarageConnectionPageProps) {
  const { tenants, activeTenant, session } = useAppState();
  const normalizedSlug = normalizeGarageSlug(slug);

  const [profile, setProfile] = useState<PublicGarageConnectionProfile | null>(() => {
    if (
      activeTenant &&
      activeTenant.status === 'active' &&
      normalizeGarageSlug(activeTenant.slug) === normalizedSlug
    ) {
      return buildPublicGarageProfile(activeTenant);
    }
    return findPublicGarageBySlug(tenants, normalizedSlug);
  });
  const [loading, setLoading] = useState<boolean>(!profile);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      // If active tenant already matches this exact slug, keep synced immediately
      if (
        activeTenant &&
        activeTenant.status === 'active' &&
        normalizeGarageSlug(activeTenant.slug) === normalizedSlug
      ) {
        if (!cancelled) {
          setProfile(buildPublicGarageProfile(activeTenant));
          setLoading(false);
        }
        return;
      }

      const tenantMatch = findPublicGarageBySlug(tenants, normalizedSlug);
      if (tenantMatch) {
        if (!cancelled) {
          setProfile(tenantMatch);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const fetched = await fetchPublicGarageConnectionBySlug(normalizedSlug);
      if (!cancelled) {
        setProfile(fetched);
        setLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [normalizedSlug, activeTenant, tenants]);

  const handleReturnToPortal = () => {
    if (typeof window !== 'undefined') {
      window.location.assign('/');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center space-y-5">
        {session && (
          <div className="flex w-full items-center justify-between">
            <button
              type="button"
              onClick={handleReturnToPortal}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Back to Garage Portal</span>
            </button>
            <span className="font-mono text-xs text-slate-500">
              /g/{normalizedSlug}
            </span>
          </div>
        )}

        {loading ? (
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 space-y-4">
            <div className="mx-auto h-20 w-20 animate-pulse rounded-2xl bg-slate-200" />
            <div className="mx-auto h-6 w-48 animate-pulse rounded bg-slate-200" />
            <div className="mx-auto h-4 w-64 animate-pulse rounded bg-slate-100" />
            <div className="space-y-3 pt-4">
              <div className="h-12 w-full animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-12 w-full animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-12 w-full animate-pulse rounded-2xl bg-slate-100" />
            </div>
          </div>
        ) : profile ? (
          <CustomerConnectionCard profile={profile} />
        ) : (
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <AlertCircle className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="font-display mt-4 text-xl font-bold text-slate-900">
              Garage connection page not found
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              No active workshop is published at{' '}
              <span className="font-mono text-slate-800">/g/{normalizedSlug}</span>.
            </p>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleReturnToPortal}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-navy-900 px-5 text-sm font-medium text-white hover:bg-navy-800 whitespace-nowrap"
              >
                <Car className="h-4 w-4" aria-hidden="true" />
                <span>Go to GARAGE-CONNECT-APP</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
