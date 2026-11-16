import test from 'node:test';
import assert from 'node:assert/strict';
import type { JobCard, UserSession, WhatsAppMessageLog } from '../types/garage';
import {
  buildConfirmedDeliveryUpdate,
  classifyJobCardFilterStage,
  evaluateCustomerOutreachEligibility,
  filterConfirmedDeliveredVehicles,
  filterJobCardsList,
  hasValidMobileNumber,
  isAuthorizedDeliveryConfirmer,
  isCancelledStatus,
  isConfirmedDeliveredCard,
  toDateTimeLocalInputValue,
  validateDeliveryConfirmationInput,
} from './jobCardDelivery';

const GARAGE_ID = 'gar_alpha';

function makeCard(overrides: Partial<JobCard> = {}): JobCard {
  return {
    id: 'jc_1',
    tenantId: GARAGE_ID,
    importBatchId: 'batch_1',
    jobCardNumber: 'JC-1001',
    customerName: 'Aarav Sharma',
    phoneNumber: '+919876543210',
    vehicleRegistration: 'MH12AB1234',
    vehicleBrand: 'Hyundai',
    vehicleModel: 'Creta',
    serviceType: 'Periodic Service',
    rawStatus: 'In Progress',
    isDelivered: false,
    deliveredAt: null,
    deliveredBy: null,
    deliveryConfirmedAt: null,
    importedAt: '2026-11-16T08:00:00.000Z',
    createdAt: '2026-11-16T08:00:00.000Z',
    whatsappDispatchStatus: 'not_sent',
    ...overrides,
  };
}

test('isAuthorizedDeliveryConfirmer strictly allows only authorized garage staff/admin for active garage', () => {
  const staffSession: UserSession = {
    userId: 'usr_staff_1',
    email: 'staff@alpha.com',
    fullName: 'Staff One',
    role: 'garage_staff',
    tenantId: GARAGE_ID,
    authorizedTenantIds: [GARAGE_ID],
    emailVerified: true,
    authMode: 'supabase',
  };
  const adminSession: UserSession = {
    ...staffSession,
    userId: 'usr_admin_1',
    role: 'garage_admin',
  };
  const otherGarageSession: UserSession = {
    ...staffSession,
    tenantId: 'gar_beta',
    authorizedTenantIds: ['gar_beta'],
  };
  const superAdminSession: UserSession = {
    ...staffSession,
    role: 'super_admin',
    tenantId: null,
    authorizedTenantIds: [],
  };

  assert.equal(isAuthorizedDeliveryConfirmer(staffSession, GARAGE_ID), true);
  assert.equal(isAuthorizedDeliveryConfirmer(adminSession, GARAGE_ID), true);
  assert.equal(isAuthorizedDeliveryConfirmer(otherGarageSession, GARAGE_ID), false);
  assert.equal(isAuthorizedDeliveryConfirmer(superAdminSession, GARAGE_ID), false);
  assert.equal(isAuthorizedDeliveryConfirmer(null, GARAGE_ID), false);
});

test('validateDeliveryConfirmationInput enforces handover confirmation and valid date/time', () => {
  const unconfirmed = validateDeliveryConfirmationInput({
    handoverConfirmed: false,
    deliveryDateTimeLocal: '2026-11-16T14:30',
  });
  assert.equal(unconfirmed.valid, false);

  const missingDate = validateDeliveryConfirmationInput({
    handoverConfirmed: true,
    deliveryDateTimeLocal: '',
  });
  assert.equal(missingDate.valid, false);

  const valid = validateDeliveryConfirmationInput({
    handoverConfirmed: true,
    deliveryDateTimeLocal: '2026-11-16T14:30',
  });
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.ok(!Number.isNaN(new Date(valid.deliveredAtIso).getTime()));
  }

  const localFormatted = toDateTimeLocalInputValue('2026-11-16T14:30:00');
  assert.match(localFormatted, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('buildConfirmedDeliveryUpdate records delivered status, date/time, deliveredBy, and confirmation timestamp', () => {
  const base = makeCard({ id: 'jc_9', rawStatus: 'Ready for Delivery', isDelivered: false });
  const updated = buildConfirmedDeliveryUpdate({
    card: base,
    deliveryDateIso: '2026-11-16T10:15:00.000Z',
    confirmedByUserId: 'usr_staff_42',
    confirmationTimestampIso: '2026-11-16T10:16:05.000Z',
  });

  assert.equal(updated.isDelivered, true);
  assert.equal(updated.rawStatus, 'Delivered');
  assert.equal(updated.deliveredAt, '2026-11-16T10:15:00.000Z');
  assert.equal(updated.deliveredBy, 'usr_staff_42');
  assert.equal(updated.deliveryConfirmedAt, '2026-11-16T10:16:05.000Z');
  assert.equal(isConfirmedDeliveredCard(updated), true);
});

test('filterJobCardsList supports customer/vehicle/job-card search, status filter, and date filter with tenant isolation', () => {
  const cards: JobCard[] = [
    makeCard({
      id: 'c1',
      jobCardNumber: 'JC-101',
      customerName: 'Rohan Mehta',
      vehicleRegistration: 'MH01AA1111',
      rawStatus: 'Pending',
      importedAt: '2026-11-15T09:00:00',
    }),
    makeCard({
      id: 'c2',
      jobCardNumber: 'JC-102',
      customerName: 'Priya Nair',
      vehicleRegistration: 'KA05BB2222',
      rawStatus: 'In Progress',
      importedAt: '2026-11-16T09:00:00',
    }),
    makeCard({
      id: 'c3',
      jobCardNumber: 'JC-103',
      customerName: 'Vikram Rao',
      vehicleRegistration: 'DL02CC3333',
      rawStatus: 'Delivered',
      isDelivered: true,
      deliveredAt: '2026-11-16T11:30:00',
    }),
    makeCard({
      id: 'c4',
      jobCardNumber: 'JC-104',
      customerName: 'Cancelled User',
      vehicleRegistration: 'TN09DD4444',
      rawStatus: 'Cancelled',
      importedAt: '2026-11-16T12:00:00',
    }),
    makeCard({
      id: 'c_other_tenant',
      tenantId: 'gar_other',
      jobCardNumber: 'JC-999',
      customerName: 'Priya Nair',
      vehicleRegistration: 'KA05BB2222',
      rawStatus: 'Delivered',
      isDelivered: true,
      deliveredAt: '2026-11-16T12:00:00',
    }),
  ];

  assert.equal(classifyJobCardFilterStage(cards[3]), 'cancelled');
  assert.equal(isCancelledStatus('Cancelled'), true);

  const byVehicle = filterJobCardsList(cards, GARAGE_ID, {
    search: 'ka05bb',
    statusFilter: 'all',
    dateFilter: { period: 'all', selectedDate: '2026-11-16', selectedMonth: '2026-11' },
  });
  assert.deepEqual(
    byVehicle.map((c) => c.id),
    ['c2'],
  );

  const byJobCard = filterJobCardsList(cards, GARAGE_ID, {
    search: 'jc-103',
    statusFilter: 'delivered',
    dateFilter: { period: 'daily', selectedDate: '2026-11-16', selectedMonth: '2026-11' },
  });
  assert.deepEqual(
    byJobCard.map((c) => c.id),
    ['c3'],
  );

  const nov15Only = filterJobCardsList(cards, GARAGE_ID, {
    search: '',
    statusFilter: 'pending',
    dateFilter: { period: 'daily', selectedDate: '2026-11-15', selectedMonth: '2026-11' },
  });
  assert.deepEqual(
    nov15Only.map((c) => c.id),
    ['c1'],
  );
});

test('filterConfirmedDeliveredVehicles strictly shows ONLY confirmed deliveries', () => {
  const cards: JobCard[] = [
    makeCard({
      id: 'confirmed_ok',
      rawStatus: 'Delivered',
      isDelivered: true,
      deliveredAt: '2026-11-16T10:00:00',
    }),
    makeCard({
      id: 'unconfirmed_missing_date',
      rawStatus: 'Delivered',
      isDelivered: true,
      deliveredAt: null,
    }),
    makeCard({
      id: 'pending_row',
      rawStatus: 'Pending',
      isDelivered: false,
      deliveredAt: null,
    }),
    makeCard({
      id: 'in_progress_row',
      rawStatus: 'In Progress',
      isDelivered: false,
      deliveredAt: null,
    }),
    makeCard({
      id: 'cancelled_row',
      rawStatus: 'Cancelled',
      isDelivered: true,
      deliveredAt: '2026-11-16T10:00:00',
    }),
  ];

  const confirmed = filterConfirmedDeliveredVehicles(cards, [], GARAGE_ID, {
    search: '',
    dateFilter: { period: 'all', selectedDate: '2026-11-16', selectedMonth: '2026-11' },
  });

  assert.deepEqual(
    confirmed.map((row) => row.card.id),
    ['confirmed_ok'],
  );
});

test('evaluateCustomerOutreachEligibility excludes invalid phones and already-notified customers for same delivery event', () => {
  const eligibleCard = makeCard({
    id: 'deliv_eligible',
    jobCardNumber: 'JC-201',
    customerName: 'Kiran Patel',
    phoneNumber: '+919876500001',
    vehicleRegistration: 'GJ01AA0001',
    rawStatus: 'Delivered',
    isDelivered: true,
    deliveredAt: '2026-11-16T10:00:00.000Z',
    deliveryConfirmedAt: '2026-11-16T10:05:00.000Z',
  });

  const missingPhoneCard = makeCard({
    id: 'deliv_bad_phone',
    jobCardNumber: 'JC-202',
    customerName: 'No Phone Customer',
    phoneNumber: '123',
    vehicleRegistration: 'GJ01AA0002',
    rawStatus: 'Delivered',
    isDelivered: true,
    deliveredAt: '2026-11-16T10:00:00.000Z',
    deliveryConfirmedAt: '2026-11-16T10:05:00.000Z',
  });

  const alreadyNotifiedCard = makeCard({
    id: 'deliv_notified',
    jobCardNumber: 'JC-203',
    customerName: 'Notified Customer',
    phoneNumber: '+919876500003',
    vehicleRegistration: 'GJ01AA0003',
    rawStatus: 'Delivered',
    isDelivered: true,
    deliveredAt: '2026-11-16T10:00:00.000Z',
    deliveryConfirmedAt: '2026-11-16T10:05:00.000Z',
  });

  const reDeliveredLaterCard = makeCard({
    id: 'deliv_new_event',
    jobCardNumber: 'JC-204',
    customerName: 'Returning Customer',
    phoneNumber: '+919876500004',
    vehicleRegistration: 'GJ01AA0004',
    rawStatus: 'Delivered',
    isDelivered: true,
    deliveredAt: '2026-11-16T14:00:00.000Z',
    deliveryConfirmedAt: '2026-11-16T14:05:00.000Z',
  });

  const logs: WhatsAppMessageLog[] = [
    // Draft only (not successfully notified yet) -> must remain eligible
    {
      id: 'wa_draft_only',
      tenantId: GARAGE_ID,
      jobCardId: eligibleCard.id,
      customerName: eligibleCard.customerName,
      phoneNumber: eligibleCard.phoneNumber,
      vehicleRegistration: eligibleCard.vehicleRegistration,
      templateName: 'Delivery Notification',
      renderedMessage: 'Draft',
      status: 'draft_not_sent_api_disconnected',
      createdAt: '2026-11-16T10:10:00.000Z',
    },
    // Successfully sent for same delivery event -> must be excluded
    {
      id: 'wa_sent_same_event',
      tenantId: GARAGE_ID,
      jobCardId: alreadyNotifiedCard.id,
      customerName: alreadyNotifiedCard.customerName,
      phoneNumber: alreadyNotifiedCard.phoneNumber,
      vehicleRegistration: alreadyNotifiedCard.vehicleRegistration,
      templateName: 'Delivery Notification',
      renderedMessage: 'Delivered!',
      status: 'delivered',
      createdAt: '2026-11-16T10:12:00.000Z',
    },
    // Old notification from BEFORE new delivery confirmation -> must stay eligible for new event
    {
      id: 'wa_old_event',
      tenantId: GARAGE_ID,
      jobCardId: reDeliveredLaterCard.id,
      customerName: reDeliveredLaterCard.customerName,
      phoneNumber: reDeliveredLaterCard.phoneNumber,
      vehicleRegistration: reDeliveredLaterCard.vehicleRegistration,
      templateName: 'Delivery Notification',
      renderedMessage: 'Previous service delivered',
      status: 'sent',
      createdAt: '2026-10-01T10:00:00.000Z',
    },
  ];

  assert.equal(hasValidMobileNumber('+91 98765-43210'), true);
  assert.equal(hasValidMobileNumber('12345'), false);

  assert.equal(
    evaluateCustomerOutreachEligibility(eligibleCard, logs, GARAGE_ID).eligible,
    true,
  );
  assert.equal(
    evaluateCustomerOutreachEligibility(missingPhoneCard, logs, GARAGE_ID).eligible,
    false,
  );
  assert.equal(
    evaluateCustomerOutreachEligibility(alreadyNotifiedCard, logs, GARAGE_ID).eligible,
    false,
  );
  assert.equal(
    evaluateCustomerOutreachEligibility(reDeliveredLaterCard, logs, GARAGE_ID).eligible,
    true,
  );
});
