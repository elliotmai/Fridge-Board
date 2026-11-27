/*
 * GET /api/hive/hop?app=<id>&return=<url on that app>
 *
 * "Sign in once" for an app on its own domain (aero-logger.com, the
 * netlify.app ones), which can't read Hive's shared sign-in cookie. Signed
 * out there, the app sends the browser here for a moment, top level:
 *
 *   - Hive's session cookie (hive-auth, on .flyingdoublemranch.com) comes
 *     along, since browsers send SameSite=Lax cookies on a top-level visit.
 *   - Signed in to Hive with a confirmed email: straight back to `return`
 *     with `#hive-pass=<a pass made for that app>`, which the app trades for
 *     its own sign-in, exactly like a pass from inside Hive's frame.
 *   - Not signed in (or anything wrong): straight back with `#hive-pass=`
 *     (empty), and the app shows its own sign-in as before.
 *
 * Only redirects, never a page, so with no Hive session it's a blink.
 * `return` must be on the app's own address from Hive's catalog, so a pass
 * only ever lands where it was made for; it's in the fragment, which never
 * reaches a server, and it lasts two minutes.
 *
 * An expired access token is refreshed with the refresh token in the cookie
 * and the new session written back, as Hive's own page would.
 */
import { createServerClient } from '@supabase/ssr';
import { CATALOG } from '../../src/config/catalog.js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, sessionCookieOptions } from '../../src/config/supabase.js';
import { signPass } from '../lib/hiveAssertion.mjs';
import { env } from '../lib/shared.mjs';
import { verifySupabaseToken } from '../lib/supabaseToken.mjs';
import { passApps } from './hive-pass.mjs';
import { admin } from '../lib/household.mjs';
import { isScreen, screenPass, withMembers } from '../lib/screens.mjs';

export const config = { path: '/api/hive/hop' };

const HIVE_HOST = 'hive.flyingdoublemranch.com';

/** `return` when it's on `app`'s own address (https, same origin as its catalog URL); else null. */
export function safeReturn(app, raw) {
  if (!passApps().includes(app) || typeof raw !== 'string') return null;
  let want, url;
  try { want = new URL(CATALOG[app].url).origin; url = new URL(raw); } catch { return null; }
  if (url.origin !== want || url.protocol !== 'https:') return null;
  url.hash = '';
  return url;
}

const back = (url, pass, cookies = []) => {
  const to = new URL(url);
  to.hash = `hive-pass=${pass ? encodeURIComponent(pass) : ''}`;
  const headers = new Headers({ location: to.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
};

export function parseCookies(header = '') {
  return header.split(/;\s*/).filter(Boolean).map((p) => {
    const i = p.indexOf('=');
    return i < 0 ? { name: p, value: '' } : { name: p.slice(0, i), value: decodeURIComponent(p.slice(i + 1)) };
  });
}

const serialize = (name, value, o = {}) => [
  `${name}=${encodeURIComponent(value)}`,
  o.path && `Path=${o.path}`, o.domain && `Domain=${o.domain}`,
  o.maxAge !== undefined && `Max-Age=${o.maxAge}`, o.expires && `Expires=${new Date(o.expires).toUTCString()}`,
  o.sameSite && `SameSite=${o.sameSite[0].toUpperCase()}${o.sameSite.slice(1)}`, o.secure && 'Secure', o.httpOnly && 'HttpOnly',
].filter(Boolean).join('; ');

/** The signed-in Hive user from the request's cookie, plus any refreshed cookies to send back. */
export async function userFromCookie(req, { verify = verifySupabaseToken, client = createServerClient } = {}) {
  const jar = parseCookies(req.headers.get('cookie') || '');
  const options = sessionCookieOptions(HIVE_HOST);
  if (!jar.some((c) => c.name === options.name || c.name.startsWith(`${options.name}.`))) return { user: null, cookies: [] };
  const cookies = [];
  const sb = client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: options,
    cookies: {
      getAll: () => jar,
      setAll: (list) => { for (const { name, value, options: o } of list) cookies.push(serialize(name, value, { ...options, ...o })); },
    },
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
  });
  const { data } = await sb.auth.getSession(); // refreshes an expired session and hands back the new cookies
  const token = data?.session?.access_token;
  if (!token) return { user: null, cookies };
  return { user: await verify(token), cookies };
}

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const app = q.get('app') || '';
  const to = safeReturn(app, q.get('return'));
  if (!to) return new Response('Unknown app or return address', { status: 400, headers: { 'content-type': 'text/plain' } });
  const key = env('HIVE_SIGNING_KEY');
  if (!key) return back(to, null);
  let user = null, cookies = [];
  try { ({ user, cookies } = await userFromCookie(req)); } catch (e) { console.warn('[hive-hop] no session:', e.message); }
  if (isScreen(user)) {
    let pass = null;
    try { pass = screenPass(await withMembers(user, admin()), app, key); } catch (e) { if (!e.screenRefused) console.warn('[hive-hop] screen pass failed:', e.message); }
    return back(to, pass, cookies);
  }
  if (!user?.email || !user.email_verified) return back(to, null, cookies);
  return back(to, signPass(user, app, key), cookies);
};
