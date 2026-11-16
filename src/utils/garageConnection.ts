import type {
  GarageTenant,
  PublicGarageConnectionProfile,
} from '../types/garage';
import {
  generateSlug,
  isValidHttpUrl,
  normalizePhoneNumber,
} from './tenantLogic';

export const DEFAULT_CUSTOMER_WELCOME_TEXT =
  'Thank you for choosing us to service your vehicle. Stay connected with our workshop, reach our team anytime, or share your feedback.';

export function normalizeGarageSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function isValidGarageSlug(slug: string): boolean {
  const trimmed = slug.trim();
  if (trimmed.length < 2 || trimmed.length > 64) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed);
}

export function buildPublicGaragePath(slug: string): string {
  const clean = normalizeGarageSlug(slug);
  return clean ? `/g/${clean}` : '/g/garage';
}

export function parsePublicGarageSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/g\/([^/?#]+)\/?$/i);
  if (!match || !match[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    const normalized = normalizeGarageSlug(decoded);
    return normalized || null;
  } catch {
    return null;
  }
}

export function isValidLogoUrlOrDataUri(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('data:image/')) {
    return /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(
      trimmed,
    );
  }
  return isValidHttpUrl(trimmed);
}

export function buildTelHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = normalizePhoneNumber(phone);
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return `tel:${normalized}`;
}

export function ensureUniqueGarageSlug(
  desiredSlug: string,
  currentGarageId: string,
  existingGarages: readonly Pick<GarageTenant, 'id' | 'slug'>[],
): { valid: boolean; slug: string; error?: string } {
  const normalized = normalizeGarageSlug(desiredSlug);
  if (!isValidGarageSlug(normalized)) {
    return {
      valid: false,
      slug: normalized,
      error:
        'Public URL slug must be 2–64 lowercase letters, numbers, or hyphens (e.g. apex-auto-pune).',
    };
  }
  const conflict = existingGarages.some(
    (g) => g.id !== currentGarageId && normalizeGarageSlug(g.slug) === normalized,
  );
  if (conflict) {
    return {
      valid: false,
      slug: normalized,
      error: 'This URL slug is already used by another garage. Choose a unique slug.',
    };
  }
  return { valid: true, slug: normalized };
}

export interface GarageProfileSettingsInput {
  displayName: string;
  slug: string;
  logoUrl: string;
  contactPhone: string;
  address: string;
  customerWelcomeText: string;
}

export function validateGarageProfileSettingsInput(
  input: GarageProfileSettingsInput,
  currentGarageId: string,
  existingGarages: readonly Pick<GarageTenant, 'id' | 'slug'>[] = [],
): { valid: boolean; errors: Record<string, string>; normalizedSlug: string } {
  const errors: Record<string, string> = {};

  if (input.displayName.trim().length < 2) {
    errors.displayName = 'Garage name must be at least 2 characters.';
  }

  const slugCheck = ensureUniqueGarageSlug(
    input.slug || generateSlug(input.displayName),
    currentGarageId,
    existingGarages,
  );
  if (!slugCheck.valid && slugCheck.error) {
    errors.slug = slugCheck.error;
  }

  if (!isValidLogoUrlOrDataUri(input.logoUrl)) {
    errors.logoUrl =
      'Logo must be a valid https:// or http:// image URL or uploaded image file.';
  }

  const phoneDigits = normalizePhoneNumber(input.contactPhone).replace(/\D/g, '');
  if (input.contactPhone.trim() && phoneDigits.length < 7) {
    errors.contactPhone = 'Enter a valid contact phone number (at least 7 digits).';
  }

  if (input.customerWelcomeText.trim().length > 500) {
    errors.customerWelcomeText = 'Welcome text must be 500 characters or fewer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalizedSlug: slugCheck.slug,
  };
}

export interface GarageSocialLinksInput {
  googleReviewUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
}

export function validateGarageSocialLinksInput(
  input: GarageSocialLinksInput,
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!isValidHttpUrl(input.googleReviewUrl)) {
    errors.googleReviewUrl = 'Google Review URL must start with https:// or http://.';
  }
  if (!isValidHttpUrl(input.instagramUrl)) {
    errors.instagramUrl = 'Instagram URL must start with https:// or http://.';
  }
  if (!isValidHttpUrl(input.youtubeUrl)) {
    errors.youtubeUrl = 'YouTube URL must start with https:// or http://.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Projects ONLY non-sensitive public customer connection fields for a single active garage.
 * Guarantees zero cross-tenant leaks and hides internal API IDs or private operational data.
 */
export function buildPublicGarageProfile(
  tenant: GarageTenant,
): PublicGarageConnectionProfile {
  return {
    id: tenant.id,
    slug: normalizeGarageSlug(tenant.slug || tenant.name),
    displayName: tenant.branding.displayName || tenant.name,
    logoUrl: isValidLogoUrlOrDataUri(tenant.branding.logoUrl)
      ? tenant.branding.logoUrl.trim()
      : '',
    contactPhone: tenant.branding.contactPhone.trim(),
    address: tenant.branding.city.trim(),
    customerWelcomeText:
      tenant.branding.customerWelcomeText?.trim() || DEFAULT_CUSTOMER_WELCOME_TEXT,
    googleReviewUrl: isValidHttpUrl(tenant.reviewSocialLinks.googleReviewUrl)
      ? tenant.reviewSocialLinks.googleReviewUrl.trim()
      : '',
    instagramUrl: isValidHttpUrl(tenant.reviewSocialLinks.instagramUrl)
      ? tenant.reviewSocialLinks.instagramUrl.trim()
      : '',
    youtubeUrl: isValidHttpUrl(tenant.reviewSocialLinks.youtubeUrl)
      ? tenant.reviewSocialLinks.youtubeUrl.trim()
      : '',
  };
}

/**
 * Strictly selects ONLY the single active garage matching the requested slug.
 * Never returns another garage's profile or suspended garages.
 */
export function findPublicGarageBySlug(
  garages: readonly GarageTenant[],
  requestedSlug: string | null | undefined,
): PublicGarageConnectionProfile | null {
  if (!requestedSlug) return null;
  const targetSlug = normalizeGarageSlug(requestedSlug);
  if (!targetSlug) return null;

  const matched = garages.find(
    (g) =>
      g.status === 'active' &&
      normalizeGarageSlug(g.slug || g.name) === targetSlug,
  );
  return matched ? buildPublicGarageProfile(matched) : null;
}

export function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'GC';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
