/**
 * POST /api/auth/legacy  { app, idToken }   (Authorization: Bearer <Supabase access token>)
 *   → { ok: true, legacyId }
 *
 * "That old Firebase account was mine." An app that moved to Supabase signs
 * in to its old Firebase project in the page (with the person's own old
 * password or Google), and sends the ID token here. Hive checks it with
 * Google's keys and records old id → this person in core.legacy_ids, which
 * the app's database functions trust to swap old ids for new ones (for
 * example, so friends and shared things follow someone over).
 *
 * An old account belongs to one person: once recorded, nobody else can claim it.
 *
 * Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (as carry-over).
 */
import { verifyFirebaseIdToken } from '../lib/firebaseIdToken.mjs';
import { verifySupabaseToken } from '../lib/supabaseToken.mjs';
import { env, json, isAppOrigin } from '../lib/shared.mjs';

export const config = { path: '/api/auth/legacy' };

/** Apps whose old Firebase accounts can be claimed, and their projects. */
export const LEGACY_PROJECTS = {
  alcohol: 'alctracker-b6c8a',
  wander: 'wander-f10b1',
  aerologger: 'aerologger-ec6a6',
  sidequest: 'sidequest-42196',
  journal: 'journal-together-9234f',
  ourden: 'ourden',
  stimultrack: 'caffeine-tracker-bcd4a',
  znt: 'znt-manager',
  learnleaf: 'learnleaf-organizer',
  kitchenhub: 'mykitchenhub-db665',
};

const cors = (req) => {
  const o = req.headers.get('origin');
  return isAppOrigin(o) ? { 'access-control-allow-origin': o, vary: 'origin' } : {};
};

export async function claim({ app, idToken, accessToken }, { verifyOld = verifyFirebaseIdToken, verifyNew = verifySupabaseToken, db }) {
  const projectId = LEGACY_PROJECTS[app];
  if (!projectId) return { status: 400, body: { ok: false, error: 'Unknown app' } };
  let person, old;
  try { person = await verifyNew(accessToken); } catch { return { status: 401, body: { ok: false, error: 'Sign in first.' } }; }
  try { old = await verifyOld(idToken, { projectId }); } catch { return { status: 401, body: { ok: false, error: 'That old sign-in did not check out.' } }; }
  await db.insert({ app, legacy_id: old.uid, user_id: person.uid });
  const owner = await db.owner(app, old.uid);
  if (owner !== person.uid) return { status: 409, body: { ok: false, error: 'That old account already belongs to someone else.' } };
  return { status: 200, body: { ok: true, legacyId: old.uid } };
}

function supabaseDb(url, key) {
  const headers = { apikey: key, 'content-type': 'application/json', 'accept-profile': 'core', 'content-profile': 'core' };
  return {
    async insert(row) {
      const r = await fetch(`${url}/rest/v1/legacy_ids?on_conflict=app,legacy_id`, {
        method: 'POST', headers: { ...headers, prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(row),
      });
      if (!r.ok) throw new Error(`Supabase answered ${r.status}: ${await r.text()}`);
    },
    async owner(app, legacyId) {
      const r = await fetch(`${url}/rest/v1/legacy_ids?app=eq.${encodeURIComponent(app)}&legacy_id=eq.${encodeURIComponent(legacyId)}&select=user_id`, { headers });
      if (!r.ok) throw new Error(`Supabase answered ${r.status}`);
      return (await r.json())[0]?.user_id ?? null;
    },
  };
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors(req), 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '86400' } });
  }
  let res;
  if (req.method !== 'POST') res = json(405, { error: 'POST only' });
  else {
    const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) res = json(503, { ok: false, error: 'Accounts are not set up here yet.' });
    else {
      try {
        const body = await req.json().catch(() => ({}));
        const accessToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        const r = await claim({ app: body.app, idToken: body.idToken, accessToken }, { db: supabaseDb(url, key) });
        res = json(r.status, r.body);
      } catch (e) {
        console.error('[legacy] failed:', e);
        res = json(500, { ok: false, error: 'Could not record that right now.' });
      }
    }
  }
  for (const [k, v] of Object.entries(cors(req))) res.headers.set(k, v);
  return res;
};
