/**
 * Moves people from the apps' old Firebase projects into Supabase on their
 * first sign-ins after the move. Nobody has to reset anything.
 *
 * The page tries Supabase first. Only when Supabase says "wrong password"
 * does it ask this, with the same email and password:
 *
 *   1. Ask each old Firebase project, through its public sign-in API, whether
 *      that email and password are right, and whether that project ever
 *      confirmed the email (many old apps never asked).
 *   2. Then, by what Supabase already has:
 *      - No account yet: make one with this password if an old project had
 *        confirmed the email; otherwise email a link that makes the account.
 *      - An account waiting for its password (made by an import): give it
 *        this password if the email was confirmed; otherwise email a link.
 *      - An account with its own password (people used different passwords
 *        in different apps): leave the password alone and sign them in with
 *        a one-time link, returned to the page if an old project had
 *        confirmed the email, or emailed to them otherwise.
 *   3. Record which old account became which person (core.legacy_ids).
 *
 * The rule throughout: an old password alone only ever signs someone in when
 * the old app had confirmed they own the email. Otherwise the email decides,
 * so nobody can claim an address by having signed up with it somewhere.
 */

/** Old Firebase projects with email/password sign-in, and their public web keys. */
export const LEGACY_APPS = {
  hive: { project: 'hive-aa9c0', key: 'AIzaSyBi5xLBJVPpGQj2qoNc7tPHB-HE3AIDBAE' }, // Hive's own accounts before Supabase
  learnleaf: { project: 'learnleaf-organizer', key: 'AIzaSyA8rr1TEUUZ9b_PqR475mszkoC0aMoHeTE' },
  stimultrack: { project: 'caffeine-tracker-bcd4a', key: 'AIzaSyArUnjG1BLqTbHCQqWruqLZDwy-aoMxgR4' },
  journal: { project: 'journal-together-9234f', key: 'AIzaSyAIJihKqOI3BJjSU7AZmBElHcvDJjeAIaQ' },
  alcohol: { project: 'alctracker-b6c8a', key: 'AIzaSyA-PPCs494aPCHuPEE6HIs2GgeCdHjviWw' },
  aerologger: { project: 'aerologger-ec6a6', key: 'AIzaSyApq0Wj12n2Gn8tjD0HJ-MsR3ON8hbh7QQ' },
  wander: { project: 'wander-f10b1', key: 'AIzaSyC1KnocB9ogDmH27IQbjDQe-exvGa8wzsQ' },
  ourden: { project: 'ourden', key: 'AIzaSyBGb7feMWpPLvrToU7F-QAZOmNrta4KtdU' },
  kitchenhub: { project: 'mykitchenhub-db665', key: 'AIzaSyBFjXetA5vgZBLqpUHJ4OiXtXzfJ5fnE2U' },
};

const IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts';

/** Which old projects accept this email and password: [{ app, uid, email, verified }]. */
export async function checkLegacy(email, password, { apps = LEGACY_APPS, fetch: f = fetch } = {}) {
  const post = (path, key, body) => f(`${IDENTITY}:${path}?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const tries = Object.entries(apps).map(async ([app, { key }]) => {
    try {
      const r = await post('signInWithPassword', key, { email, password, returnSecureToken: true });
      if (!r.ok) return null;
      const d = await r.json();
      if (!d.localId) return null;
      let verified = false;
      try {
        const l = await post('lookup', key, { idToken: d.idToken });
        verified = l.ok && (await l.json()).users?.[0]?.emailVerified === true;
      } catch { /* unknown counts as not confirmed */ }
      return { app, uid: d.localId, email: String(d.email || email).toLowerCase(), verified };
    } catch {
      return null; // one project being down shouldn't stop the others
    }
  });
  return (await Promise.all(tries)).filter(Boolean);
}

/** Supabase's admin, auth and data APIs, as the service role. */
export function supabaseAdmin(url, serviceKey, f = fetch) {
  // New-style secret keys (sb_secret_...) go in `apikey` only; Supabase turns
  // them into the service role itself. Old JWT keys go in both headers.
  const headers = { apikey: serviceKey, 'content-type': 'application/json', ...(serviceKey.startsWith('sb_') ? {} : { authorization: `Bearer ${serviceKey}` }) };
  const call = async (path, init = {}) => {
    const r = await f(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } });
    const body = await r.text();
    const data = body ? JSON.parse(body) : null;
    if (!r.ok) throw Object.assign(new Error(data?.msg || data?.message || `Supabase answered ${r.status}`), { status: r.status });
    return data;
  };
  const core = { 'accept-profile': 'core', 'content-profile': 'core' };
  return {
    async userIdByEmail(email) {
      const rows = await call(`/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`, { headers: core });
      return rows[0]?.id || null;
    },
    getUser: (id) => call(`/auth/v1/admin/users/${id}`),
    createUser: (email, password) => call('/auth/v1/admin/users', {
      method: 'POST', body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { carried_over: true } }),
    }),
    setPassword: (id, password, appMeta) => call(`/auth/v1/admin/users/${id}`, {
      method: 'PUT', body: JSON.stringify({ password, app_metadata: { ...appMeta, legacy: false, carried_over: true } }),
    }),
    /** Sends Supabase's confirmation email for an account that isn't confirmed yet. */
    sendConfirmation: (email, redirectTo) => call(`/auth/v1/resend${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ''}`, {
      method: 'POST', body: JSON.stringify({ type: 'signup', email }),
    }),
    /** Emails a one-time sign-in link; `create` makes the account when following it. */
    sendSignInLink: (email, redirectTo, { create = false } = {}) => call(`/auth/v1/otp${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ''}`, {
      method: 'POST', body: JSON.stringify({ email, create_user: create }),
    }),
    /** A one-time sign-in token for the page (verifyOtp), without sending anything. */
    async signInToken(email) {
      const d = await call('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) });
      return d?.hashed_token || d?.properties?.hashed_token;
    },
    linkLegacy: (rows) => call('/rest/v1/legacy_ids?on_conflict=app,legacy_id', {
      method: 'POST', headers: { ...core, prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows),
    }),
  };
}

/**
 * The whole step. Returns:
 *   { ok: true, how: 'password' }   sign in with the same password now
 *   { ok: false, reason }           reason is for logs; the page says "wrong email or password"
 *
 * One account per email, one password (the owner's call, 2026-11-25):
 * everyone's old accounts were combined by email into one Hive account ahead
 * of time (scripts/bringover/combine-accounts.mjs, app_metadata.legacy), with
 * their data from every app already attached. The first old password that any
 * of their old apps accepts becomes their Hive password; from then on that is
 * the only password, everywhere. An account that already has its own Hive
 * password is never touched here. Whether an old app had confirmed the email
 * no longer matters.
 */
export async function carryOver(email, password, { admin, check = checkLegacy } = {}) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !password) return { ok: false, reason: 'missing' };

  let id = await admin.userIdByEmail(email);
  const u = id ? await admin.getUser(id) : null;
  if (u && u.app_metadata?.legacy !== true) return { ok: false, reason: 'has its own Hive password' };

  const hits = await check(email, password);
  if (!hits.length) return { ok: false, reason: 'no old app knows this password' };

  if (!id) id = (await admin.createUser(email, password)).id;
  else await admin.setPassword(id, password, u.app_metadata);
  await admin.linkLegacy(hits.map((h) => ({ app: h.app, legacy_id: h.uid, user_id: id })));
  return { ok: true, how: 'password' };
}
