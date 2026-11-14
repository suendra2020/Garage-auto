import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';

function resolvePort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const parsed = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT);
  if (Number.isFinite(envPort) && envPort > 0) return envPort;
  return 3000;
}

const PORT = resolvePort();
const isProduction = process.env.NODE_ENV === 'production';

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('YOUR_PROJECT_REF')),
      staffProvisioningAvailable: Boolean(
        supabaseUrl &&
          supabaseServiceRoleKey &&
          !supabaseUrl.includes('YOUR_PROJECT_REF') &&
          !supabaseServiceRoleKey.includes('YOUR_SUPABASE_SERVICE_ROLE_KEY'),
      ),
    });
  });

  app.post('/api/_tmp_provision_admin', async (req, res) => {
    const { email, password, fullName } = req.body as {
      email?: string;
      password?: string;
      fullName?: string;
    };
    if (!email || !password) {
      res.status(400).json({ error: 'email and password required' });
      return;
    }
    try {
      const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const cleanEmail = email.trim().toLowerCase();
      const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listErr) {
        res.status(500).json({ step: 'listUsers', error: listErr.message });
        return;
      }
      let user = listData.users.find((u) => u.email?.toLowerCase() === cleanEmail);
      if (!user) {
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || 'Platform Super Admin' },
          app_metadata: { role: 'super_admin' },
        });
        if (createErr || !created.user) {
          res.status(400).json({ step: 'createUser', error: createErr?.message });
          return;
        }
        user = created.user;
      } else {
        const { data: updated, error: updErr } = await adminClient.auth.admin.updateUserById(
          user.id,
          {
            password,
            email_confirm: true,
            user_metadata: { ...(user.user_metadata ?? {}), full_name: fullName || 'Platform Super Admin' },
            app_metadata: { ...(user.app_metadata ?? {}), role: 'super_admin' },
          },
        );
        if (updErr || !updated.user) {
          res.status(400).json({ step: 'updateUserById', error: updErr?.message });
          return;
        }
        user = updated.user;
      }

      const { error: profErr } = await adminClient.from('profiles').upsert({
        id: user.id,
        full_name: fullName || 'Platform Super Admin',
        email: cleanEmail,
        role: 'super_admin',
      });

      res.json({
        ok: true,
        userId: user.id,
        email: user.email,
        profileTableStatus: profErr ? `profile_error: ${profErr.message}` : 'profile_ok',
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Server-side staff account creation strictly verifying caller JWT and garage_admin membership
  app.post('/api/staff/create', async (req, res) => {
    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      !supabaseServiceRoleKey ||
      supabaseUrl.includes('YOUR_PROJECT_REF') ||
      supabaseServiceRoleKey.includes('YOUR_SUPABASE_SERVICE_ROLE_KEY')
    ) {
      res.status(503).json({
        error:
          'Server staff provisioning requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.',
      });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Missing Supabase bearer token.' });
      return;
    }

    const { garageId, fullName, email, password } = req.body as {
      garageId?: string;
      fullName?: string;
      email?: string;
      password?: string;
    };

    if (!garageId || !fullName?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({
        error: 'garageId, fullName, valid email, and password (min 6 characters) are required.',
      });
      return;
    }

    try {
      const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: callerData, error: callerErr } = await callerClient.auth.getUser(token);
      if (callerErr || !callerData.user) {
        res.status(401).json({ error: 'Invalid or expired Supabase session.' });
        return;
      }

      const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Verify caller is garage_admin for this exact garageId (never trust frontend garageId alone)
      const { data: membership, error: memErr } = await adminClient
        .from('garage_users')
        .select('role')
        .eq('garage_id', garageId)
        .eq('user_id', callerData.user.id)
        .maybeSingle();

      if (memErr || !membership || membership.role !== 'garage_admin') {
        res.status(403).json({
          error: 'Only an authorized Garage Admin of this garage can create staff accounts.',
        });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName.trim() },
      });

      if (createErr || !createdUser.user) {
        res.status(400).json({
          error: createErr?.message || 'Unable to create staff account in Supabase Auth.',
        });
        return;
      }

      // Link strictly as garage_staff to the verified garageId (never super_admin)
      const { error: linkErr } = await adminClient.from('garage_users').insert({
        garage_id: garageId,
        user_id: createdUser.user.id,
        role: 'garage_staff',
      });

      if (linkErr) {
        res.status(400).json({ error: linkErr.message });
        return;
      }

      res.status(201).json({
        userId: createdUser.user.id,
        email: cleanEmail,
        fullName: fullName.trim(),
        role: 'garage_staff',
        garageId,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unexpected server error creating staff user.',
      });
    }
  });

  if (!isProduction) {
    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`GARAGE-CONNECT-APP server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
