import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignRole,
  canManageGarageStaff,
  canUserAccessTenant,
  filterDeliveredVehicles,
  isDeliveredStatus,
  isValidHttpUrl,
  mapImportedRows,
  normalizePhoneNumber,
  renderWhatsAppTemplate,
  scopeByTenant,
  suggestColumnMapping,
  validateGarageCreation,
  validateGarageRegistrationInput,
  validateLoginInput,
  validatePasswordUpdate,
  validateStaffCreationInput,
} from './tenantLogic';
import type { JobCard, UserSession } from '../types/garage';

test('scopeByTenant strictly isolates records per garage tenant', () => {
  const cards: JobCard[] = [
    {
      id: '1',
      tenantId: 'garage-a',
      importBatchId: 'b1',
      jobCardNumber: 'JC-101',
      customerName: 'Aarav',
      phoneNumber: '+919876543210',
      vehicleRegistration: 'MH12AB1234',
      vehicleBrand: 'Honda',
      vehicleModel: 'City',
      serviceType: 'Periodic Service',
      rawStatus: 'Delivered',
      isDelivered: true,
      deliveredAt: '2026-11-14T08:00:00Z',
      whatsappDispatchStatus: 'not_sent',
    },
    {
      id: '2',
      tenantId: 'garage-b',
      importBatchId: 'b2',
      jobCardNumber: 'JC-202',
      customerName: 'Priya',
      phoneNumber: '+919988776655',
      vehicleRegistration: 'KA01XY9999',
      vehicleBrand: 'Hyundai',
      vehicleModel: 'Creta',
      serviceType: 'Body Repair',
      rawStatus: 'Delivered',
      isDelivered: true,
      deliveredAt: '2026-11-14T09:00:00Z',
      whatsappDispatchStatus: 'not_sent',
    },
  ];

  const garageACards = scopeByTenant(cards, 'garage-a');
  assert.equal(garageACards.length, 1);
  assert.equal(garageACards[0].id, '1');

  const noTenantCards = scopeByTenant(cards, null);
  assert.equal(noTenantCards.length, 0);
});

test('canUserAccessTenant supports multi-garage users and blocks unauthorized garages', () => {
  const garageAdmin: UserSession = {
    userId: 'u1',
    email: 'admin@garagea.com',
    fullName: 'Garage A Admin',
    role: 'garage_admin',
    tenantId: 'garage-a',
    authorizedTenantIds: ['garage-a', 'garage-c'],
    emailVerified: true,
    authMode: 'supabase',
  };
  const superAdmin: UserSession = {
    userId: 'sa1',
    email: 'root@garageconnect.io',
    fullName: 'Platform Owner',
    role: 'super_admin',
    tenantId: null,
    authorizedTenantIds: [],
    emailVerified: true,
    authMode: 'supabase',
  };

  assert.equal(canUserAccessTenant(garageAdmin, 'garage-a'), true);
  assert.equal(canUserAccessTenant(garageAdmin, 'garage-c'), true);
  assert.equal(canUserAccessTenant(garageAdmin, 'garage-b'), false);
  assert.equal(canUserAccessTenant(superAdmin, 'garage-b'), true);
  assert.equal(canUserAccessTenant(null, 'garage-a'), false);
});

test('canManageGarageStaff and canAssignRole enforce strict RBAC and block super_admin escalation', () => {
  const garageAdmin: UserSession = {
    userId: 'u1',
    email: 'admin@garagea.com',
    fullName: 'Garage A Admin',
    role: 'garage_admin',
    tenantId: 'garage-a',
    authorizedTenantIds: ['garage-a'],
    emailVerified: true,
    authMode: 'supabase',
  };
  const garageStaff: UserSession = {
    userId: 'u2',
    email: 'staff@garagea.com',
    fullName: 'Garage A Staff',
    role: 'garage_staff',
    tenantId: 'garage-a',
    authorizedTenantIds: ['garage-a'],
    emailVerified: true,
    authMode: 'supabase',
  };

  assert.equal(canManageGarageStaff(garageAdmin, 'garage-a'), true);
  assert.equal(canManageGarageStaff(garageAdmin, 'garage-b'), false);
  assert.equal(canManageGarageStaff(garageStaff, 'garage-a'), false);

  assert.equal(canAssignRole('public', 'super_admin'), false);
  assert.equal(canAssignRole('garage_admin', 'super_admin'), false);
  assert.equal(canAssignRole('garage_staff', 'garage_staff'), false);
  assert.equal(canAssignRole('garage_admin', 'garage_staff'), true);
  assert.equal(canAssignRole('super_admin', 'super_admin'), true);
});

test('isDeliveredStatus distinguishes delivered vehicles from in-progress or pending delivery', () => {
  assert.equal(isDeliveredStatus('Delivered'), true);
  assert.equal(isDeliveredStatus('Vehicle Delivered'), true);
  assert.equal(isDeliveredStatus('Completed & Delivered'), true);
  assert.equal(isDeliveredStatus('Handed Over'), true);

  assert.equal(isDeliveredStatus('Not Delivered'), false);
  assert.equal(isDeliveredStatus('Ready for Delivery'), false);
  assert.equal(isDeliveredStatus('Pending Delivery'), false);
  assert.equal(isDeliveredStatus('In Progress'), false);
  assert.equal(isDeliveredStatus(''), false);
});

test('mapImportedRows assigns tenantId, detects delivered vehicles, and skips blank rows', () => {
  const rawRows = [
    {
      'Job Card No': 'JC-401',
      'Customer Name': 'Rohan Verma',
      'Mobile': '+91 98111-22333',
      'Vehicle Reg': 'dl01ca1111',
      'Vehicle Brand': 'Maruti',
      'Model': 'Swift',
      'Service': 'Oil Change',
      'Status': 'Delivered',
    },
    {
      'Job Card No': 'JC-402',
      'Customer Name': 'Sneha Nair',
      'Mobile': '9822233444',
      'Vehicle Reg': 'mh02de2222',
      'Vehicle Brand': 'Tata',
      'Model': 'Nexon',
      'Service': 'Brake Inspection',
      'Status': 'In Progress',
    },
    {
      'Job Card No': '',
      'Customer Name': '',
      'Mobile': '',
      'Vehicle Reg': '',
      'Vehicle Brand': '',
      'Model': '',
      'Service': '',
      'Status': '',
    },
  ];

  const mapping = suggestColumnMapping(Object.keys(rawRows[0]));
  assert.equal(mapping.jobCardNumber, 'Job Card No');
  assert.equal(mapping.vehicleBrand, 'Vehicle Brand');
  assert.equal(mapping.vehicleModel, 'Model');

  const result = mapImportedRows(rawRows, mapping, 'tenant-x', 'batch-1', '2026-11-14T10:00:00Z');
  assert.equal(result.jobCards.length, 2);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.deliveredCount, 1);

  const delivered = filterDeliveredVehicles(result.jobCards, 'tenant-x');
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].jobCardNumber, 'JC-401');
});

test('renderWhatsAppTemplate interpolates garage-specific variables cleanly', () => {
  const body =
    'Hi {{customer_name}}, your {{vehicle_model}} ({{vehicle_reg}}) from {{garage_name}} [{{job_card_no}}] is delivered. Review us: {{google_review_url}}';
  const rendered = renderWhatsAppTemplate(body, {
    customerName: 'Vikram',
    garageName: 'Apex Auto Care',
    vehicleReg: 'KA03MN4455',
    vehicleModel: 'Toyota Fortuner',
    jobCardNumber: 'JC-889',
    googleReviewUrl: 'https://g.page/r/apex-auto/review',
    instagramUrl: 'https://instagram.com/apexauto',
  });

  assert.equal(
    rendered,
    'Hi Vikram, your Toyota Fortuner (KA03MN4455) from Apex Auto Care [JC-889] is delivered. Review us: https://g.page/r/apex-auto/review',
  );
});

test('registration, staff creation, password update, and login validation catch bad inputs', () => {
  const badReg = validateGarageRegistrationInput({
    garageName: '',
    ownerName: '',
    email: 'invalid',
    mobileNumber: '12',
    address: '',
    password: '123',
  });
  assert.equal(badReg.valid, false);
  assert.equal(Object.keys(badReg.errors).length, 6);

  const goodReg = validateGarageRegistrationInput({
    garageName: 'Horizon Auto Works',
    ownerName: 'Rajesh Patil',
    email: 'rajesh@horizonauto.in',
    mobileNumber: '+91 98200 11223',
    address: 'Baner Road, Pune',
    password: 'Password123',
  });
  assert.equal(goodReg.valid, true);

  const badStaff = validateStaffCreationInput({
    fullName: '',
    email: 'nope',
    password: '12',
  });
  assert.equal(badStaff.valid, false);
  assert.equal(Object.keys(badStaff.errors).length, 3);

  assert.equal(validatePasswordUpdate('secret1', 'secret2').valid, false);
  assert.equal(validatePasswordUpdate('secret1', 'secret1').valid, true);

  const emptyLogin = validateLoginInput('', '');
  assert.equal(emptyLogin.valid, false);
  assert.ok(emptyLogin.errors.email);
  assert.ok(emptyLogin.errors.password);

  assert.equal(validateGarageCreation({ name: 'A', city: '', contactPhone: '1', adminEmail: 'x' }).valid, false);
  assert.equal(normalizePhoneNumber(' (987) 654-3210 '), '9876543210');
  assert.equal(isValidHttpUrl('https://g.page/r/example/review'), true);
  assert.equal(isValidHttpUrl('not-a-url'), false);
});
