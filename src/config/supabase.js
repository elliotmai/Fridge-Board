/**
 * Hive's Supabase project: one sign-in and one database for every app
 * (docs/supabase-migration-plan.md). Both values are public by design; the
 * database's row-level security is what protects the data.
 */
export const SUPABASE_URL = 'https://fcjiummxpacwriwopcho.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fZo1FUg_j4O1EHH-W2Jr1A_4P8W3o2S';

/**
 * One sign-in for every app under the shared domain: the Supabase session is
 * kept in a cookie for the whole domain (not in one address's own storage),
 * so hive., stimul., learnleaf. and the rest all see the same signed-in
 * person. Elsewhere (localhost, *.netlify.app) it falls back to this address.
 */
export const SHARED_DOMAIN = 'flyingdoublemranch.com';
export const SESSION_COOKIE = 'hive-auth';

export function sessionCookieOptions(host = typeof location === 'undefined' ? '' : location.hostname) {
  const shared = host === SHARED_DOMAIN || host.endsWith(`.${SHARED_DOMAIN}`);
  return {
    name: SESSION_COOKIE,
    path: '/',
    sameSite: 'lax',
    secure: typeof location === 'undefined' || location.protocol === 'https:',
    maxAge: 60 * 60 * 24 * 400, // as long as browsers allow; Supabase still expires the session itself
    ...(shared ? { domain: `.${SHARED_DOMAIN}` } : {}),
  };
}
