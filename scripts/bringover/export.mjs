#!/usr/bin/env node
/**
 * One-time export of the apps' old Firebase data, for the quiet bringover
 * (supabase/migrations/20261124000000_quiet_bringover.sql).
 *
 *   GOOGLE_TOKEN=<OAuth access token of a project owner> node scripts/bringover/export.mjs <app> [outDir]
 *
 * Writes <outDir>/<app>.json:
 *   { accounts: [{ legacy_id, email, email_verified }],   → core.waiting_accounts
 *     data: { <old uid>: payload },                       → core.waiting_data
 *     household: [ rows ] }                               → straight into a household (ZNT)
 *
 * Each payload is exactly what that app's own browser import sends, built the
 * same way (the transforms below mirror each app’s importHistory.js),
 * so the app's own database import decides what it accepts.
 *
 * Read-only against Firebase. Dates become {"$ts": ms}, as the apps store them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN = process.env.GOOGLE_TOKEN;
const FS = 'https://firestore.googleapis.com/v1';
const IDT = 'https://identitytoolkit.googleapis.com/v1';

async function call(url, init = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...init.headers } });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await new Promise((s) => setTimeout(s, 1000 * 2 ** attempt)); continue; }
    throw new Error(`${init.method || 'GET'} ${url} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
}

/* ── Firestore REST values → the plain values the apps store ─────────────── */
export function plain(v) {
  if (!v || typeof v !== 'object') return v;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return { $ts: Date.parse(v.timestampValue) };
  if ('referenceValue' in v) return v.referenceValue.replace(/^projects\/[^/]+\/databases\/[^/]+\/documents\//, '');
  if ('geoPointValue' in v) return { latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 };
  if ('bytesValue' in v) return v.bytesValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain);
  if ('mapValue' in v) return fields(v.mapValue.fields);
  return null;
}
export const fields = (f = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, plain(v)]));
const docId = (name) => name.split('/').pop();

/** Every document directly in a collection (path relative to /documents). */
async function list(project, path) {
  const out = [];
  let page = '';
  do {
    const d = await call(`${FS}/projects/${project}/databases/(default)/documents/${path}?pageSize=300${page ? `&pageToken=${page}` : ''}`);
    for (const doc of d.documents || []) out.push({ id: docId(doc.name), data: fields(doc.fields) });
    page = d.nextPageToken || '';
  } while (page);
  return out;
}
async function get(project, path) {
  try {
    const d = await call(`${FS}/projects/${project}/databases/(default)/documents/${path}`);
    return { id: docId(d.name), data: fields(d.fields) };
  } catch (e) {
    if (/→ 404/.test(e.message)) return null;
    throw e;
  }
}
/** Every document in any collection with this id, anywhere (collection group). */
async function group(project, collectionId) {
  const out = [];
  let cursor = null;
  for (;;) {
    const q = { structuredQuery: { from: [{ collectionId, allDescendants: true }], orderBy: [{ field: { fieldPath: '__name__' } }], limit: 500, ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}) } };
    const rows = await call(`${FS}/projects/${project}/databases/(default)/documents:runQuery`, { method: 'POST', body: JSON.stringify(q) });
    const docs = rows.filter((r) => r.document).map((r) => r.document);
    for (const d of docs) out.push({ name: d.name, id: docId(d.name), data: fields(d.fields) });
    if (docs.length < 500) return out;
    cursor = docs[docs.length - 1].name;
  }
}

/** Every old account: uid, email, and whether that project had confirmed the email (Google always had). */
async function accounts(project) {
  const out = [];
  let page = '';
  do {
    const d = await call(`${IDT}/projects/${project}/accounts:batchGet?maxResults=1000${page ? `&nextPageToken=${page}` : ''}`);
    for (const u of d.users || []) {
      const google = (u.providerUserInfo || []).some((p) => p.providerId === 'google.com');
      out.push({ legacy_id: u.localId, email: u.email ? u.email.toLowerCase() : null, email_verified: Boolean(u.emailVerified || (google && u.email)) });
    }
    page = d.nextPageToken || '';
  } while (page);
  return out;
}

/* ── Per app: what its own import would have sent ─────────────────────────── */

const APPS = {
  /** stimultrack/src/lib/importHistory.js: users/{uid}/logs → stimul.logs rows */
  stimultrack: { project: 'caffeine-tracker-bcd4a', async data(project, accts) {
    const out = {};
    for (const { legacy_id: uid } of accts) {
      const logs = (await list(project, `users/${uid}/logs`)).map((d) => stimulRow(d.id, d.data)).filter(Boolean);
      if (logs.length) out[uid] = { logs };
    }
    return out;
  } },

  /** journaltogether/src/data/importHistory.js: each collection, by userId */
  journal: { project: 'journal-together-9234f', async data(project) {
    const out = {};
    for (const collection of ['entries', 'habits', 'timers', 'permissions']) {
      for (const d of await list(project, collection)) {
        const { userId, ...rest } = d.data;
        if (!userId) continue;
        (out[userId] ??= { docs: [] }).docs.push({ collection, id: d.id, data: rest });
      }
    }
    return out;
  } },

  /** ourden/src/data/importHistory.js: profile → den, the den and everything in it */
  ourden: { project: 'ourden', async data(project, accts) {
    const COLLECTIONS = ['answers', 'calendars', 'dateIdeas', 'dateNights', 'firsts', 'fundEntries', 'keepsakes', 'routines', 'tasks', 'watchlist'];
    const dens = new Map();
    const out = {};
    for (const { legacy_id: uid } of accts) {
      const profile = await get(project, `profiles/${uid}`);
      const cid = profile?.data?.coupleId;
      if (!cid) continue;
      if (!dens.has(cid)) {
        const couple = await get(project, `couples/${cid}`);
        const items = [];
        for (const collection of COLLECTIONS) for (const d of await list(project, `couples/${cid}/${collection}`)) items.push({ collection, id: d.id, data: d.data });
        dens.set(cid, { couple: couple?.data ?? {}, items });
      }
      out[uid] = { cid, ...dens.get(cid), profile: { ...profile.data, coupleId: cid } };
    }
    return out;
  } },

  /** tripplan/src/lib/importHistory.js: my trips and everything on them, friends, tokens, profiles */
  wander: { project: 'wander-f10b1', async data(project, accts) {
    const TRIP = ['itinerary_events', 'travel_details', 'trip_legs', 'trip_accommodations', 'polls', 'poll_votes', 'trip_observers',
      'brainstorm_ideas', 'brainstorm_comments', 'trip_activity', 'photo_albums', 'date_polls', 'date_availability', 'trip_members'];
    const all = {};
    for (const c of ['trips', 'friendships', 'calendar_tokens', 'app_tokens', 'profiles', 'poll_options', ...TRIP]) all[c] = await list(project, c);
    const row = (collection, d) => ({ collection, id: d.id, data: d.data });
    const out = {};
    for (const { legacy_id: uid } of accts) {
      const rows = new Map();
      const add = (c, d) => rows.set(`${c}/${d.id}`, row(c, d));
      const mine = all.trip_members.filter((d) => d.data.user_id === uid);
      const created = all.trips.filter((d) => d.data.created_by === uid);
      mine.forEach((d) => add('trip_members', d));
      created.forEach((d) => add('trips', d));
      const tripIds = new Set([...mine.map((d) => d.data.trip_id), ...created.map((d) => d.id)].filter(Boolean));
      all.trips.filter((d) => tripIds.has(d.id)).forEach((d) => add('trips', d));
      const people = new Set([uid]);
      for (const c of TRIP) {
        for (const d of all[c].filter((x) => tripIds.has(x.data.trip_id))) {
          add(c, d);
          if ((c === 'trip_members' || c === 'trip_observers') && d.data.user_id) people.add(d.data.user_id);
        }
      }
      const pollIds = new Set([...rows.values()].filter((x) => x.collection === 'polls').map((x) => x.id));
      all.poll_options.filter((d) => pollIds.has(d.data.poll_id)).forEach((d) => add('poll_options', d));
      all.friendships.filter((d) => (d.data.users || []).includes(uid)).forEach((d) => { add('friendships', d); (d.data.users || []).forEach((u) => people.add(u)); });
      all.calendar_tokens.filter((d) => d.data.created_by === uid).forEach((d) => add('calendar_tokens', d));
      all.app_tokens.filter((d) => d.data.created_by === uid).forEach((d) => add('app_tokens', d));
      all.profiles.filter((d) => people.has(d.id)).forEach((d) => add('profiles', d));
      if (rows.size) out[uid] = [...rows.values()];
    }
    return out;
  } },

  /** sidequest: its data was copied on 20 Nov under old ids; only who-is-who is needed. */
  sidequest: { project: 'sidequest-42196', async data() { return {}; } },

  /** znt-manager/src/services/importHistory.js: no accounts; the herd goes to the household */
  znt: { project: 'znt-manager', accounts: false, async household(project) {
    const COLLECTIONS = ['groups', 'cattle', 'heatEvents', 'lutalyseAdmin', 'hayRecords', 'cubesRecords', 'purchases', 'sessions', 'settings'];
    const rows = [];
    for (const collection of COLLECTIONS) for (const d of await list(project, `users/znt-manager-user/${collection}`)) rows.push({ collection, id: d.id, data: { ...d.data, id: d.id } });
    return rows;
  } },
};

/** stimultrack's toRow, on plain values. */
export function stimulRow(id, data) {
  const stamp = data.timestamp;
  const at = typeof data.at === 'number' ? data.at : stamp?.$ts ?? null;
  if (!at) return null;
  return {
    legacy_id: id,
    drink: String(data.drink || 'Unknown drink').slice(0, 200),
    mg: Math.max(0, Math.min(5000, Math.round(Number(data.calculatedCaffeine) || 0))),
    at: new Date(at).toISOString(),
    volume: typeof data.enteredVolume === 'number' ? data.enteredVolume : null,
    unit: data.isMetric === false ? 'oz' : 'ml',
    base_volume: typeof data.baseVolume === 'number' ? data.baseVolume : null,
    base_caffeine: typeof data.baseCaffeine === 'number' ? data.baseCaffeine : null,
    custom: Boolean(data.isCustom),
  };
}

async function main() {
  const [app, outDir = '.'] = process.argv.slice(2);
  const spec = APPS[app];
  if (!spec) throw new Error(`usage: export.mjs <${Object.keys(APPS).join('|')}> [outDir]`);
  if (!TOKEN) throw new Error('GOOGLE_TOKEN is not set');
  const accts = spec.accounts === false ? [] : await accounts(spec.project);
  const result = { app, project: spec.project, exported_at: new Date().toISOString(), accounts: accts };
  if (spec.data) result.data = await spec.data(spec.project, accts);
  if (spec.household) result.household = await spec.household(spec.project);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${app}.json`), JSON.stringify(result));
  const n = result.data ? Object.keys(result.data).length : 0;
  console.log(`${app}: ${accts.length} accounts, data for ${n}${result.household ? `, ${result.household.length} household records` : ''}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
