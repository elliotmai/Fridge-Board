/*
 * GET /api/board — everything the board shows from the other apps, in one call.
 *
 * Runs on Netlify, so each app's token stays in this site's environment and
 * never reaches the tablet. Every source is fetched independently: one that is
 * not configured or fails comes back with a status instead of data, and the
 * board falls back for that section alone.
 *
 * Environment (Netlify → Project configuration → Environment variables):
 *   HOME_LAT, HOME_LON     home location: weather, and how far away a trip is
 *   HOME_TZ                IANA zone for dates, e.g. America/Chicago (default)
 *   LEARNLEAF_TOKEN        LearnLeaf API token (scripts/make-api-token.mjs in that repo)
 *   WANDER_TOKEN           Wander app token (Account → Connected apps)
 *   Optional overrides:    LEARNLEAF_URL, WANDER_FUNCTIONS_URL, ZNT_PROJECT_ID, ZNT_API_KEY
 */

const env = (k, d) => process.env[k] || d;
const LEARNLEAF_URL = () => env('LEARNLEAF_URL', 'https://learnleaf-organizer.netlify.app');
const WANDER_URL = () => env('WANDER_FUNCTIONS_URL', 'https://us-central1-wander-f10b1.cloudfunctions.net');
// ZNT's Firestore rules allow reads of its one user's data, so no key is needed.
const ZNT_PROJECT = () => env('ZNT_PROJECT_ID', 'znt-manager');
const ZNT_KEY = () => env('ZNT_API_KEY', '');
const ZNT_USER = 'znt-manager-user';

const TRAVEL_LOOKAHEAD_DAYS = 60; // fetch flights/lodging for trips starting this soon
const MAX_TRAVEL_LOOKUPS = 5;

class SourceError extends Error {}

async function getJson(url, init = {}, timeoutMs = 8000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new SourceError(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

const tz = () => env('HOME_TZ', 'America/Chicago');
const dateIn = (d, zone = tz()) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

function home() {
  const lat = parseFloat(env('HOME_LAT')), lon = parseFloat(env('HOME_LON'));
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/* ------------------------------------------------------------ weather --- */
// WMO weather codes → the four icons the board draws.
const wmo = (c) => (c === 0 || c === 1 ? 'sun' : c === 2 ? 'partly' : c === 3 || c === 45 || c === 48 ? 'cloud' : 'rain');
const WMO_TEXT = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorms', 96: 'Thunderstorms', 99: 'Thunderstorms' };

async function weather() {
  const h = home();
  if (!h) return { status: 'unconfigured', reason: 'Set HOME_LAT and HOME_LON' };
  const q = new URLSearchParams({
    latitude: h.lat, longitude: h.lon, current: 'temperature_2m,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code', temperature_unit: 'fahrenheit', timezone: tz(), forecast_days: '4',
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

/* ----------------------------------------------------------- LearnLeaf --- */
async function learnleaf() {
  const token = env('LEARNLEAF_TOKEN');
  if (!token) return { status: 'unconfigured', reason: 'Set LEARNLEAF_TOKEN' };
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const [summary, subj] = await Promise.all([getJson(`${LEARNLEAF_URL()}/api/summary`, auth), getJson(`${LEARNLEAF_URL()}/api/subjects`, auth)]);
  const tasks = [...summary.overdue, ...summary.dueToday, ...summary.upcoming].map((t) => ({
    id: t.taskId, name: t.taskName, subject: t.taskSubject, due: t.taskDueDate, time: t.taskDueTime || '',
  }));
  const used = new Set(tasks.map((t) => t.subject));
  const subjects = Object.fromEntries(
    subj.subjects.filter((s) => used.has(s.subjectId)).map((s) => [s.subjectId, [s.subjectName || 'Subject', s.subjectColor || '#8a8f8c']]),
  );
  return { status: 'live', data: { tasks, subjects, today: summary.today } };
}

/* -------------------------------------------------------------- Wander --- */
const geoCache = new Map();
async function geocode(place) {
  if (!place) return null;
  if (geoCache.has(place)) return geoCache.get(place);
  // "Asheville, NC" → search "Asheville"; Open-Meteo matches on the place name.
  const name = place.split(',')[0].trim();
  const r = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '1' })}`).catch(() => null);
  const hit = r?.results?.[0] ? { lat: r.results[0].latitude, lon: r.results[0].longitude } : null;
  geoCache.set(place, hit);
  return hit;
}

const clock = (wall) => {
  // Wander stores wall-clock times like "2026-11-26T06:10" with a separate zone; show them as written.
  const m = /T(\d{2}):(\d{2})/.exec(wall || '');
  if (!m) return '';
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

async function wander() {
  const token = env('WANDER_TOKEN');
  if (!token) return { status: 'unconfigured', reason: 'Set WANDER_TOKEN' };
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const { trips } = await getJson(`${WANDER_URL()}/appTrips`, auth);
  const today = dateIn(new Date()), horizon = addDays(today, TRAVEL_LOOKAHEAD_DAYS);
  let lookups = 0;
  const out = await Promise.all(trips.map(async (t) => {
    const trip = { id: t.id, name: t.name, dest: t.destination || '', startDate: t.start_date, endDate: t.end_date };
    const geo = await geocode(t.destination);
    if (geo) Object.assign(trip, geo);
    if (t.start_date && t.start_date <= horizon && lookups++ < MAX_TRAVEL_LOOKUPS) {
      const travel = await getJson(`${WANDER_URL()}/appTripTravel?trip=${encodeURIComponent(t.id)}`, auth).catch(() => null);
      if (travel) {
        const legs = travel.legs.filter((l) => l.transport === 'flight' || l.number).slice(0, 3);
        if (legs.length) trip.legs = legs.map((l) => [l.number || l.transport, `${l.from} to ${l.to}`, clock(l.depart_at)]);
        if (travel.accommodations[0]?.name) trip.stay = travel.accommodations[0].name;
      }
    }
    return trip;
  }));
  return { status: 'live', data: { trips: out.filter((t) => t.startDate && t.endDate) } };
}

/* ----------------------------------------------------------------- ZNT --- */
// Firestore REST values → plain JS.
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

async function znt() {
  const base = `https://firestore.googleapis.com/v1/projects/${ZNT_PROJECT()}/databases/(default)/documents/users/${ZNT_USER}/sessions`;
  const q = new URLSearchParams({ pageSize: '200' });
  if (ZNT_KEY()) q.set('key', ZNT_KEY());
  const r = await getJson(`${base}?${q}`);
  const sessions = (r.documents || []).map((d) => {
    const f = Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fsValue(v)]));
    return {
      name: f.name || 'Breeding group',
      // Stored at local noon on the CIDR day, so the date in the home zone is that day.
      cidr: f.cidrDate instanceof Date ? dateIn(f.cidrDate) : null,
      groups: (f.groups || []).map((g) => [g.name || 'Group', Number(g.headCount) || 0]),
      notes: f.notes || '',
    };
  }).filter((s) => s.cidr);
  return { status: 'live', data: { sessions } };
}

/* ------------------------------------------------------------- handler --- */
async function settle(fn) {
  try { return await fn(); } catch (e) {
    console.error(`${fn.name} failed:`, e);
    return { status: 'error', reason: e instanceof SourceError ? e.message : 'Could not reach it' };
  }
}

export default async () => {
  const [w, ll, wa, z] = await Promise.all([settle(weather), settle(learnleaf), settle(wander), settle(znt)]);
  const h = home();
  const body = {
    generatedAt: new Date().toISOString(),
    home: h ? { ...h, tz: tz() } : null,
    sources: { weather: w, learnleaf: ll, wander: wa, znt: z },
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=60' },
  });
};

export const config = { path: '/api/board' };
