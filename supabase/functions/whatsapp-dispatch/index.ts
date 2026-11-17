import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const META_GRAPH_VERSION = 'v21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeRecipientDigits(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (!hasPlus && digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

function isDeliveredCard(row: Record<string, unknown>): boolean {
  const status = String(row.job_card_status ?? '').trim().toLowerCase();
  const deliveryDate = row.delivery_date ? String(row.delivery_date) : '';
  if (!deliveryDate) return false;
  if (['cancel', 'canceled', 'cancelled', 'void', 'rejected'].some((t) => status.includes(t))) {
    return false;
  }
  if (
    ['not delivered', 'undelivered', 'pending delivery', 'in progress', 'wip', 'open'].some((t) =>
      status.includes(t),
    )
  ) {
    return false;
  }
  return ['delivered', 'handed over', 'handover complete', 'vehicle delivered'].some((t) =>
    status.includes(t),
  );
}

function resolveTemplateBodyAndParams(
  templateContent: string,
  vars: Record<string, string>,
): { renderedMessage: string; bodyParameters: Array<{ type: 'text'; text: string }> } {
  const tokenRegex =
    /\{\{(customer_name|garage_name|vehicle_reg|vehicle_model|job_card_no|google_review_url|instagram_url|\d+)\}\}/g;

  const positionalFallback = [
    vars.customer_name || 'Customer',
    vars.vehicle_model || 'your vehicle',
    vars.vehicle_reg || '-',
    vars.job_card_no || '-',
    vars.garage_name || 'Our Garage',
    vars.google_review_url || vars.instagram_url || '-',
  ];

  const bodyParameters: Array<{ type: 'text'; text: string }> = [];

  const renderedMessage = templateContent.replace(tokenRegex, (_full, key: string) => {
    let val = '';
    if (/^\d+$/.test(key)) {
      const idx = Math.max(0, Number(key) - 1);
      val = positionalFallback[idx] ?? '-';
    } else {
      val = vars[key] || '-';
    }
    bodyParameters.push({ type: 'text', text: val });
    return val;
  });

  return { renderedMessage, bodyParameters };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const whatsappAccessToken = (Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '').trim();

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return jsonResponse(
      { error: 'Supabase server environment variables are not configured.' },
      500,
    );
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing Authorization bearer token.' }, 401);
  }

  // Authenticate the caller using their Supabase JWT
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'Invalid or expired user session.' }, 401);
  }
  const callerUserId = userData.user.id;

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON request body.' }, 400);
  }

  const action = String(payload.action ?? '');
  const garageId = String(payload.garageId ?? '').trim();

  if (!garageId) {
    return jsonResponse({ error: 'garageId is required.' }, 400);
  }

  // Enforce strict tenant isolation: verify caller belongs to this exact garageId
  const { data: membership, error: memErr } = await adminClient
    .from('garage_users')
    .select('role')
    .eq('garage_id', garageId)
    .eq('user_id', callerUserId)
    .maybeSingle();

  if (memErr || !membership) {
    return jsonResponse(
      { error: 'Access denied: you are not an authorized member of this garage.' },
      403,
    );
  }

  // Fetch this garage's authoritative credentials from PostgreSQL (never trust client-sent IDs)
  const { data: garageRow, error: garErr } = await adminClient
    .from('garages')
    .select(
      'id, garage_name, slug, phone_number, google_review_url, instagram_url, account_status, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_display_name, whatsapp_connection_status',
    )
    .eq('id', garageId)
    .single();

  if (garErr || !garageRow) {
    return jsonResponse({ error: 'Garage record not found.' }, 404);
  }

  if (garageRow.account_status !== 'active') {
    return jsonResponse(
      { error: 'Garage workspace is not active. WhatsApp actions are disabled.' },
      403,
    );
  }

  const phoneNumberId = String(garageRow.whatsapp_phone_number_id ?? '').trim();
  const wabaId = String(garageRow.whatsapp_waba_id ?? '').trim();

  if (!whatsappAccessToken) {
    if (action === 'test_connection') {
      await adminClient
        .from('garages')
        .update({
          whatsapp_connection_status: 'not_connected',
          whatsapp_last_test_error:
            'Server secret WHATSAPP_ACCESS_TOKEN is not configured in Supabase Edge Function secrets.',
        })
        .eq('id', garageId);
    }
    return jsonResponse(
      {
        connected: false,
        error:
          'Server secret WHATSAPP_ACCESS_TOKEN is missing. Add it via Supabase Edge Function secrets (never in frontend code).',
      },
      503,
    );
  }

  if (!phoneNumberId || !wabaId) {
    if (action === 'test_connection') {
      await adminClient
        .from('garages')
        .update({
          whatsapp_connection_status: 'not_connected',
          whatsapp_last_test_error: 'Phone Number ID and WABA Account ID must be saved first.',
        })
        .eq('id', garageId);
    }
    return jsonResponse(
      {
        connected: false,
        error: 'Save both WhatsApp Phone Number ID and WABA Account ID in Garage Settings first.',
      },
      400,
    );
  }

  // ---------------------------------------------------------------------------
  // ACTION 1: Test live Meta Cloud API connection (Garage Admin only)
  // ---------------------------------------------------------------------------
  if (action === 'test_connection') {
    if (membership.role !== 'garage_admin') {
      return jsonResponse(
        { error: 'Only an authorized Garage Admin can test or modify WhatsApp connection.' },
        403,
      );
    }

    try {
      const phoneResp = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(
          phoneNumberId,
        )}?fields=id,display_phone_number,verified_name,quality_rating`,
        {
          headers: { Authorization: `Bearer ${whatsappAccessToken}` },
        },
      );

      const phoneJson = (await phoneResp.json().catch(() => ({}))) as {
        id?: string;
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
        error?: { message?: string; code?: number };
      };

      if (!phoneResp.ok || !phoneJson.id) {
        const errMsg =
          phoneJson.error?.message ||
          `Meta Graph API rejected Phone Number ID (${phoneResp.status}).`;
        await adminClient
          .from('garages')
          .update({
            whatsapp_connection_status: 'not_connected',
            whatsapp_last_test_error: errMsg,
          })
          .eq('id', garageId);

        return jsonResponse({ connected: false, error: errMsg }, 400);
      }

      // Verify Phone Number ID belongs to the configured WABA ID
      const wabaResp = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(
          wabaId,
        )}/phone_numbers?fields=id,display_phone_number,verified_name`,
        {
          headers: { Authorization: `Bearer ${whatsappAccessToken}` },
        },
      );

      const wabaJson = (await wabaResp.json().catch(() => ({}))) as {
        data?: Array<{ id?: string; display_phone_number?: string; verified_name?: string }>;
        error?: { message?: string };
      };

      if (!wabaResp.ok) {
        const errMsg =
          wabaJson.error?.message ||
          `Meta Graph API rejected WABA Account ID (${wabaResp.status}).`;
        await adminClient
          .from('garages')
          .update({
            whatsapp_connection_status: 'not_connected',
            whatsapp_last_test_error: errMsg,
          })
          .eq('id', garageId);

        return jsonResponse({ connected: false, error: errMsg }, 400);
      }

      const ownsPhone = (wabaJson.data ?? []).some((item) => item.id === phoneNumberId);
      if (!ownsPhone) {
        const errMsg = `Phone Number ID ${phoneNumberId} does not belong to WABA Account ID ${wabaId}.`;
        await adminClient
          .from('garages')
          .update({
            whatsapp_connection_status: 'not_connected',
            whatsapp_last_test_error: errMsg,
          })
          .eq('id', garageId);

        return jsonResponse({ connected: false, error: errMsg }, 400);
      }

      const verifiedAt = new Date().toISOString();
      const verifiedPhone = phoneJson.display_phone_number ?? '';
      const verifiedName = phoneJson.verified_name ?? String(garageRow.whatsapp_display_name ?? '');

      await adminClient
        .from('garages')
        .update({
          whatsapp_connection_status: 'connected',
          whatsapp_verified_at: verifiedAt,
          whatsapp_verified_phone_number: verifiedPhone,
          whatsapp_verified_name: verifiedName,
          whatsapp_last_test_error: null,
        })
        .eq('id', garageId);

      return jsonResponse({
        connected: true,
        verifiedAt,
        verifiedPhoneNumber: verifiedPhone,
        verifiedName,
        qualityRating: phoneJson.quality_rating ?? 'UNKNOWN',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unable to reach Meta Graph API.';
      await adminClient
        .from('garages')
        .update({
          whatsapp_connection_status: 'not_connected',
          whatsapp_last_test_error: errMsg,
        })
        .eq('id', garageId);
      return jsonResponse({ connected: false, error: errMsg }, 502);
    }
  }

  // ---------------------------------------------------------------------------
  // ACTION 2: Sync Approved Meta Templates from WABA
  // ---------------------------------------------------------------------------
  if (action === 'sync_templates') {
    try {
      const tplResp = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(
          wabaId,
        )}/message_templates?fields=name,status,language,category,components&limit=50`,
        {
          headers: { Authorization: `Bearer ${whatsappAccessToken}` },
        },
      );
      const tplJson = (await tplResp.json().catch(() => ({}))) as {
        data?: Array<{
          name: string;
          status: string;
          language: string;
          category?: string;
          components?: Array<{ type: string; text?: string }>;
        }>;
        error?: { message?: string };
      };

      if (!tplResp.ok) {
        return jsonResponse(
          { error: tplJson.error?.message || 'Failed to fetch templates from Meta WABA.' },
          400,
        );
      }

      const templates = (tplJson.data ?? []).map((t) => {
        const bodyComp = t.components?.find((c) => c.type === 'BODY');
        const normalizedStatus =
          t.status === 'APPROVED'
            ? 'approved'
            : t.status === 'PENDING'
              ? 'pending'
              : t.status === 'REJECTED'
                ? 'rejected'
                : 'draft';
        return {
          metaTemplateName: t.name,
          approvalStatus: normalizedStatus,
          languageCode: t.language || 'en',
          category: t.category || 'UTILITY',
          body: bodyComp?.text || '',
        };
      });

      return jsonResponse({ templates });
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Unable to fetch Meta templates.' },
        502,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // ACTION 3: Live WhatsApp Batch Dispatch (Explicit Confirmation Required)
  // ---------------------------------------------------------------------------
  if (action === 'send_batch') {
    if (garageRow.whatsapp_connection_status !== 'connected') {
      return jsonResponse(
        {
          error:
            'WhatsApp Cloud API is not verified for this garage. Run "Test WhatsApp Connection" first.',
        },
        400,
      );
    }

    const templateId = String(payload.templateId ?? '').trim();
    const jobCardIds = Array.isArray(payload.jobCardIds)
      ? payload.jobCardIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (!templateId || jobCardIds.length === 0) {
      return jsonResponse({ error: 'templateId and at least one jobCardId are required.' }, 400);
    }

    if (jobCardIds.length > 50) {
      return jsonResponse(
        { error: 'Please send at most 50 messages per confirmed batch.' },
        400,
      );
    }

    // Fetch template strictly scoped to this garageId
    const { data: templateRow, error: tplErr } = await adminClient
      .from('whatsapp_templates')
      .select('id, garage_id, template_name, template_content, meta_template_name, meta_language_code, approval_status')
      .eq('id', templateId)
      .eq('garage_id', garageId)
      .single();

    if (tplErr || !templateRow) {
      return jsonResponse({ error: 'Message template not found for this garage.' }, 404);
    }

    if (templateRow.approval_status !== 'approved' || !templateRow.meta_template_name) {
      return jsonResponse(
        {
          error:
            'Only Meta-approved WhatsApp templates with a configured Meta Template Name can be dispatched live.',
        },
        400,
      );
    }

    // Fetch job cards strictly scoped to this garageId
    const { data: cardRows, error: cardErr } = await adminClient
      .from('job_cards')
      .select(
        'id, garage_id, job_card_number, customer_name, mobile_number, vehicle_number, vehicle_model, job_card_status, delivery_date, delivery_confirmed_at',
      )
      .eq('garage_id', garageId)
      .in('id', jobCardIds);

    if (cardErr || !cardRows) {
      return jsonResponse({ error: 'Unable to load selected job cards.' }, 500);
    }

    // Load recent successful logs for duplicate delivery-event guard
    const { data: existingLogs } = await adminClient
      .from('whatsapp_logs')
      .select('job_card_id, message_status, sent_at')
      .eq('garage_id', garageId)
      .in('job_card_id', jobCardIds)
      .in('message_status', ['sent', 'delivered', 'read']);

    const results: Array<{
      jobCardId: string;
      logId?: string;
      status: 'sent' | 'failed' | 'skipped';
      whatsappMessageId?: string | null;
      error?: string;
    }> = [];

    const garageReviewUrl = String(garageRow.google_review_url ?? '').trim();
    const garageInstagramUrl = String(garageRow.instagram_url ?? '').trim();
    const metaLanguageCode = String(templateRow.meta_language_code || 'en').trim() || 'en';
    const metaTemplateName = String(templateRow.meta_template_name).trim();

    for (const card of cardRows) {
      if (!isDeliveredCard(card)) {
        results.push({
          jobCardId: card.id,
          status: 'skipped',
          error: 'Vehicle delivery is not confirmed.',
        });
        continue;
      }

      const recipientDigits = normalizeRecipientDigits(String(card.mobile_number ?? ''));
      if (recipientDigits.length < 10) {
        results.push({
          jobCardId: card.id,
          status: 'skipped',
          error: 'Customer mobile number is missing or invalid.',
        });
        continue;
      }

      const deliveryEventMs = new Date(
        String(card.delivery_confirmed_at || card.delivery_date || 0),
      ).getTime();
      const alreadySent = (
        (existingLogs ?? []) as Array<{ job_card_id?: string | null; sent_at?: string | null }>
      ).some((log) => {
        if (log.job_card_id !== card.id) return false;
        const logMs = new Date(String(log.sent_at || 0)).getTime();
        return Number.isNaN(deliveryEventMs) ? true : logMs >= deliveryEventMs;
      });
      if (alreadySent) {
        results.push({
          jobCardId: card.id,
          status: 'skipped',
          error: 'Customer already notified for this delivery.',
        });
        continue;
      }

      const { renderedMessage, bodyParameters } = resolveTemplateBodyAndParams(
        String(templateRow.template_content ?? ''),
        {
          customer_name: String(card.customer_name ?? 'Customer'),
          garage_name: String(garageRow.garage_name ?? 'Our Garage'),
          vehicle_reg: String(card.vehicle_number ?? ''),
          vehicle_model: String(card.vehicle_model ?? 'your vehicle'),
          job_card_no: String(card.job_card_number ?? ''),
          google_review_url: garageReviewUrl || 'https://garages.app',
          instagram_url: garageInstagramUrl || 'https://instagram.com',
        },
      );

      const graphPayload: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientDigits,
        type: 'template',
        template: {
          name: metaTemplateName,
          language: { code: metaLanguageCode },
          ...(bodyParameters.length > 0
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: bodyParameters,
                  },
                ],
              }
            : {}),
        },
      };

      const attemptTime = new Date().toISOString();
      try {
        const sendResp = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(
            phoneNumberId,
          )}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${whatsappAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(graphPayload),
          },
        );

        const sendJson = (await sendResp.json().catch(() => ({}))) as {
          messages?: Array<{ id?: string }>;
          error?: { message?: string; code?: number };
        };

        const wamid = sendJson.messages?.[0]?.id ?? null;

        if (sendResp.ok && wamid) {
          // IMPORTANT: Meta API accepted request -> record 'sent', NEVER falsely mark 'delivered'
          const { data: insertedLog } = await adminClient
            .from('whatsapp_logs')
            .insert({
              garage_id: garageId,
              job_card_id: card.id,
              template_id: templateRow.id,
              meta_template_name: metaTemplateName,
              recipient_number: String(card.mobile_number ?? recipientDigits),
              message_type: templateRow.template_name,
              rendered_message: renderedMessage,
              message_status: 'sent',
              whatsapp_message_id: wamid,
              sent_by: callerUserId,
              sent_at: attemptTime,
              status_updated_at: attemptTime,
              error_message: null,
            })
            .select('id')
            .single();

          results.push({
            jobCardId: card.id,
            logId: insertedLog?.id,
            status: 'sent',
            whatsappMessageId: wamid,
          });
        } else {
          const errMsg =
            sendJson.error?.message || `Meta Cloud API rejected message (${sendResp.status}).`;
          const { data: failedLog } = await adminClient
            .from('whatsapp_logs')
            .insert({
              garage_id: garageId,
              job_card_id: card.id,
              template_id: templateRow.id,
              meta_template_name: metaTemplateName,
              recipient_number: String(card.mobile_number ?? recipientDigits),
              message_type: templateRow.template_name,
              rendered_message: renderedMessage,
              message_status: 'failed',
              whatsapp_message_id: null,
              sent_by: callerUserId,
              sent_at: attemptTime,
              failed_at: attemptTime,
              status_updated_at: attemptTime,
              error_message: errMsg,
            })
            .select('id')
            .single();

          results.push({
            jobCardId: card.id,
            logId: failedLog?.id,
            status: 'failed',
            error: errMsg,
          });
        }
      } catch (sendErr) {
        const errMsg =
          sendErr instanceof Error ? sendErr.message : 'Network error calling Meta Cloud API.';
        const { data: failedLog } = await adminClient
          .from('whatsapp_logs')
          .insert({
            garage_id: garageId,
            job_card_id: card.id,
            template_id: templateRow.id,
            meta_template_name: metaTemplateName,
            recipient_number: String(card.mobile_number ?? recipientDigits),
            message_type: templateRow.template_name,
            rendered_message: renderedMessage,
            message_status: 'failed',
            whatsapp_message_id: null,
            sent_by: callerUserId,
            sent_at: attemptTime,
            failed_at: attemptTime,
            status_updated_at: attemptTime,
            error_message: errMsg,
          })
          .select('id')
          .single();

        results.push({
          jobCardId: card.id,
          logId: failedLog?.id,
          status: 'failed',
          error: errMsg,
        });
      }
    }

    return jsonResponse({
      sentCount: results.filter((r) => r.status === 'sent').length,
      failedCount: results.filter((r) => r.status === 'failed').length,
      skippedCount: results.filter((r) => r.status === 'skipped').length,
      results,
    });
  }

  return jsonResponse({ error: `Unknown action: ${action}` }, 400);
});
