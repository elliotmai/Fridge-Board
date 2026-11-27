/*
 * Households, read with the service role (SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY), and who may use the board's API.
 *
 * The board's API takes either the board key (the fridge tablet set up with
 * BOARD_ACCESS_KEY) or a signed-in Hive user who belongs to a household. The
 * second is what lets the owner use hive.flyingdoublemranch.com on any device
 * without typing the key there: being in the household is the stronger proof.
 */
import { hiveSession } from './hiveUser.mjs';
import { env, getJson, json, keyMatches } from './shared.mjs';
import { isScreen, withMembers } from './screens.mjs';

/** { url, headers } for the service role, or null when it isn't set up. */
export function admin() {
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), headers: { apikey: key, ...(key.startsWith('sb_') ? {} : { authorization: `Bearer ${key}` }) } };
}

/** GET from PostgREST in `schema`, as the service role. */
export async function adminRead(path, schema, a = admin()) {
  if (!a) throw Object.assign(new Error('Supabase is not set up for the board'), { unconfigured: true });
  return getJson(`${a.url}/rest/v1/${path}`, { headers: { ...a.headers, 'accept-profile': schema } });
}

/** The household this person belongs to (their first, if several), or null. */
export async function householdOf(uid, read = adminRead) {
  if (!uid) return null;
  const rows = await read(`household_members?select=household_id&user_id=eq.${encodeURIComponent(uid)}&order=joined_at&limit=1`, 'core');
  return rows[0]?.household_id || null;
}

/** Everyone in a household: [{ id, name, email, role }], as myHousehold() shows them in Hive. People only, never its screens. */
export async function householdMembers(hid, read = adminRead) {
  const m = await read(`household_members?select=user_id,role,joined_at&household_id=eq.${encodeURIComponent(hid)}&role=neq.screen&order=joined_at`, 'core');
  const ids = m.map((x) => x.user_id);
  const people = ids.length ? await read(`profiles?select=id,email,display_name&id=in.(${ids.map(encodeURIComponent).join(',')})`, 'core') : [];
  return m.map((x) => {
    const p = people.find((y) => y.id === x.user_id) || {};
    return { id: x.user_id, role: x.role, email: p.email || '', name: p.display_name || (p.email ? p.email.split('@')[0] : 'Someone') };
  });
}

/**
 * Who is asking, and may they use the board's API?
 *
 * Returns { ok: true, user, household, expired, viaKey } when the request has
 * the board key, or a signed-in Hive user in a household. Otherwise
 * { ok: false, response } with a 401 that says what's missing.
 * `expired` is true when the page sent a sign-in token that had run out, so it
 * can refresh and ask again instead of quietly being treated as signed out.
 */
export async function boardGate(req, { session = hiveSession, household = householdOf, members = (u) => withMembers(u, admin()) } = {}) {
  let { user, expired } = await session(req);
  let hid = null;
  if (user) {
    try { hid = await household(user.uid); } catch (e) { console.warn('[hive] household lookup failed:', e.message); }
  }
  // A household screen: only while it is still in its household (an owner may
  // have removed it); with its people's emails, for household passes.
  let removed = false;
  if (isScreen(user)) {
    if (hid !== user.screen) { user = null; hid = null; removed = true; } else user = await members(user);
  }
  const viaKey = keyMatches(req);
  // In through the household alone (no key), the site-wide app tokens are not
  // theirs to use: anyone can sign up and start a household, so they only
  // ever see apps as themselves (asUser skips the fallback: `keyless`).
  if (viaKey || (user && hid)) return { ok: true, user: user && !viaKey ? { ...user, keyless: true } : user, household: hid, expired, viaKey };
  const reason = removed ? 'This household screen was removed. Pair it again from Hive, Account'
    : !env('BOARD_ACCESS_KEY') && !user ? 'Set BOARD_ACCESS_KEY on the Fridge Board site'
    : user ? 'Join a household in Hive (Settings, Account) to see the board'
      : expired ? 'Your Hive sign-in expired' : 'Enter the board key';
  return { ok: false, response: json(401, { error: 'locked', reason, signedIn: !!user, expired, removed }) };
}
