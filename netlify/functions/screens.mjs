/*
 * Household screens (netlify/lib/screens.mjs).
 *
 *   POST   /api/hive/screens/claim  { code }   → { token, name }
 *          The tablet redeems an owner's pairing code; the page signs in with
 *          verifyOtp({ token_hash: token, type: 'magiclink' }). No sign-in needed:
 *          the code is the proof (8 characters, 10 minutes, one use).
 *   DELETE /api/hive/screens/:id               Authorization: Bearer <owner's Hive token>
 *          An owner removes one of their household's screens; its sign-in ends.
 *
 * Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (as /api/auth/carry-over).
 */
import { hiveSession } from '../lib/hiveUser.mjs';
import { claimScreen, removeScreen } from '../lib/screens.mjs';
import { env, json } from '../lib/shared.mjs';

export const config = { path: ['/api/hive/screens/claim', '/api/hive/screens/:id'] };

/** Supabase as the service role (the same headers as carryOver.mjs supabaseAdmin). */
function rawCall(url, key) {
  const headers = { apikey: key, 'content-type': 'application/json', ...(key.startsWith('sb_') ? {} : { authorization: `Bearer ${key}` }) };
  return async (path, init = {}) => {
    const r = await fetch(`${url.replace(/\/$/, '')}${path}`, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(8000) });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) throw Object.assign(new Error(data?.msg || data?.message || `Supabase answered ${r.status}`), { status: r.status });
    return data;
  };
}

export default async (req, context) => {
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(503, { error: 'Household screens are not set up here yet.' });
  const call = rawCall(url, key);

  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/claim')) {
    const body = await req.json().catch(() => ({}));
    try {
      const r = await claimScreen(body?.code, { call });
      if (!r) {
        // A flat delay, so guessing codes is slow.
        await new Promise((res) => setTimeout(res, 700));
        return json(404, { error: 'That code doesn’t work. Codes last 10 minutes and work once: make a new one.' });
      }
      console.info(`[screens] paired a screen for household ${r.household}`);
      return json(200, { token: r.token, name: r.name });
    } catch (e) {
      console.error('[screens] claim failed:', e);
      return json(502, { error: 'Couldn’t set up the screen. Try again in a minute.' });
    }
  }

  if (req.method === 'DELETE' && context.params?.id) {
    const { user } = await hiveSession(req);
    if (!user) return json(401, { error: 'Sign in to Hive first' });
    try {
      const ok = await removeScreen(user, context.params.id, { call });
      return ok ? json(200, { ok: true }) : json(403, { error: 'Only the household’s owner can remove its screens' });
    } catch (e) {
      console.error('[screens] remove failed:', e);
      return json(502, { error: 'Couldn’t remove the screen. Try again in a minute.' });
    }
  }

  return json(405, { error: 'Not allowed' });
};
