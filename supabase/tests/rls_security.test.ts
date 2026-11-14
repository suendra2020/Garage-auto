import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Live Supabase RLS Cross-Tenant Security Tests
 *
 * Proves that authenticated users in Garage A CANNOT read, insert, update, or delete
 * Garage B records, nor escalate their profile role to super_admin.
 *
 * Run against your Supabase project after applying migrations 0001 & 0002:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx --test supabase/tests/rls_security.test.ts
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const hasLiveSupabaseCredentials =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_ANON_KEY) &&
  Boolean(SUPABASE_SERVICE_ROLE_KEY) &&
  !SUPABASE_URL.includes('YOUR_PROJECT_REF');

const createdUserIds: string[] = [];
const createdGarageIds: string[] = [];

async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  return client;
}

after(async () => {
  if (!hasLiveSupabaseCredentials) return;
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const garageId of createdGarageIds) {
    await adminClient.from('garages').delete().eq('id', garageId);
  }
  for (const userId of createdUserIds) {
    await adminClient.auth.admin.deleteUser(userId);
  }
});

test(
  'Live RLS: Garage A user cannot read, spoof-insert, update, or delete Garage B records',
  { skip: !hasLiveSupabaseCredentials ? 'Requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY' : false },
  async () => {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const pass = 'TestPass!2026';
    const emailA = `rls_a_${suffix}@test.local`;
    const emailB = `rls_b_${suffix}@test.local`;
    const emailMulti = `rls_multi_${suffix}@test.local`;

    // 1. Provision isolated test auth users
    const { data: uA, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password: pass,
      email_confirm: true,
      user_metadata: { full_name: 'Garage A Admin' },
    });
    assert.ifError(errA);
    createdUserIds.push(uA.user!.id);

    const { data: uB, error: errB } = await admin.auth.admin.createUser({
      email: emailB,
      password: pass,
      email_confirm: true,
      user_metadata: { full_name: 'Garage B Admin' },
    });
    assert.ifError(errB);
    createdUserIds.push(uB.user!.id);

    const { data: uMulti, error: errM } = await admin.auth.admin.createUser({
      email: emailMulti,
      password: pass,
      email_confirm: true,
      user_metadata: { full_name: 'Multi Garage Manager' },
    });
    assert.ifError(errM);
    createdUserIds.push(uMulti.user!.id);

    // 2. Provision Garage A and Garage B
    const { data: garageA, error: gErrA } = await admin
      .from('garages')
      .insert({ garage_name: `RLS Garage A ${suffix}` })
      .select()
      .single();
    assert.ifError(gErrA);
    createdGarageIds.push(garageA.id);

    const { data: garageB, error: gErrB } = await admin
      .from('garages')
      .insert({ garage_name: `RLS Garage B ${suffix}` })
      .select()
      .single();
    assert.ifError(gErrB);
    createdGarageIds.push(garageB.id);

    // Link users to garages (uMulti authorized for BOTH A and B)
    const { error: memErr } = await admin.from('garage_users').insert([
      { garage_id: garageA.id, user_id: uA.user!.id, role: 'garage_admin' },
      { garage_id: garageB.id, user_id: uB.user!.id, role: 'garage_admin' },
      { garage_id: garageA.id, user_id: uMulti.user!.id, role: 'garage_staff' },
      { garage_id: garageB.id, user_id: uMulti.user!.id, role: 'garage_staff' },
    ]);
    assert.ifError(memErr);

    // Seed a Garage B job card & WhatsApp template via service role
    const { data: cardB, error: cErrB } = await admin
      .from('job_cards')
      .insert({
        garage_id: garageB.id,
        job_card_number: 'JC-B-001',
        customer_name: 'Garage B Customer',
        mobile_number: '+919999900001',
        vehicle_number: 'KA01BB0001',
        job_card_status: 'Delivered',
      })
      .select()
      .single();
    assert.ifError(cErrB);

    const clientA = await signInAs(emailA, pass);
    const clientMulti = await signInAs(emailMulti, pass);

    // 3. Garage A CANNOT read Garage B's garage row or job card
    const { data: readGarageB } = await clientA
      .from('garages')
      .select('*')
      .eq('id', garageB.id);
    assert.equal(readGarageB?.length ?? 0, 0);

    const { data: readCardsB } = await clientA
      .from('job_cards')
      .select('*')
      .eq('garage_id', garageB.id);
    assert.equal(readCardsB?.length ?? 0, 0);

    // 4. Garage A CANNOT spoof garage_id = garageB.id on INSERT
    const { error: spoofInsertErr } = await clientA.from('job_cards').insert({
      garage_id: garageB.id,
      job_card_number: 'JC-SPOOF-1',
      customer_name: 'Spoofed Customer',
      vehicle_number: 'MH00XX0000',
    });
    assert.ok(spoofInsertErr, 'Expected RLS to reject spoofed garage_id insert');

    // 5. Garage A CANNOT UPDATE or DELETE Garage B's job card
    const { data: updData } = await clientA
      .from('job_cards')
      .update({ customer_name: 'Tampered' })
      .eq('id', cardB.id)
      .select();
    assert.equal(updData?.length ?? 0, 0);

    const { data: delData } = await clientA
      .from('job_cards')
      .delete()
      .eq('id', cardB.id)
      .select();
    assert.equal(delData?.length ?? 0, 0);

    // 6. Garage A CANNOT escalate profile role to super_admin
    const { error: escErr } = await clientA
      .from('profiles')
      .update({ role: 'super_admin' })
      .eq('id', uA.user!.id);
    assert.ok(escErr, 'Expected trigger to block privilege escalation to super_admin');

    // 7. Multi-garage user CAN access both Garage A and Garage B
    const { data: multiGarages } = await clientMulti.from('garages').select('id');
    const multiIds = new Set((multiGarages ?? []).map((g) => g.id));
    assert.equal(multiIds.has(garageA.id), true);
    assert.equal(multiIds.has(garageB.id), true);
  },
);
