/*
 * GET /api/board — everything the board shows from the other apps, in one call.
 *
 * Runs on Netlify, so each app's token stays in this site's environment and
 * never reaches the tablet. Every source is fetched independently: one that is
 * not configured or fails comes back with a status instead of data, and the
 * board falls back for that section alone.
 *
 * Environment (Netlify → Project configuration → Environment variables):
 *   BOARD_ACCESS_KEY   required; see netlify/lib/shared.mjs
 *   GALAXYFARM_TOKEN   chores, housesitter guide, and the home location (GalaxyFarm settings)
 *   KITCHENHUB_TOKEN   meals, recipes, shopping list, food to use soon
 *   LEARNLEAF_TOKEN    tasks
 *   WANDER_TOKEN       trips (only the owner's own travel)
 *   WANDER_TRAVELER_NAME  your name as Wander shows it; only needed until Wander's
 *                      appTripTravel marks legs with `mine`
 *   Optional: HOME_LAT / HOME_LON / HOME_TZ (only if GalaxyFarm has no location),
 *   GALAXYFARM_URL, KITCHENHUB_URL, LEARNLEAF_URL, WANDER_FUNCTIONS_URL,
 *   ZNT_PROJECT_ID, ZNT_API_KEY
 */
import { bearer, env, getJson, json, requireKey, SourceError, urls } from '../lib/shared.mjs';

const ZNT_PROJECT = () => env('ZNT_PROJECT_ID', 'znt-manager');
const ZNT_KEY = () => env('ZNT_API_KEY', ''); // ZNT's rules allow reads, so no key is needed
const ZNT_USER = 'znt-manager-user';
// Travel is looked up for every trip starting this soon (or under way): it decides
// which trips are the owner's own, so a trip without a lookup can't be shown.
const TRAVEL_LOOKAHEAD_DAYS = 130;
const MAX_TRAVEL_LOOKUPS = 12;

const dateIn = (d, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/* ---------------------------------------------------------- GalaxyFarm --- */
async function galaxyfarm() {
  const token = env('GALAXYFARM_TOKEN');
  if (!token) return { status: 'unconfigured', reason: 'Set GALAXYFARM_TOKEN' };
  const r = await getJson(`${urls.galaxyfarm()}/api/board/v1`, bearer(token));
  return {
    status: 'live',
    data: {
      property: r.property,
      chores: r.chores.map((c) => ({ id: c.id, title: c.title, detail: c.detail || '', slot: c.slot, done: !!c.done })),
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
    daily: 'temperature_2m_max,temperature_2m_min,weather_code', temperature_unit: 'fahrenheit', timezone: tz, forecast_days: '4',
  });
  const w = await getJson(`https://api.open-meteo.com/v1/forecast?${q}`);
  return {
    status: 'live',
    data: {
      now: Math.round(w.current.temperature_2m), code: wmo(w.current.weather_code), desc: WMO_TEXT[w.current.weather_code] ?? 'Mixed',
      days: w.daily.time.map((_, i) => ({ hi: Math.round(w.daily.temperature_2m_max[i]), lo: Math.round(w.daily.temperature_2m_min[i]), code: wmo(w.daily.weather_code[i]) })),
    },
  };
}

/* ---------------------------------------------------------- KitchenHub --- */
async function kitchenhub() {
  const token = env('KITCHENHUB_TOKEN');
  if (!token) return { status: 'unconfigured', reason: 'Set KITCHENHUB_TOKEN' };
  const r = await getJson(`${urls.kitchenhub()}/`, bearer(token));
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
async function learnleaf() {
  const token = env('LEARNLEAF_TOKEN');
  if (!token) return { status: 'unconfigured', reason: 'Set LEARNLEAF_TOKEN' };
  const auth = bearer(token);
  const [summary, subj] = await Promise.all([getJson(`${urls.learnleaf()}/api/summary`, auth), getJson(`${urls.learnleaf()}/api/subjects`, auth)]);
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

/** Only the owner's own travel: trips they fly, drive or stay on, with only their legs. */
async function wander({ tz }) {
  const token = env('WANDER_TOKEN');
  if (!token) return { status: 'unconfigured', reason: 'Set WANDER_TOKEN' };
  const auth = bearer(token);
  const { trips } = await getJson(`${urls.wander()}/appTrips`, auth);
  const today = dateIn(new Date(), tz), horizon = addDays(today, TRAVEL_LOOKAHEAD_DAYS);
  const soon = trips.filter((t) => t.start_date && t.end_date && t.start_date <= horizon).slice(0, MAX_TRAVEL_LOOKUPS);
  const out = await Promise.all(soon.map(async (t) => {
    const travel = await getJson(`${urls.wander()}/appTripTravel?trip=${encodeURIComponent(t.id)}`, auth);
    const myLegs = travel.legs.filter(isMine);
    const myStays = travel.accommodations.filter(isMine);
    if (!myLegs.length && !myStays.length) return null; // someone else's trip, or no travel at all
    const trip = { id: t.id, name: t.name, dest: t.destination || '', startDate: t.start_date, endDate: t.end_date };
    const geo = Number.isFinite(t.lat) && Number.isFinite(t.lon) ? { lat: t.lat, lon: t.lon } : await geocode(t.destination);
    if (geo) Object.assign(trip, geo);
    const legs = myLegs.slice(0, 3);
    if (legs.length) trip.legs = legs.map((l) => [l.number || l.transport, `${l.from} to ${l.to}`, clock(l.depart_at)]);
    if (myStays[0]?.name) trip.stay = myStays[0].name;
    return trip;
  }));
  return { status: 'live', data: { trips: out.filter(Boolean) } };
}

/* ----------------------------------------------------------------- ZNT --- */
function fsValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fsValue(x)]));
  return undefined;
}

async function znt({ tz }) {
  const base = `https://firestore.googleapis.com/v1/projects/${ZNT_PROJECT()}/databases/(default)/documents/users/${ZNT_USER}/sessions`;
  const q = new URLSearchParams({ pageSize: '200' });
  if (ZNT_KEY()) q.set('key', ZNT_KEY());
  const r = await getJson(`${base}?${q}`);
  const sessions = (r.documents || []).map((d) => {
    const f = Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fsValue(v)]));
    return {
      name: f.name || 'Breeding group',
      cidr: f.cidrDate instanceof Date ? dateIn(f.cidrDate, tz) : null, // stored at local noon, so this is the CIDR day
      groups: (f.groups || []).map((g) => [g.name || 'Group', Number(g.headCount) || 0]),
      notes: f.notes || '',
    };
  }).filter((s) => s.cidr);
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
  const locked = requireKey(req);
  if (locked) return locked;

  // GalaxyFarm first: it owns the home location the others need.
  const gf = await settle('galaxyfarm', galaxyfarm);
  const where = resolveHome(gf);
  const [w, kh, ll, wa, z] = await Promise.all([
    settle('weather', () => weather(where)),
    settle('kitchenhub', kitchenhub),
    settle('learnleaf', learnleaf),
    settle('wander', () => wander(where)),
    settle('znt', () => znt(where)),
  ]);
  return json(200, {
    generatedAt: new Date().toISOString(),
    home: where.home ? { ...where.home, tz: where.tz, from: where.from } : null,
    sources: { galaxyfarm: gf, weather: w, kitchenhub: kh, learnleaf: ll, wander: wa, znt: z },
  }, { 'cache-control': 'private, no-store' });
};

export const config = { path: '/api/board' };
