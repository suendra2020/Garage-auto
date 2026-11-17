import test from 'node:test';
import assert from 'node:assert/strict';
import type { GarageTenant, JobCard, MessageTemplate, WhatsAppMessageLog } from '../types/garage';
import {
  buildMetaTemplateBodyParameters,
  canTransitionWhatsAppLogStatus,
  formatWhatsAppLogStatusMeta,
  normalizeWhatsAppRecipientPhone,
  validateLiveDispatchPreconditions,
  validateWhatsAppCredentialsInput,
} from './whatsappCloud';

function makeTenant(overrides?: Partial<GarageTenant>): GarageTenant {
  return {
    id: 'gar_1',
    name: 'Hariautomobiles Smart Garage',
    slug: 'hariautomobiles',
    planId: 'plan_growth',
    status: 'active',
    createdAt: '2026-11-01T00:00:00.000Z',
    branding: {
      displayName: 'Hariautomobiles Smart Garage',
      tagline: 'Smart Service',
      city: 'Hyderabad',
      contactPhone: '+91 98765 43210',
      contactEmail: 'service@hariauto.in',
      logoUrl: '',
      accentColor: '#0B192C',
    },
    whatsappSettings: {
      phoneNumberId: '109482716354',
      wabaId: '204958172635',
      businessDisplayName: 'Hariautomobiles',
      connectionStatus: 'connected',
    },
    reviewSocialLinks: {
      googleReviewUrl: 'https://g.page/r/hari/review',
      instagramUrl: 'https://instagram.com/hariauto',
      facebookUrl: '',
      youtubeUrl: '',
      websiteUrl: '',
    },
    ...overrides,
  };
}

function makeTemplate(overrides?: Partial<MessageTemplate>): MessageTemplate {
  return {
    id: 'tpl_1',
    tenantId: 'gar_1',
    name: 'Delivery Confirmation',
    category: 'delivery_notification',
    body: 'Hi {{customer_name}}, your {{vehicle_model}} ({{vehicle_reg}}) [{{job_card_no}}] is delivered by {{garage_name}}.',
    metaTemplateName: 'vehicle_delivery_update',
    metaLanguageCode: 'en',
    approvalStatus: 'approved',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCard(overrides?: Partial<JobCard>): JobCard {
  return {
    id: 'jc_1',
    tenantId: 'gar_1',
    importBatchId: 'imp_1',
    jobCardNumber: 'JC-1001',
    customerName: 'Ramesh Verma',
    phoneNumber: '9876543210',
    vehicleRegistration: 'TS09AB1234',
    vehicleBrand: 'Hyundai',
    vehicleModel: 'Creta',
    serviceType: 'Periodic Service',
    rawStatus: 'Delivered',
    isDelivered: true,
    deliveredAt: '2026-11-15T10:00:00.000Z',
    deliveryConfirmedAt: '2026-11-15T10:05:00.000Z',
    whatsappDispatchStatus: 'not_sent',
    ...overrides,
  };
}

test('validateWhatsAppCredentialsInput enforces numeric Phone Number ID and WABA ID', () => {
  assert.equal(
    validateWhatsAppCredentialsInput({ phoneNumberId: '109482716354', wabaId: '204958172635' }).valid,
    true,
  );
  const bad = validateWhatsAppCredentialsInput({ phoneNumberId: 'abc', wabaId: '123' });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.phoneNumberId);
  assert.ok(bad.errors.wabaId);
});

test('normalizeWhatsAppRecipientPhone formats 10-digit mobile numbers to E.164 digits and rejects invalid lengths', () => {
  assert.equal(normalizeWhatsAppRecipientPhone('98765 43210'), '919876543210');
  assert.equal(normalizeWhatsAppRecipientPhone('+91 98765-43210'), '919876543210');
  assert.equal(normalizeWhatsAppRecipientPhone('+1 415 555 2671'), '14155552671');
  assert.equal(normalizeWhatsAppRecipientPhone('12345'), null);
});

test('buildMetaTemplateBodyParameters extracts ordered body params for Meta Graph API', () => {
  const res = buildMetaTemplateBodyParameters(
    'Hello {{customer_name}}, {{vehicle_model}} ({{vehicle_reg}}) from {{garage_name}} is ready. Review: {{google_review_url}}',
    {
      customerName: 'Ramesh',
      garageName: 'Hariautomobiles',
      vehicleReg: 'TS09AB1234',
      vehicleModel: 'Creta',
      jobCardNumber: 'JC-1001',
      googleReviewUrl: 'https://g.page/r/hari/review',
      instagramUrl: '',
    },
  );
  assert.deepEqual(res.parameters, [
    'Ramesh',
    'Creta',
    'TS09AB1234',
    'Hariautomobiles',
    'https://g.page/r/hari/review',
  ]);
  assert.match(res.renderedMessage, /Ramesh/);
  assert.match(res.renderedMessage, /TS09AB1234/);
});

test('validateLiveDispatchPreconditions blocks disconnected API, unapproved templates, and cross-tenant data', () => {
  const disconnectedTenant = makeTenant({
    whatsappSettings: {
      phoneNumberId: '109482716354',
      wabaId: '204958172635',
      businessDisplayName: 'Hariautomobiles',
      connectionStatus: 'not_connected',
    },
  });
  const resDisconnected = validateLiveDispatchPreconditions({
    tenant: disconnectedTenant,
    template: makeTemplate(),
    selectedCards: [makeCard()],
    existingLogs: [],
  });
  assert.equal(resDisconnected.valid, false);

  const resDraftTpl = validateLiveDispatchPreconditions({
    tenant: makeTenant(),
    template: makeTemplate({ approvalStatus: 'draft' }),
    selectedCards: [makeCard()],
    existingLogs: [],
  });
  assert.equal(resDraftTpl.valid, false);

  const resCrossTenantTpl = validateLiveDispatchPreconditions({
    tenant: makeTenant(),
    template: makeTemplate({ tenantId: 'gar_other' }),
    selectedCards: [makeCard()],
    existingLogs: [],
  });
  assert.equal(resCrossTenantTpl.valid, false);

  const resCrossTenantCard = validateLiveDispatchPreconditions({
    tenant: makeTenant(),
    template: makeTemplate(),
    selectedCards: [makeCard({ tenantId: 'gar_other' })],
    existingLogs: [],
  });
  assert.equal(resCrossTenantCard.valid, false);

  const resValid = validateLiveDispatchPreconditions({
    tenant: makeTenant(),
    template: makeTemplate(),
    selectedCards: [makeCard()],
    existingLogs: [],
  });
  assert.equal(resValid.valid, true);
});

test('canTransitionWhatsAppLogStatus prevents out-of-order downgrades and keeps sent separate from delivered', () => {
  assert.equal(canTransitionWhatsAppLogStatus('queued', 'sent'), true);
  assert.equal(canTransitionWhatsAppLogStatus('sent', 'delivered'), true);
  assert.equal(canTransitionWhatsAppLogStatus('delivered', 'read'), true);
  assert.equal(canTransitionWhatsAppLogStatus('delivered', 'sent'), false);
  assert.equal(canTransitionWhatsAppLogStatus('read', 'delivered'), false);
  assert.equal(canTransitionWhatsAppLogStatus('read', 'failed'), false);
  assert.equal(canTransitionWhatsAppLogStatus('sent', 'failed'), true);

  assert.equal(formatWhatsAppLogStatusMeta('sent').label, 'Sent (Awaiting Delivery)');
  assert.equal(formatWhatsAppLogStatusMeta('delivered').label, 'Delivered');
  assert.equal(formatWhatsAppLogStatusMeta('read').label, 'Read');
  assert.equal(formatWhatsAppLogStatusMeta('failed').label, 'Failed');

  const sampleLog: WhatsAppMessageLog = {
    id: 'l1',
    tenantId: 'gar_1',
    jobCardId: 'jc_1',
    customerName: 'Ramesh',
    phoneNumber: '9876543210',
    vehicleRegistration: 'TS09AB1234',
    templateName: 'Delivery Confirmation',
    renderedMessage: 'Hello',
    status: 'sent',
    createdAt: '2026-11-16T00:00:00.000Z',
  };
  assert.notEqual(formatWhatsAppLogStatusMeta(sampleLog.status).label, 'Delivered');
});
