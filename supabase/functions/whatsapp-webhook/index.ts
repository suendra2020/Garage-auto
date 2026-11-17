import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const STATUS_RANK: Record<string, number> = {
  draft_not_sent: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 99,
};

function canTransitionStatus(currentStatus: string, nextStatus: string): boolean {
  if (nextStatus === 'failed') {
    return currentStatus !== 'delivered' && currentStatus !== 'read';
  }
  const curRank = STATUS_RANK[currentStatus] ?? 0;
  const nextRank = STATUS_RANK[nextStatus] ?? 0;
  return nextRank > curRank && currentStatus !== 'failed';
}

async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret) return true; // Optional if META_APP_SECRET is not set yet
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const providedHex = signatureHeader.slice(7).trim().toLowerCase();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expectedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (providedHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i += 1) {
    diff |= expectedHex.charCodeAt(i) ^ providedHex.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // 1. Meta Webhook Verification Handshake (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expectedToken = (Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ?? '').trim();

    if (!expectedToken) {
      return new Response('WHATSAPP_WEBHOOK_VERIFY_TOKEN secret not configured.', { status: 500 });
    }

    if (mode === 'subscribe' && token === expectedToken && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return new Response('Forbidden: verify token mismatch.', { status: 403 });
  }

  // 2. Meta Delivery / Read / Failed Status Webhook (POST)
  if (req.method !== 'POST') {
    return new Response('Method not allowed.', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const metaAppSecret = (Deno.env.get('META_APP_SECRET') ?? '').trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response('Supabase server configuration missing.', { status: 500 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get('x-hub-signature-256');
  const signatureValid = await verifyMetaSignature(rawBody, sigHeader, metaAppSecret);
  if (!signatureValid) {
    return new Response('Invalid X-Hub-Signature-256 signature.', { status: 401 });
  }

  let body: {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          statuses?: Array<{
            id?: string;
            status?: string;
            timestamp?: string;
            errors?: Array<{ code?: number; title?: string; message?: string }>;
          }>;
        };
      }>;
    }>;
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON webhook payload.', { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let updatedCount = 0;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const metadataPhoneNumberId = String(change.value?.metadata?.phone_number_id ?? '').trim();
      const statuses = change.value?.statuses ?? [];

      for (const st of statuses) {
        const wamid = String(st.id ?? '').trim();
        const incomingStatus = String(st.status ?? '').trim().toLowerCase();
        if (!wamid || !['sent', 'delivered', 'read', 'failed'].includes(incomingStatus)) {
          continue;
        }

        const { data: logRow } = await adminClient
          .from('whatsapp_logs')
          .select('id, garage_id, message_status, garages(whatsapp_phone_number_id)')
          .eq('whatsapp_message_id', wamid)
          .maybeSingle();

        if (!logRow) continue;

        // Tenant isolation guard: verify webhook Phone Number ID matches the garage owning this log
        const garageMeta = logRow.garages as { whatsapp_phone_number_id?: string } | null;
        if (
          metadataPhoneNumberId &&
          garageMeta?.whatsapp_phone_number_id &&
          garageMeta.whatsapp_phone_number_id !== metadataPhoneNumberId
        ) {
          continue;
        }

        if (!canTransitionStatus(String(logRow.message_status), incomingStatus)) {
          continue;
        }

        const eventTs = st.timestamp
          ? new Date(Number(st.timestamp) * 1000).toISOString()
          : new Date().toISOString();
        const nowIso = new Date().toISOString();

        const updateFields: Record<string, unknown> = {
          message_status: incomingStatus,
          status_updated_at: nowIso,
          webhook_payload: st,
        };

        if (incomingStatus === 'sent') {
          updateFields.sent_at = eventTs;
        } else if (incomingStatus === 'delivered') {
          updateFields.delivered_at = eventTs;
        } else if (incomingStatus === 'read') {
          updateFields.read_at = eventTs;
        } else if (incomingStatus === 'failed') {
          updateFields.failed_at = eventTs;
          const firstErr = st.errors?.[0];
          updateFields.error_message =
            firstErr?.message || firstErr?.title || `Meta delivery failed (code ${firstErr?.code ?? 'unknown'})`;
        }

        const { error: updErr } = await adminClient
          .from('whatsapp_logs')
          .update(updateFields)
          .eq('id', logRow.id)
          .eq('garage_id', logRow.garage_id);

        if (!updErr) {
          updatedCount += 1;
        }
      }
    }
  }

  return new Response(JSON.stringify({ received: true, updatedCount }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
