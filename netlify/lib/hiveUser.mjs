/*
 * The signed-in Hive user behind a request, if any: the page sends its Hive
 * (Supabase) access token as `Authorization: Bearer <token>` (src/data/api.js).
 * Null when nobody is signed in or the token is bad.
 */
import { signPass } from './hiveAssertion.mjs';
import { env } from './shared.mjs';
import { verifySupabaseToken } from './supabaseToken.mjs';

export async function hiveUser(req, opts) {
  return (await hiveSession(req, opts)).user;
}

/**
 * { user, expired }: the signed-in Hive user (or null), and whether the page
 * sent a token that had expired, so the board can tell it to refresh rather
 * than treat the person as signed out.
 */
export async function hiveSession(req, { verify = verifySupabaseToken } = {}) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { user: null, expired: false };
  try { return { user: await verify(token), expired: false }; } catch (e) {
    console.warn('[hive] ignored a bad sign-in token:', e.message);
    return { user: null, expired: e.message === 'expired' };
  }
}

/**
 * `Authorization` header carrying a pass for `app`, for calling that app as
 * this person. Throws a readable reason when that can't be done.
 */
export function passHeader(user, app) {
  if (!user) throw Object.assign(new Error('Sign in to Hive to see this'), { unconfigured: true });
  if (!user.email || !user.email_verified) throw Object.assign(new Error('Confirm your Hive email to see this'), { unconfigured: true });
  const key = env('HIVE_SIGNING_KEY');
  if (!key) throw Object.assign(new Error('Hive sign-in is not set up'), { unconfigured: true });
  return { authorization: `Hive ${signPass(user, app, key)}` };
}

/**
 * How to call `app` for this request: as the signed-in Hive user with a pass
 * when there is one, else with the old site-wide token in `tokenEnv` (kept so
 * the board works while you move off it). Throws a readable reason with
 * `unconfigured` when neither is available.
 */
export function appAuth(user, app, tokenEnv) {
  if (user?.email_verified && env('HIVE_SIGNING_KEY')) return passHeader(user, app);
  const token = tokenEnv && !user?.keyless && env(tokenEnv);
  if (token) return { authorization: `Bearer ${token}` };
  throw Object.assign(new Error(user ? 'Confirm your Hive email to see this' : 'Sign in to Hive to see this'), { unconfigured: true });
}

/**
 * Call `app` as this person, falling back to the old token if the app refuses
 * the pass (401/403), e.g. because its pass support isn't deployed yet.
 * `run(headers)` makes the call; it may throw an error with `.status` or
 * return a Response. Without a fallback token, the refusal stands.
 */
export async function asUser(user, app, tokenEnv, run) {
  const headers = appAuth(user, app, tokenEnv);
  // `keyless`: let in as a household member without the board key (boardGate),
  // so never with the site-wide token.
  const token = tokenEnv && !user?.keyless && env(tokenEnv);
  const retry = /^Hive /.test(headers.authorization) && token ? () => run({ authorization: `Bearer ${token}` }) : null;
  // 400 too: an app that has not learned passes yet reads "Hive …" as a malformed token.
  const refused = (status) => status === 400 || status === 401 || status === 403;
  try {
    const out = await run(headers);
    if (retry && out instanceof Response && refused(out.status)) {
      console.warn(`[hive] ${app} refused a pass; used ${tokenEnv} instead`);
      return retry();
    }
    return out;
  } catch (e) {
    if (retry && refused(e.status)) {
      console.warn(`[hive] ${app} refused a pass; used ${tokenEnv} instead`);
      return retry();
    }
    throw e;
  }
}
