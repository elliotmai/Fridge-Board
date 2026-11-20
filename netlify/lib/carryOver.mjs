/**
 * Moves a password from an app's old Firebase project into Supabase, the
 * first time its owner signs in after the move. Nobody has to reset anything.
 *
 * The page tries Supabase first. Only when Supabase says "wrong password"
 * does it ask this, with the same email and password:
 *
 *   1. Ask each old Firebase project, through its public sign-in API, whether
 *      that email and password are right. The web API keys below are the
 *      public ones every app ships in its page.
 *   2. If one says yes, and the Supabase account is still waiting for its
 *      password (created by an import, marked `app_metadata.legacy`), give
 *      it this password. If there is no Supabase account yet, make one.
 *   3. Record which old account became which person (core.legacy_ids).
 *
 * An account that already has its own Supabase password is never touched:
 * knowing someone's old app password must not let anyone take over the
 * account they moved to.
 */

/** Old Firebase projects with email/password sign-in, and their public web keys. */
export const LEGACY_APPS = {
  learnleaf: { project: 'learnleaf-organizer', key: 'AIzaSyA8rr1TEUUZ9b_PqR475mszkoC0aMoHeTE' },
  stimultrack: { project: 'caffeine-tracker-bcd4a', key: 'AIzaSyArUnjG1BLqTbHCQqWruqLZDwy-aoMxgR4' },
  journal: { project: 'journal-together-9234f', key: 'AIzaSyAIJihKqOI3BJjSU7AZmBElHcvDJjeAIaQ' },
  alcohol: { project: 'alctracker-b6c8a', key: 'AIzaSyA-PPCs494aPCHuPEE6HIs2GgeCdHjviWw' },
  aerologger: { project: 'aerologger-ec6a6', key: 'AIzaSyApq0Wj12n2Gn8tjD0HJ-MsR3ON8hbh7QQ' },
  // KitchenHub, Wander and Our Den read their key from build settings; it is
  // added here (from the live page) when each one moves.
};

const IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

/** Which old projects accept this email and password: [{ app, uid, email }]. */
export async function checkLegacy(email, password, { apps = LEGACY_APPS, fetch: f = fetch } = {}) {
  const tries = Object.entries(apps).map(async ([app, { key }]) => {
    try {
      const r = await f(`${IDENTITY}?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d.localId ? { app, uid: d.localId, email: String(d.email || email).toLowerCase() } : null;
    } catch {
      return null; // one project being down shouldn't stop the others
    }
  });
  return (await Promise.all(tries)).filter(Boolean);
}

/** Supabase's admin and data APIs, as the service role. */
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
    linkLegacy: (rows) => call('/rest/v1/legacy_ids?on_conflict=app,legacy_id', {
      method: 'POST', headers: { ...core, prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows),
    }),
  };
}

/**
 * The whole step. Returns { ok: true, created } or { ok: false, reason }.
 * `reason` is for logs; the page only ever says "wrong email or password".
 */
export async function carryOver(email, password, { admin, check = checkLegacy } = {}) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !password) return { ok: false, reason: 'missing' };
  const hits = await check(email, password);
  if (!hits.length) return { ok: false, reason: 'no old app knows this password' };

  let id = await admin.userIdByEmail(email);
  let created = false;
  if (id) {
    const u = await admin.getUser(id);
    if (u.app_metadata?.legacy !== true) return { ok: false, reason: 'account already has its own password' };
    await admin.setPassword(id, password, u.app_metadata);
  } else {
    id = (await admin.createUser(email, password)).id;
    created = true;
  }
  await admin.linkLegacy(hits.map((h) => ({ app: h.app, legacy_id: h.uid, user_id: id })));
  return { ok: true, created };
}
