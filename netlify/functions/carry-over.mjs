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

/** Apps' own sites that may ask (inside Hive they're same-origin and need nothing). */
const ORIGINS = new Set(['https://stimultrack.netlify.app']);
const cors = (req) => {
  const o = req.headers.get('origin');
  return o && ORIGINS.has(o) ? { 'access-control-allow-origin': o, vary: 'origin' } : {};
};

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors(req), 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
  }
  const res = await handle(req);
  for (const [k, v] of Object.entries(cors(req))) res.headers.set(k, v);
  return res;
};

async function handle(req) {
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
}
