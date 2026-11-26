/*
 * GET /api/board — everything the board shows from the other apps, in one call.
 *
 * Runs on Netlify, so each app's token stays in this site's environment and
 * never reaches the tablet. Every source is fetched independently and comes
 * back with a status:
 *   live          its data (possibly empty: the board shows that honestly)
 *   error         the app couldn't be reached or answered with an error
 *   unconfigured  it can't be asked (not set up, or needs a sign-in)
 *   connect       Google isn't connected for this person yet
 * The board only ever shows sample data to someone signed out (`viewer`).
 *
 * Access: the board key, or a signed-in Hive user in a household (boardGate).
 *
 * Environment (Netlify → Project configuration → Environment variables):
 *   BOARD_ACCESS_KEY   required; see netlify/lib/shared.mjs
 *   GALAXYFARM_TOKEN   chores, housesitter guide, home location; only when nobody
 *                      is signed in to Hive (signed in, it's read as that person)
 *   KITCHENHUB_TOKEN   meals, recipes, shopping, use soon; only when nobody is
 *                      signed in to Hive (signed in, it's read as that person)
 *   LEARNLEAF_TOKEN    tasks; only when nobody is signed in to Hive, or LearnLeaf
 *                      refuses the pass (signed in, it's read as that person)
 *   Google Calendar and Google Tasks need no setting here: they're fetched as
 *   the signed-in Hive user (Authorization header), with a pass for Our Den.
 *   Needs HIVE_SIGNING_KEY (Hive's own key; see src/config/hive.js).
 *   WANDER_TOKEN       trips (each with only the owner's own legs and stays); only
 *                      when nobody is signed in to Hive, or Wander refuses the pass
 *   WANDER_TRAVELER_NAME  your name as Wander shows it; only needed until Wander's
 *                      appTripTravel marks legs with `mine`
 *   Optional: HOME_LAT / HOME_LON / HOME_TZ (only if GalaxyFarm has no location),
 *   GALAXYFARM_URL, KITCHENHUB_URL, LEARNLEAF_URL, OURDEN_URL, WANDER_FUNCTIONS_URL,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (ZNT, from Hive's Supabase project)
 */
import { env, getJson, json, SourceError, urls } from '../lib/shared.mjs';
import { asUser, passHeader } from '../lib/hiveUser.mjs';
import { admin, adminRead, boardGate } from '../lib/household.mjs';
import { GOOGLE_NOT_CONNECTED } from '../../src/config/google.js';

// Travel is looked up for every trip starting this soon (or under way): it decides
// which trips are the owner's own, so a trip without a lookup can't be shown.
const TRAVEL_LOOKAHEAD_DAYS = 400;
const MAX_TRAVEL_LOOKUPS = 15;

const dateIn = (d, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/* ---------------------------------------------------------- GalaxyFarm --- */
// As the signed-in Hive user (a pass) when there is one; GALAXYFARM_TOKEN otherwise.
async function galaxyfarm(user) {
  let r;
  try { r = await asUser(user, 'galaxyfarm', 'GALAXYFARM_TOKEN', (headers) => getJson(`${urls.galaxyfarm()}/api/board/v1`, { headers }));
  } catch (e) { if (e.unconfigured) return { status: 'unconfigured', reason: e.message }; throw e; }
  return {
    status: 'live',
    data: {
      property: r.property,
      // `eggs` marks the egg round: ticking it opens GalaxyFarm's egg count (src/lib/eggs.js).
      chores: r.chores.map((c) => ({ id: c.id, title: c.title, detail: c.detail || '', slot: c.slot, done: !!c.done, eggs: !!c.eggs })),
      sitter: {
        contacts: (r.sitter?.contacts || []).map((c) => [c.name, c.role || '', c.phone || '']),
        // `notes` is GalaxyFarm's older flat list. Once it sends `care`, the same things
        // (do-not-handle, risky pens, intro, written sections) arrive structured, so skip it.
        notes: Array.isArray(r.sitter?.care) ? [] : (r.sitter?.notes || []).map((n) => [n.safety ? 'safety' : '', n.text]),
        intro: r.sitter?.intro || null,
        doNotHandle: r.sitter?.doNotHandle || [],
        care: (r.sitter?.care || []).map((sec) => ({
          title: sec.title,
          items: (sec.items || []).map((i) => ({ name: i.name || '', detail: i.detail || '', safety: i.safety ?? null, safetyLabel: i.safetyLabel ?? null })),
        })),
      },
    },
  };
}

/** Home comes from GalaxyFarm's location setting; HOME_* env vars only fill in when it has none. */
function resolveHome(gf) {
  const p = gf.status === 'live' ? gf.data.property : null;
  const lat = Number.isFinite(p?.lat) ? p.lat : parseFloat(env('HOME_LAT'));
  const lon = Number.isFinite(p?.lon) ? p.lon : parseFloat(env('HOME_LON'));
  const tz = p?.timezone || env('HOME_TZ', 'America/Chicago');
  return { home: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null, tz, from: Number.isFinite(p?.lat) ? 'galaxyfarm' : 'env' };
}

/* ------------------------------------------------------------ weather --- */
const wmo = (c) => (c === 0 || c === 1 ? 'sun' : c === 2 ? 'partly' : c === 3 || c === 45 || c === 48 ? 'cloud' : 'rain');
const WMO_TEXT = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorms', 96: 'Thunderstorms', 99: 'Thunderstorms' };

async function weather({ home, tz }) {
  if (!home) return { status: 'unconfigured', reason: 'Set the farm location in GalaxyFarm settings' };
  const q = new URLSearchParams({
    latitude: home.lat, longitude: home.lon, current: 'temperature_2m,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    temperature_unit: 'fahrenheit', timezone: tz, forecast_days: '10',
  });
  const w = await getJson(`https://api.open-meteo.com/v1/forecast?${q}`);
  return {
    status: 'live',
    data: {
      now: Math.round(w.current.temperature_2m), code: wmo(w.current.weather_code), desc: WMO_TEXT[w.current.weather_code] ?? 'Mixed',
      days: w.daily.time.map((date, i) => ({
        date, hi: Math.round(w.daily.temperature_2m_max[i]), lo: Math.round(w.daily.temperature_2m_min[i]),
        code: wmo(w.daily.weather_code[i]), rain: w.daily.precipitation_probability_max?.[i] ?? null,
      })),
      // The next 24 hours from now, in the farm's time zone (times are local "YYYY-MM-DDTHH:00").
      hours: (() => {
        const t = w.hourly?.time || [];
        const nowLocal = (w.current.time || '').slice(0, 13);
        const start = Math.max(0, t.findIndex((x) => x.slice(0, 13) >= nowLocal));
        return t.slice(start, start + 24).map((time, k) => ({
          time, temp: Math.round(w.hourly.temperature_2m[start + k]), code: wmo(w.hourly.weather_code[start + k]),
          rain: w.hourly.precipitation_probability?.[start + k] ?? null,
        }));
      })(),
    },
  };
}

/* ---------------------------------------------------------- KitchenHub --- */
// As the signed-in Hive user (a pass) when there is one; KITCHENHUB_TOKEN otherwise.
async function kitchenhub(user) {
  let r;
  try { r = await asUser(user, 'kitchenhub', 'KITCHENHUB_TOKEN', (headers) => getJson(`${urls.kitchenhub()}/`, { headers }));
  } catch (e) { if (e.unconfigured) return { status: 'unconfigured', reason: e.message }; throw e; }
  return {
    status: 'live',
    data: {
      today: r.today,
      meals: r.meals.map((m) => ({ date: m.date, type: m.type, name: m.name, recipe: m.recipeId || null, status: m.status })),
      recipes: Object.fromEntries(Object.entries(r.recipes || {}).map(([id, x]) => [id, {
        name: x.name, sub: x.sub || '', time: x.time || '', serves: x.serves ?? null, cal: x.cal ?? null,
        ingredients: x.ingredients || [], steps: (x.steps || []).map((s, i) => ({ title: s.title || `Step ${i + 1}`, text: s.text || [], uses: s.uses || [], timer: s.timer || undefined })),
      }])),
      expiring: r.expiring || [],
      shopping: (r.shopping || []).map((i) => ({ id: i.id, name: i.name, qty: i.qty || '', section: i.section || 'Other', why: i.why || '', bought: !!i.bought })),
    },
  };
}

/* ----------------------------------------------------------- LearnLeaf --- */
/* ------------------------------------------------- Google, via Our Den --- */
// Our Den already holds each person's Google link (Calendar read-only + Tasks);
// its /api/board/google answers, for whoever the pass names, with the next two
// weeks of events and open tasks. No one's email or key lives in this site.
async function google(where, user) {
  let headers;
  try { headers = passHeader(user, 'ourden'); } catch (e) { return { status: 'unconfigured', reason: e.message }; }
  const tz = where.tz || 'UTC';
  const res = await fetch(`${urls.ourden()}/api/board/google?tz=${encodeURIComponent(tz)}`, { headers, signal: AbortSignal.timeout(12000) });
  // 409: this person hasn't connected Google yet (or Google revoked it).
  if (res.status === 409) return { status: 'connect', reason: GOOGLE_NOT_CONNECTED };
  // Anything else: keep Our Den's reason (Google's own words, e.g. an API turned
  // off), so the log and the widget say what's wrong rather than just "502".
  if (!res.ok) {
    const why = (await res.json().catch(() => ({}))).error;
    throw new SourceError(`Our Den answered ${res.status}${why ? `: ${String(why).slice(0, 200)}` : ''}`, res.status);
  }
  const d = await res.json();
  return { status: 'live', data: { events: d.events || [], tasks: d.tasks || [] } };
}

// As the signed-in Hive user (a pass) when there is one; LEARNLEAF_TOKEN otherwise.
async function learnleaf(user) {
  let summary, subj;
  try {
    [summary, subj] = await asUser(user, 'learnleaf', 'LEARNLEAF_TOKEN', (headers) => Promise.all([getJson(`${urls.learnleaf()}/api/summary`, { headers }), getJson(`${urls.learnleaf()}/api/subjects`, { headers })]));
  } catch (e) { if (e.unconfigured) return { status: 'unconfigured', reason: e.message }; throw e; }
  const tasks = [...summary.overdue, ...summary.dueToday, ...summary.upcoming].map((t) => ({
    id: t.taskId, name: t.taskName, subject: t.taskSubject, due: t.taskDueDate, time: t.taskDueTime || '',
  }));
  const used = new Set(tasks.map((t) => t.subject));
  const subjects = Object.fromEntries(subj.subjects.filter((s) => used.has(s.subjectId)).map((s) => [s.subjectId, [s.subjectName || 'Subject', s.subjectColor || '#8a8f8c']]));
  return { status: 'live', data: { tasks, subjects } };
}

/* -------------------------------------------------------------- Wander --- */
const geoCache = new Map();
async function geocode(place) {
  if (!place) return null;
  if (geoCache.has(place)) return geoCache.get(place);
  const name = place.split(',')[0].trim();
  const r = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '1' })}`).catch(() => null);
  const hit = r?.results?.[0] ? { lat: r.results[0].latitude, lon: r.results[0].longitude } : null;
  geoCache.set(place, hit);
  return hit;
}
const clock = (wall) => {
  const m = /T(\d{2}):(\d{2})/.exec(wall || '');
  if (!m) return '';
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * Is this leg or stay the owner's? Wander marks it with `mine` (appTripTravel);
 * until that is deployed, match WANDER_TRAVELER_NAME against the traveller names.
 */
function isMine(item) {
  if (typeof item.mine === 'boolean') return item.mine;
  const me = env('WANDER_TRAVELER_NAME', '').trim().toLowerCase();
  return !!me && (item.traveler_names || []).some((n) => String(n).trim().toLowerCase() === me);
}

/**
 * Every upcoming trip the owner is on. Each carries only the owner's own
 * travel (`items`: their legs and stays); other travellers' flights are left
 * out. Whether a trip counts as "away" is decided by distance on the board.
 */
// As the signed-in Hive user (a pass) when there is one; WANDER_TOKEN otherwise.
async function wander({ tz }, user) {
  let trips, auth;
  try {
    ({ trips, auth } = await asUser(user, 'wander', 'WANDER_TOKEN', async (headers) => ({ ...(await getJson(`${urls.wander()}/appTrips`, { headers })), auth: { headers } })));
  } catch (e) { if (e.unconfigured) return { status: 'unconfigured', reason: e.message }; throw e; }
  const today = dateIn(new Date(), tz), horizon = addDays(today, TRAVEL_LOOKAHEAD_DAYS);
  let lookups = 0;
  const out = await Promise.all(trips.filter((t) => t.start_date && t.end_date).map(async (t) => {
    const trip = { id: t.id, name: t.name, dest: t.destination || '', startDate: t.start_date, endDate: t.end_date, items: [] };
    const geo = Number.isFinite(t.lat) && Number.isFinite(t.lon) ? { lat: t.lat, lon: t.lon } : await geocode(t.destination);
    if (geo) Object.assign(trip, geo);
    if (t.start_date > horizon || lookups++ >= MAX_TRAVEL_LOOKUPS) return trip;
    const travel = await getJson(`${urls.wander()}/appTripTravel?trip=${encodeURIComponent(t.id)}`, auth).catch(() => null);
    if (!travel) return trip;
    trip.items = [
      ...travel.legs.filter(isMine).map((l) => ({
        kind: l.transport || 'other',
        title: l.number || '',
        route: [l.from, l.to].filter(Boolean).join(' to '),
        date: (l.depart_at || '').slice(0, 10),
        time: clock(l.depart_at),
        arrive: clock(l.arrive_at),
      })),
      ...travel.accommodations.filter(isMine).map((a) => ({
        kind: 'stay',
        title: a.name || 'Stay',
        date: String(a.check_in || '').slice(0, 10),
        until: String(a.check_out || '').slice(0, 10),
      })),
    ].filter((i) => i.date).sort((x, y) => (x.date + (x.time ? '1' : '0')).localeCompare(y.date + (y.time ? '1' : '0')));
    return trip;
  }));
  return { status: 'live', data: { trips: out } };
}

/* ----------------------------------------------------------------- ZNT --- */

/**
 * ZNT's breeding sessions, from Hive's Supabase project (schema znt), for the
 * household of whoever is signed in to Hive (boardGate looked it up). The
 * fridge tablet may have nobody signed in: then the only household, if there's
 * exactly one.
 */
async function znt({ tz }, household) {
  if (!admin()) return { status: 'unconfigured', reason: 'Supabase is not set up for the board' };
  const read = (path, schema) => adminRead(path, schema);
  if (!household) {
    const all = await read('households?select=id&limit=2', 'core');
    if (all.length === 1) household = all[0].id;
  }
  if (!household) return { status: 'unconfigured', reason: 'Sign in to Hive to see your household’s breeding' };
  const rows = await read(`docs?select=id,data&collection=eq.sessions&household_id=eq.${household}`, 'znt');
  const day = (v) => (v && typeof v.$ts === 'number' ? dateIn(new Date(v.$ts), tz) : null); // stored at local noon, so this is the CIDR day
  const sessions = rows.map(({ data: f }) => ({
    name: f.name || 'Breeding group',
    cidr: day(f.cidrDate),
    groups: (f.groups || []).map((g) => [g.name || 'Group', Number(g.headCount) || 0]),
    notes: f.notes || '',
  })).filter((x) => x.cidr);
  return { status: 'live', data: { sessions } };
}

/* ------------------------------------------------------------- handler --- */
async function settle(name, fn) {
  try { return await fn(); } catch (e) {
    console.error(`${name} failed:`, e);
    return { status: 'error', reason: e instanceof SourceError ? e.message : 'Could not reach it' };
  }
}

export default async (req) => {
  const gate = await boardGate(req);
  if (!gate.ok) return gate.response;
  const { user } = gate;

  // GalaxyFarm first: it owns the home location the others need.
  const gf = await settle('galaxyfarm', () => galaxyfarm(user));
  const where = resolveHome(gf);
  const [w, kh, ll, wa, z, g] = await Promise.all([
    settle('weather', () => weather(where)),
    settle('kitchenhub', () => kitchenhub(user)),
    settle('learnleaf', () => learnleaf(user)),
    settle('wander', () => wander(where, user)),
    settle('znt', () => znt(where, gate.household)),
    settle('google', () => google(where, user)),
  ]);
  const sources = { galaxyfarm: gf, weather: w, kitchenhub: kh, learnleaf: ll, wander: wa, znt: z, google: g };
  // One line per request, so the log says what each widget got and why.
  console.log(`[board] ${user ? 'signed in' : gate.expired ? 'expired sign-in' : 'signed out'}${gate.viaKey ? ', key' : ''}: ${Object.entries(sources).map(([k, v]) => `${k}=${v.status}${v.status === 'live' ? '' : ` (${v.reason})`}`).join(', ')}`);
  return json(200, {
    generatedAt: new Date().toISOString(),
    viewer: { signedIn: !!user, expired: gate.expired, household: !!gate.household },
    home: where.home ? { ...where.home, tz: where.tz, from: where.from } : null,
    sources,
  }, { 'cache-control': 'private, no-store' });
};

export const config = { path: '/api/board' };
