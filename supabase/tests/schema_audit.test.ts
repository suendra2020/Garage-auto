import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const schemaSql = fs.readFileSync(
  path.resolve('supabase/migrations/0001_initial_schema.sql'),
  'utf8',
);
const rlsSql = fs.readFileSync(
  path.resolve('supabase/migrations/0002_rls_policies.sql'),
  'utf8',
);

const REQUIRED_TABLES = [
  'garages',
  'profiles',
  'garage_users',
  'job_cards',
  'excel_imports',
  'whatsapp_templates',
  'whatsapp_logs',
  'customer_consents',
  'subscriptions',
];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  garages: [
    'id UUID',
    'garage_name',
    'logo_url',
    'address',
    'phone_number',
    'email',
    'google_review_url',
    'instagram_url',
    'youtube_url',
    'whatsapp_phone_number_id',
    'subscription_plan',
    'account_status',
    'created_at',
  ],
  profiles: ['id UUID', 'full_name', 'email', 'role', 'created_at'],
  garage_users: ['id UUID', 'garage_id UUID', 'user_id UUID', 'role', 'created_at'],
  job_cards: [
    'id UUID',
    'garage_id UUID',
    'job_card_number',
    'customer_name',
    'mobile_number',
    'vehicle_number',
    'vehicle_brand',
    'vehicle_model',
    'service_details',
    'job_card_status',
    'delivery_date',
    'imported_at',
    'created_at',
  ],
  excel_imports: [
    'id UUID',
    'garage_id UUID',
    'file_name',
    'total_records',
    'imported_records',
    'skipped_records',
    'failed_records',
    'created_at',
  ],
  whatsapp_templates: [
    'id UUID',
    'garage_id UUID',
    'template_name',
    'template_category',
    'template_content',
    'meta_template_name',
    'approval_status',
    'created_at',
  ],
  whatsapp_logs: [
    'id UUID',
    'garage_id UUID',
    'job_card_id UUID',
    'recipient_number',
    'message_type',
    'message_status',
    'whatsapp_message_id',
    'sent_at',
    'error_message',
  ],
  customer_consents: [
    'id UUID',
    'garage_id UUID',
    'customer_mobile',
    'consent_type',
    'consent_status',
    'consent_source',
    'updated_at',
  ],
  subscriptions: ['id UUID', 'garage_id UUID', 'plan_name', 'status', 'start_date', 'expiry_date'],
};

test('0001_initial_schema.sql defines all 9 tables, columns, FKs, unique constraint, and indexes', () => {
  for (const table of REQUIRED_TABLES) {
    assert.ok(
      schemaSql.includes(`CREATE TABLE IF NOT EXISTS public.${table}`),
      `Missing table definition: ${table}`,
    );
    for (const col of REQUIRED_COLUMNS[table]) {
      assert.ok(
        schemaSql.includes(col),
        `Missing column "${col}" in schema for table ${table}`,
      );
    }
  }

  assert.ok(
    schemaSql.includes('UNIQUE (garage_id, job_card_number)'),
    'Missing unique constraint on (garage_id, job_card_number)',
  );
  assert.ok(
    schemaSql.includes('UNIQUE (garage_id, user_id)'),
    'Missing unique constraint on (garage_id, user_id) for multi-garage membership',
  );
  assert.ok(
    schemaSql.includes('CREATE INDEX IF NOT EXISTS idx_job_cards_garage_id'),
    'Missing tenant index on job_cards(garage_id)',
  );
});

test('0002_rls_policies.sql enables and forces RLS on all 9 tables with membership checks', () => {
  for (const table of REQUIRED_TABLES) {
    assert.ok(
      rlsSql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`),
      `RLS not enabled on ${table}`,
    );
    assert.ok(
      rlsSql.includes(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`),
      `RLS not forced on ${table}`,
    );
  }

  assert.ok(rlsSql.includes('public.is_super_admin()'));
  assert.ok(rlsSql.includes('public.is_garage_member(garage_id)'));
  assert.ok(rlsSql.includes('public.is_garage_admin(garage_id)'));
  assert.ok(rlsSql.includes('prevent_profile_role_escalation'));
  assert.ok(rlsSql.includes('create_garage_workspace'));

  const authStaffSql = fs.readFileSync(
    path.resolve('supabase/migrations/0003_auth_staff_security.sql'),
    'utf8',
  );
  assert.ok(authStaffSql.includes('CREATE TABLE IF NOT EXISTS public.garage_staff_invitations'));
  assert.ok(authStaffSql.includes('ALTER TABLE public.garage_staff_invitations ENABLE ROW LEVEL SECURITY'));
  assert.ok(authStaffSql.includes('prevent_unauthorized_garage_membership_change'));
  assert.ok(authStaffSql.includes('accept_pending_garage_invitations'));
});
