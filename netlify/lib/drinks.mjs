/*
 * Drink Tracker quick-add from the fridge board, for anyone in the household.
 *
 * Drink Tracker (alcoholtracker repo) keeps its data in Hive's Supabase
 * project, schema `drinks`: drinks.tree holds one row per record, keyed by its
 * Firebase-style path. A drink is the row
 *
 *   path  ['users', <uid>, 'drinks', <push id>]
 *   value { type, name, quantity, unit: 'oz', date: 'YYYY-MM-DD', time: 'HH:MM' }
 *
 * exactly what the app's addDrink() writes (date and time are the local day
 * and 24-hour time). The app works its stats, favourites (distinctDrinks) and
 * BAC out from the drinks themselves, so a drink added here counts like any other.
 *
 * Row-level security only lets a person write their own drinks, and that stays
 * as it is: adding one for someone else goes through /api/drinks, which uses
 * the service role only after these checks:
 *   - the caller is signed in to Hive and in a household
 *   - the person the drink is for is in that same household
 *   - the write is one new drink row (an insert: it can't overwrite or delete)
 */
import { randomInt } from 'node:crypto';

/** The app's drink types and the amount it fills in for each (Functions.js DEFAULT_DRINK_QUANTITIES). */
export const DRINK_TYPES = [
  { type: 'Beer', quantity: 12, emoji: '🍺' },
  { type: 'Wine', quantity: 5, emoji: '🍷' },
  { type: 'Cocktail', quantity: 8, emoji: '🍸' },
  { type: 'Spirit', quantity: 1.5, emoji: '🥃' },
  { type: 'Other', quantity: 6, emoji: '🍹' },
];
const TYPES = new Set(DRINK_TYPES.map((t) => t.type));
export const MAX_OZ = 64;

// Push ids: time-ordered, the same shape as Firebase's and the app's (rtdb.js pushId).
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
export function pushId(now = Date.now()) {
  let t = now, time = '';
  for (let i = 0; i < 8; i++) { time = PUSH_CHARS.charAt(t % 64) + time; t = Math.floor(t / 64); }
  let rand = '';
  for (let i = 0; i < 12; i++) rand += PUSH_CHARS.charAt(randomInt(64));
  return time + rand;
}

/** A time zone name Intl knows, or the fallback. */
export function safeZone(tz, fallback = 'America/Chicago') {
  try { if (tz) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } } catch { /* not a zone */ }
  return fallback;
}

/** The local day ('YYYY-MM-DD') and 24-hour time ('HH:MM') in `tz`, as the app stores them. */
export function localDateTime(now, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/**
 * The drink to store, from what the board sent: only type, name and quantity
 * are taken, checked, and the date and time are set here. Throws a readable
 * error for anything off.
 */
export function buildDrink(input, { now = new Date(), tz = 'America/Chicago' } = {}) {
  if (!input || typeof input !== 'object') throw new Error('Send the drink as an object');
  const type = String(input.type || '');
  if (!TYPES.has(type)) throw new Error('Pick a drink type');
  const quantity = Math.round(Number(input.quantity) * 100) / 100;
  if (!(quantity > 0 && quantity <= MAX_OZ)) throw new Error(`The amount must be between 0 and ${MAX_OZ} oz`);
  const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return { type, name, quantity, unit: 'oz', ...localDateTime(now, tz) };
}

/**
 * One-tap options for a person: their favourites (the app's distinctDrinks,
 * most-used first), then their latest drinks not already among them, then the
 * plain drink types.
 */
export function quickOptions(distinct, recent, { favorites = 6, latest = 3 } = {}) {
  const key = (d) => `${d.type}|${(d.name || '').toLowerCase()}|${d.quantity}`;
  const ok = (d) => d && TYPES.has(d.type) && Number(d.quantity) > 0 && Number(d.quantity) <= MAX_OZ;
  const shape = (d) => ({ type: d.type, name: d.name || '', quantity: Number(d.quantity) });
  const fav = (Array.isArray(distinct) ? distinct : Object.values(distinct || {})).filter(ok).slice(0, favorites).map(shape);
  const seen = new Set(fav.map(key));
  const rec = [];
  for (const d of recent || []) {
    if (!ok(d) || seen.has(key(d))) continue;
    seen.add(key(d)); rec.push(shape(d));
    if (rec.length >= latest) break;
  }
  return { favorites: fav, recent: rec, types: DRINK_TYPES };
}

/**
 * The /api/drinks routes, with their outside calls passed in (so tests can
 * stand in for them):
 *
 *   GET  /api/drinks             → { people: [{ id, name, me }] } in my household
 *   GET  /api/drinks/:member     → { favorites, recent, types, today }
 *   POST /api/drinks/:member     { type, name?, quantity, tz? } → { ok, drink }
 *
 * deps: session(req) → { user }, household(uid) → id | null,
 *       members(hid) → [{ id, name }], read(path, schema) → rows,
 *       insert(row) → resolves when one new row is stored, now() → Date
 */
export async function handleDrinks(req, member, deps) {
  const send = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  const { user } = await deps.session(req);
  if (!user) return send(401, { error: 'Sign in to Hive on this board to add drinks' });
  const hid = await deps.household(user.uid);
  if (!hid) return send(403, { error: 'Join a household in Hive to add drinks for it' });
  const people = await deps.members(hid);

  if (!member) {
    if (req.method !== 'GET') return send(405, { error: 'method_not_allowed' });
    return send(200, { people: people.map((p) => ({ id: p.id, name: p.name, me: p.id === user.uid })) });
  }
  const target = people.find((p) => p.id === member);
  if (!target) return send(403, { error: 'That person isn’t in your household' });
  const uid = encodeURIComponent(target.id);

  if (req.method === 'GET') {
    const tz = safeZone(new URL(req.url).searchParams.get('tz'), deps.tz);
    const today = localDateTime(deps.now(), tz).date;
    const [distinct, recent, todays] = await Promise.all([
      deps.read(`tree?select=value&key=eq.users/${uid}/distinctDrinks`, 'drinks'),
      deps.read(`tree?select=value&root=eq.users/${uid}&path=cs.{drinks}&order=key.desc&limit=20`, 'drinks'),
      deps.read(`tree?select=key&root=eq.users/${uid}&path=cs.{drinks}&value->>date=eq.${today}`, 'drinks'),
    ]);
    return send(200, { ...quickOptions(distinct[0]?.value, recent.map((r) => r.value)), today: todays.length });
  }

  if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });
  const body = await req.json().catch(() => null);
  let drink;
  try { drink = buildDrink(body, { now: deps.now(), tz: safeZone(body?.tz, deps.tz) }); } catch (e) { return send(400, { error: e.message }); }
  const id = pushId(deps.now().getTime());
  await deps.insert({ path: ['users', target.id, 'drinks', id], value: drink });
  console.log(`[drinks] ${user.uid} added a drink for ${target.id === user.uid ? 'themselves' : target.id} (${drink.type})`);
  return send(200, { ok: true, id, drink, for: { id: target.id, name: target.name } });
}
