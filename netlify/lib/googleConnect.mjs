/*
 * Connecting Google Calendar & Tasks, made in Hive.
 *
 * Hive's Connect button signs in with Google through Supabase, asking for
 * Calendar (read only) and Tasks, offline. Supabase hands the browser
 * Google's refresh token once, on the way back; the browser posts it here
 * straight away, and this keeps it where Our Den keeps every Google link:
 * Supabase `den.google_tokens` (user_id, refresh_token, updated_at), the same
 * row and the same upsert as Our Den's netlify/lib/googleLink.mjs. That table
 * has no grants for signed-in people, so only a server with the service key
 * reads or writes it. Our Den mints access tokens from that row for its own
 * pages and for Hive's board (/api/board/google): one connection for all.
 *
 * Supabase's Google sign-in and Our Den use the same Google OAuth client, so
 * Our Den's GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET refresh these tokens. Hive
 * has no Google secret: before keeping a token it asks Google's tokeninfo
 * whether the access token from the same sign-in was issued to that client,
 * with both scopes.
 *
 * Environment (Netlify → Project configuration → Environment variables):
 *   SUPABASE_SERVICE_ROLE_KEY   Supabase secret key. Secret. (Already used by carry-over.)
 *   Optional: SUPABASE_URL, GOOGLE_CLIENT_ID (defaults in src/config).
 *
 * Tokens are never logged. Every outside call takes `f` (fetch) for the tests.
 */
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from '../../src/config/google.js';
import { SUPABASE_URL } from '../../src/config/supabase.js';

const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
const env = (k, d = '') => process.env[k] || d;

export class ConnectError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Google's tokens are short printable strings; anything else is refused before it goes anywhere. */
const plausible = (t) => typeof t === 'string' && t.length >= 20 && t.length <= 4096 && /^[\w\-./~+=]+$/.test(t);

/** The two tokens from the request body, or a 400. */
export function tokensFrom(body) {
  const refreshToken = body?.refreshToken, accessToken = body?.accessToken;
  if (!plausible(refreshToken)) throw new ConnectError(400, 'Google didn’t send a refresh token. Try connecting again.');
  if (!plausible(accessToken)) throw new ConnectError(400, 'Google didn’t send an access token. Try connecting again.');
  return { refreshToken, accessToken };
}

/** Throws unless Google says this access token is our client's, with Calendar (read only) and Tasks. */
export async function checkGrant(accessToken, { f = fetch, clientId = env('GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID) } = {}) {
  let res;
  try {
    res = await f(TOKENINFO, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: accessToken }).toString(),
      signal: AbortSignal.timeout(8000),
    });
  } catch { throw new ConnectError(502, 'Could not reach Google'); }
  const info = await res.json().catch(() => ({}));
  if (!res.ok) throw new ConnectError(400, 'Google says that sign-in has expired. Try connecting again.');
  if (info.aud !== clientId && info.azp !== clientId) throw new ConnectError(400, 'That Google sign-in wasn’t for Hive.');
  const granted = new Set(String(info.scope || '').split(/\s+/));
  const missing = GOOGLE_SCOPES.split(' ').filter((s) => !granted.has(s));
  if (missing.length) throw new ConnectError(400, 'Allow both Calendar and Tasks on Google’s screen, then try again.');
  return { scopes: [...granted] };
}

function serviceHeaders(extra = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new ConnectError(503, 'Set SUPABASE_SERVICE_ROLE_KEY on Hive');
  // An sb_secret_ key goes in apikey alone; an old JWT service key also as the bearer.
  return { apikey: key, ...(key.startsWith('sb_') ? {} : { authorization: `Bearer ${key}` }), 'accept-profile': 'den', 'content-profile': 'den', 'content-type': 'application/json', ...extra };
}
const tokensUrl = () => `${env('SUPABASE_URL', SUPABASE_URL).replace(/\/$/, '')}/rest/v1/google_tokens`;

/** Upsert this person's refresh token, exactly as Our Den's link does. */
export async function storeRefreshToken(userId, refreshToken, { f = fetch, now = new Date() } = {}) {
  const res = await f(`${tokensUrl()}?on_conflict=user_id`, {
    method: 'POST',
    headers: serviceHeaders({ prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ user_id: userId, refresh_token: refreshToken, updated_at: now.toISOString() }),
  });
  if (!res.ok) throw new ConnectError(502, `Supabase answered ${res.status}`);
}

/** Whether this person has a Google link (never returns the token). */
export async function isConnected(userId, { f = fetch } = {}) {
  const res = await f(`${tokensUrl()}?user_id=eq.${encodeURIComponent(userId)}&select=user_id`, { headers: serviceHeaders() });
  if (!res.ok) throw new ConnectError(502, `Supabase answered ${res.status}`);
  return (await res.json()).length > 0;
}

/**
 * Whether this person's link works, asked of Our Den, which holds the Google
 * secret: it refreshes the token and reads from Calendar and from Tasks
 * (Our Den's linkStatus). `headers` carries a Hive pass for Our Den. When Our
 * Den can't be asked, falls back to whether a link is stored, marked
 * `checked: false`.
 */
export async function linkStatus(userId, headers, { f = fetch, ourden = 'https://den.flyingdoublemranch.com' } = {}) {
  try {
    const res = await f(`${ourden}/api/board/google/status`, { headers, signal: AbortSignal.timeout(10000) });
    const body = await res.json().catch(() => null);
    if (res.ok && typeof body?.connected === 'boolean') return { ...body, checked: true };
    console.warn('[google-connect] Our Den status answered', res.status, body?.error || '');
  } catch (e) { console.warn('[google-connect] Our Den status failed:', e?.message); }
  const connected = await isConnected(userId, { f });
  return { connected, checked: false, ...(connected ? {} : { reason: 'Google isn’t connected yet' }) };
}

/** The whole POST: check the grant with Google, then keep the refresh token. */
export async function connect(userId, body, { f = fetch, clientId } = {}) {
  const { refreshToken, accessToken } = tokensFrom(body);
  await checkGrant(accessToken, { f, ...(clientId ? { clientId } : {}) });
  await storeRefreshToken(userId, refreshToken, { f });
  return { connected: true };
}
