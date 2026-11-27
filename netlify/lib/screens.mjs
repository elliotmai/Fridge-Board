/*
 * Household screens: a device (the fridge tablet) signed in as the household
 * rather than as a person (supabase/migrations/20261127000000_household_screens.sql).
 *
 * A screen is its own Supabase account, made here when the tablet redeems an
 * owner's pairing code. Its access token carries app_metadata.hive_screen
 * (the household id), so every Hive server knows it is not a person
 * (verifySupabaseToken → `screen`).
 *
 * What a screen may be passed to (screenPassHeader):
 *   - household apps whose data is the household's: KitchenHub, as the screen
 *     account itself (KitchenHub finds the household from it);
 *   - GalaxyFarm, with a *household pass*: no email, but the household's
 *     people's confirmed emails, so GalaxyFarm can find the farm (an owner's)
 *     and act as the household there;
 *   - nothing personal. Calendars, tasks, trips and drinks are each person's,
 *     and a screen never gets a pass that an app would read as a person (an
 *     app that finds accounts by email would otherwise make one for it).
 */
import { createPrivateKey, sign } from 'node:crypto';
import { ISSUER, PASS_SECONDS, signPass } from './hiveAssertion.mjs';
import { env } from './shared.mjs';

/** Household apps a screen opens as the household, and how. */
export const SCREEN_APPS = { kitchenhub: 'account', galaxyfarm: 'household' };

/** Where screen accounts' (never used) emails live: a subdomain nobody receives mail at. */
export const SCREEN_EMAIL_DOMAIN = 'screens.hive.flyingdoublemranch.com';

export const isScreen = (user) => Boolean(user?.screen);

/** Pairing codes as people type them: any case, spaces or dashes. */
export const normaliseCode = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const looksLikeCode = (raw) => /^[A-HJ-NP-Z2-9]{8}$/.test(normaliseCode(raw));

const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/**
 * A household pass for `app`: signed like any pass (same key, two minutes,
 * one app), but it names a household, not a person. `email` is null and
 * `email_verified` false, so an app that hasn't learned household passes
 * refuses it as it would a person with no confirmed email.
 *
 *   { iss, aud, sub: 'household:<id>', kind: 'household', household, screen,
 *     name, members: [confirmed emails, owners first], email: null,
 *     email_verified: false, iat, exp }
 */
export function signHouseholdPass(screen, members, app, signingKey, { now = Date.now() } = {}) {
  if (!screen?.screen || !screen.uid) throw new Error('not a household screen');
  if (!app || typeof app !== 'string') throw new Error('no app');
  const iat = Math.floor(now / 1000);
  const head = `${enc({ alg: 'EdDSA', typ: 'JWT' })}.${enc({
    iss: ISSUER, aud: app, sub: `household:${screen.screen}`, kind: 'household',
    household: screen.screen, screen: screen.uid, name: screen.name || 'Household screen',
    members: (members || []).map((m) => String(m).toLowerCase()).slice(0, 20),
    email: null, email_verified: false, iat, exp: iat + PASS_SECONDS,
  })}`;
  const key = createPrivateKey({ key: Buffer.from(String(signingKey).trim(), 'base64'), format: 'der', type: 'pkcs8' });
  return `${head}.${sign(null, Buffer.from(head), key).toString('base64url')}`;
}

const refuse = (message) => Object.assign(new Error(message), { unconfigured: true, screenRefused: true });

/**
 * The pass a screen may carry to `app`, or a readable refusal.
 * `screen.members` must be loaded first for a household pass (withMembers).
 */
export function screenPass(screen, app, signingKey) {
  const how = SCREEN_APPS[app];
  if (how === 'account') return signPass({ ...screen, email_verified: true }, app, signingKey);
  if (how === 'household') {
    if (!screen.members?.length) throw refuse('Nobody in this household has a confirmed email yet');
    return signHouseholdPass(screen, screen.members, app, signingKey);
  }
  throw refuse('Personal on the household screen: each person turns this on for themselves');
}

/**
 * The household's people's confirmed emails (owners first), via the service
 * role; none once `screenId` is no longer that household's screen.
 */
export async function householdEmails(hid, a, screenId) {
  if (!a || !hid) return [];
  if (screenId) {
    const r = await fetch(`${a.url}/rest/v1/household_members?select=role&household_id=eq.${encodeURIComponent(hid)}&user_id=eq.${encodeURIComponent(screenId)}&role=eq.screen`, {
      headers: { ...a.headers, 'accept-profile': 'core' }, signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error(`screen lookup answered ${r.status}`);
    if (!(await r.json()).length) return [];
  }
  const res = await fetch(`${a.url}/rest/v1/rpc/household_people_emails`, {
    method: 'POST',
    headers: { ...a.headers, 'content-type': 'application/json', 'content-profile': 'core', 'accept-profile': 'core' },
    body: JSON.stringify({ hid }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`household emails answered ${res.status}`);
  return (await res.json()).map((r) => r.email).filter(Boolean);
}

/** The screen with its household's emails attached (members), for household passes. */
export async function withMembers(user, a, emails = householdEmails) {
  if (!isScreen(user) || user.members) return user;
  try { return { ...user, members: await emails(user.screen, a, user.uid) }; } catch (e) {
    console.warn('[screens] household emails failed:', e.message);
    return { ...user, members: [] };
  }
}

/* ------------------------------------------------------------- pairing -- */

const rpc = (call, fn, args) => call(`/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: { 'accept-profile': 'core', 'content-profile': 'core' }, body: JSON.stringify(args),
});

/**
 * Redeem a pairing code: claim it (once), make the screen's account, attach
 * it to the household, and hand back a one-time sign-in token for the page
 * (verifyOtp({ token_hash, type: 'magiclink' })). `call(path, init)` is
 * supabaseAdmin's raw call, as the service role. Returns null for a code that
 * doesn't work (wrong, used, expired, or its owner no longer owns it).
 */
export async function claimScreen(raw, { call, random = () => crypto.randomUUID() }) {
  if (!looksLikeCode(raw)) return null;
  const rows = await rpc(call, 'claim_screen_code', { raw: normaliseCode(raw) });
  const claim = Array.isArray(rows) ? rows[0] : null;
  if (!claim?.household_id) return null;
  const email = `screen-${random()}@${SCREEN_EMAIL_DOMAIN}`;
  const made = await call('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email, email_confirm: true,
      user_metadata: { display_name: claim.name },
      app_metadata: { hive_screen: claim.household_id },
    }),
  });
  const uid = made?.id || made?.user?.id;
  if (!uid) throw new Error('Supabase made no account for the screen');
  try {
    await rpc(call, 'attach_screen', { uid, hid: claim.household_id, screen_name: claim.name, made_by: claim.created_by });
  } catch (e) {
    await call(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
  const link = await call('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) });
  const token = link?.hashed_token || link?.properties?.hashed_token;
  if (!token) throw new Error('Supabase gave no sign-in token for the screen');
  return { token, name: claim.name, household: claim.household_id };
}

/**
 * An owner removes one of their household's screens: its account is deleted,
 * which ends its sign-in everywhere (membership goes with it). Returns false
 * when `screenId` isn't a screen of a household `owner` owns.
 */
export async function removeScreen(owner, screenId, { call }) {
  if (!owner?.uid || isScreen(owner) || !/^[0-9a-f-]{36}$/i.test(String(screenId || ''))) return false;
  const core = { headers: { 'accept-profile': 'core' } };
  const [screen] = await call(`/rest/v1/screens?select=household_id&user_id=eq.${screenId}`, core);
  if (!screen) return false;
  const own = await call(`/rest/v1/household_members?select=role&household_id=eq.${screen.household_id}&user_id=eq.${owner.uid}&role=eq.owner`, core);
  if (!own?.length) return false;
  await call(`/auth/v1/admin/users/${screenId}`, { method: 'DELETE' });
  return true;
}

export const signingKey = () => env('HIVE_SIGNING_KEY');
