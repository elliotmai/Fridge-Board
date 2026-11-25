/*
 * Hive's Google Calendar & Tasks connection (see netlify/lib/googleConnect.mjs).
 *
 *   GET  /api/google/connect                               → { connected, working, calendar, tasks, reason, checked }
 *        checked with Google by Our Den (a refresh, then a read from each); see linkStatus
 *   POST /api/google/connect  { refreshToken, accessToken } → { connected: true }
 *
 * Signed in with your Hive session: `Authorization: Bearer <Supabase access token>`.
 * Called by Hive's own page only (src/hive/googleConnect.js), so no CORS.
 */
import { ConnectError, connect, linkStatus } from '../lib/googleConnect.mjs';
import { passHeader } from '../lib/hiveUser.mjs';
import { json, urls } from '../lib/shared.mjs';
import { verifySupabaseToken } from '../lib/supabaseToken.mjs';

export const config = { path: '/api/google/connect' };

export async function handle(req, { verify = verifySupabaseToken, f = fetch } = {}) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(405, { error: 'Not allowed' });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let user;
  try { user = await verify(token); } catch { return json(401, { error: 'Sign in to Hive first.' }); }
  try {
    if (req.method === 'GET') {
      let headers = {};
      try { headers = passHeader(user, 'ourden'); } catch { /* unconfirmed or no signing key: Our Den will refuse, and we fall back */ }
      return json(200, await linkStatus(user.uid, headers, { f, ourden: urls.ourden() }));
    }
    const body = await req.json().catch(() => null);
    return json(200, await connect(user.uid, body, { f }));
  } catch (e) {
    if (e instanceof ConnectError) return json(e.status, { error: e.message });
    console.error('[google-connect]', e?.message); // never the request body
    return json(502, { error: 'Could not save the Google connection' });
  }
}

export default (req) => handle(req);
