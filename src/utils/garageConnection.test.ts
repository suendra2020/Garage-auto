import test from 'node:test';
import assert from 'node:assert/strict';
import type { GarageTenant } from '../types/garage';
import {
  DEFAULT_CUSTOMER_WELCOME_TEXT,
  buildPublicGaragePath,
  buildPublicGarageProfile,
  buildTelHref,
  ensureUniqueGarageSlug,
  findPublicGarageBySlug,
  getInitials,
  isValidGarageSlug,
  isValidLogoUrlOrDataUri,
  normalizeGarageSlug,
  parsePublicGarageSlugFromPath,
  validateGarageProfileSettingsInput,
  validateGarageSocialLinksInput,
} from './garageConnection';

function makeTenant(overrides: Partial<GarageTenant> = {}): GarageTenant {
  return {
    id: 'gar_1',
    name: 'Apex Auto Care Pune',
    slug: 'apex-auto-care-pune',
    planId: 'plan_growth',
    status: 'active',
    createdAt: '2026-11-16T08:00:00.000Z',
    branding: {
      displayName: 'Apex Auto Care Pune',
      tagline: 'Authorized Service Center',
      city: 'Baner Road, Pune',
      contactPhone: '+91 98200 11223',
      contactEmail: 'care@apexauto.in',
      logoUrl: 'https://cdn.example.com/apex-logo.png',
      accentColor: '#0B192C',
      customerWelcomeText: 'Thanks for visiting Apex Auto Care! Connect with us below.',
    },
    whatsappSettings: {
      phoneNumberId: '109482716354',
      wabaId: '204958172635',
      businessDisplayName: 'Apex Auto Care',
      defaultMessage: 'Hi {{customer_name}}, your vehicle is ready.',
      connectionStatus: 'not_connected',
    },
    reviewSocialLinks: {
      googleReviewUrl: 'https://g.page/r/apex-auto/review',
      instagramUrl: 'https://instagram.com/apexauto',
      facebookUrl: '',
      youtubeUrl: 'https://youtube.com/@apexauto',
      websiteUrl: '',
    },
    ...overrides,
  };
}

test('slug normalization, uniqueness, and /g/garage-slug route parsing work reliably', () => {
  assert.equal(normalizeGarageSlug('  Apex Auto Care — Pune! '), 'apex-auto-care-pune');
  assert.equal(isValidGarageSlug('apex-auto-care-pune'), true);
  assert.equal(isValidGarageSlug('a'), false);
  assert.equal(isValidGarageSlug('Apex_Auto'), false);

  assert.equal(buildPublicGaragePath('Apex Auto Pune'), '/g/apex-auto-pune');
  assert.equal(parsePublicGarageSlugFromPath('/g/apex-auto-pune'), 'apex-auto-pune');
  assert.equal(parsePublicGarageSlugFromPath('/g/Apex-Auto-Pune/'), 'apex-auto-pune');
  assert.equal(parsePublicGarageSlugFromPath('/dashboard'), null);
  assert.equal(parsePublicGarageSlugFromPath('/g/'), null);

  const uniqueCheck = ensureUniqueGarageSlug('metro-motors', 'gar_1', [
    makeTenant({ id: 'gar_1', slug: 'apex-auto-care-pune' }),
    makeTenant({ id: 'gar_2', slug: 'metro-motors' }),
  ]);
  assert.equal(uniqueCheck.valid, false);
  assert.ok(uniqueCheck.error);
});

test('validateGarageProfileSettingsInput and validateGarageSocialLinksInput reject invalid URLs, phones, and slugs', () => {
  const invalidProfile = validateGarageProfileSettingsInput(
    {
      displayName: 'A',
      slug: 'x',
      logoUrl: 'ftp://bad-logo.example.com/logo.png',
      contactPhone: '123',
      address: 'Pune',
      customerWelcomeText: 'Hello!',
    },
    'gar_1',
    [],
  );
  assert.equal(invalidProfile.valid, false);
  assert.ok(invalidProfile.errors.displayName);
  assert.ok(invalidProfile.errors.slug);
  assert.ok(invalidProfile.errors.logoUrl);
  assert.ok(invalidProfile.errors.contactPhone);

  assert.equal(isValidLogoUrlOrDataUri('data:image/png;base64,AAAA'), true);
  assert.equal(isValidLogoUrlOrDataUri('javascript:alert(1)'), false);

  const validProfile = validateGarageProfileSettingsInput(
    {
      displayName: 'Apex Auto Care',
      slug: 'apex-auto-care',
      logoUrl: 'https://example.com/logo.png',
      contactPhone: '+91 98200 11223',
      address: 'Baner Road, Pune',
      customerWelcomeText: 'Welcome to Apex Auto Care!',
    },
    'gar_1',
    [],
  );
  assert.equal(validProfile.valid, true);
  assert.equal(validProfile.normalizedSlug, 'apex-auto-care');

  const invalidSocials = validateGarageSocialLinksInput({
    googleReviewUrl: 'not-a-url',
    instagramUrl: 'ftp://instagram.com/test',
    youtubeUrl: 'https://youtube.com/@apexauto',
  });
  assert.equal(invalidSocials.valid, false);
  assert.ok(invalidSocials.errors.googleReviewUrl);
  assert.ok(invalidSocials.errors.instagramUrl);
  assert.equal(invalidSocials.errors.youtubeUrl, undefined);

  // Google Review URL is optional (blank allowed)
  const optionalBlank = validateGarageSocialLinksInput({
    googleReviewUrl: '',
    instagramUrl: '',
    youtubeUrl: '',
  });
  assert.equal(optionalBlank.valid, true);
});

test('findPublicGarageBySlug strictly isolates each garage and never exposes another garage data or suspended accounts', () => {
  const garageA = makeTenant({
    id: 'gar_a',
    slug: 'apex-auto',
    branding: {
      displayName: 'Apex Auto',
      tagline: '',
      city: 'Pune',
      contactPhone: '+919800000001',
      contactEmail: 'a@apex.in',
      logoUrl: 'https://example.com/a.png',
      accentColor: '#0B192C',
      customerWelcomeText: 'Welcome from Garage A',
    },
    reviewSocialLinks: {
      googleReviewUrl: 'https://g.page/r/garage-a/review',
      instagramUrl: 'https://instagram.com/garagea',
      facebookUrl: '',
      youtubeUrl: '',
      websiteUrl: '',
    },
  });

  const garageB = makeTenant({
    id: 'gar_b',
    slug: 'metro-motors',
    branding: {
      displayName: 'Metro Motors',
      tagline: '',
      city: 'Mumbai',
      contactPhone: '+919800000002',
      contactEmail: 'b@metro.in',
      logoUrl: 'https://example.com/b.png',
      accentColor: '#0B192C',
      customerWelcomeText: 'Welcome from Garage B',
    },
    reviewSocialLinks: {
      googleReviewUrl: 'https://g.page/r/garage-b/review',
      instagramUrl: '',
      facebookUrl: '',
      youtubeUrl: 'https://youtube.com/@metromotors',
      websiteUrl: '',
    },
  });

  const suspendedGarage = makeTenant({
    id: 'gar_c',
    slug: 'suspended-shop',
    status: 'suspended',
  });

  const garages = [garageA, garageB, suspendedGarage];

  const foundA = findPublicGarageBySlug(garages, 'apex-auto');
  assert.ok(foundA);
  assert.equal(foundA.displayName, 'Apex Auto');
  assert.equal(foundA.logoUrl, 'https://example.com/a.png');
  assert.equal(foundA.googleReviewUrl, 'https://g.page/r/garage-a/review');
  assert.equal(foundA.instagramUrl, 'https://instagram.com/garagea');
  assert.equal(foundA.youtubeUrl, '');

  const foundB = findPublicGarageBySlug(garages, 'metro-motors');
  assert.ok(foundB);
  assert.equal(foundB.displayName, 'Metro Motors');
  assert.equal(foundB.logoUrl, 'https://example.com/b.png');
  assert.equal(foundB.youtubeUrl, 'https://youtube.com/@metromotors');
  assert.equal(foundB.instagramUrl, '');

  assert.equal(findPublicGarageBySlug(garages, 'suspended-shop'), null);
  assert.equal(findPublicGarageBySlug(garages, 'unknown-garage'), null);

  // Neutral default welcome text contains no review-gating or incentive promises
  assert.equal(/discount|reward|coupon|free|5 star|five star/i.test(DEFAULT_CUSTOMER_WELCOME_TEXT), false);
  assert.equal(buildTelHref('+91 98200 11223'), 'tel:+919820011223');
  assert.equal(buildTelHref('123'), null);
  assert.equal(getInitials('Apex Auto Care'), 'AA');
  assert.equal(buildPublicGarageProfile(garageA).id, 'gar_a');
});
