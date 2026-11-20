/**
 * POST /api/auth/carry-over  { email, password }
 *
 * Moves a password from an app's old Firebase project into Supabase on first
 * sign-in after the move (netlify/lib/carryOver.mjs). The page calls this only
 * after Supabase refused the password, then signs in to Supabase again.
 *
 * Environment (Netlify, functions scope):
 *   SUPABASE_URL                the project URL (not secret)
 *   SUPABASE_SERVICE_ROLE_KEY   the service role key. Secret.
 */
import { carryOver, supabaseAdmin } from '../lib/carryOver.mjs';
import { env, json } from '../lib/shared.mjs';

export const config = { path: '/api/auth/carry-over' };

const NO = { ok: false, error: 'Wrong email or password.' };

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(503, { ok: false, error: 'Accounts are not set up here yet.' });
  let body;
  try { body = await req.json(); } catch { return json(400, NO); }
  try {
    const r = await carryOver(body?.email, body?.password, { admin: supabaseAdmin(url, key) });
    if (!r.ok) {
      console.info(`[carry-over] refused: ${r.reason}`);
      // A flat delay, so this is no faster a way to guess passwords than signing in.
      await new Promise((res) => setTimeout(res, 600));
      return json(401, NO);
    }
    return json(200, { ok: true, created: r.created });
  } catch (e) {
    console.error('[carry-over] failed:', e);
    return json(502, { ok: false, error: 'Sign-in is having trouble. Try again in a minute.' });
  }
};
