import { daysBetween, parseDate, startOf } from './dates.js';

/*
 * The fridge's to-do list and calendar, as plain functions (agenda.test.js).
 */

const DAY_MS = 864e5;
const WEEK = 7;

/**
 * LearnLeaf tasks and Google Tasks as one list. Each row:
 *   { key, source: 'learnleaf'|'google', id, list?, name, due, n, time, color, tag }
 * Dated tasks due within a week (or overdue) come first, soonest first.
 * Google tasks with no date follow, since many Google tasks never get one.
 */
/** On a household screen, whose it is (`who`: an initial, `whoName`); nothing otherwise. */
const whoOf = (t) => (t.who ? { who: t.who, whoName: t.whoName || '' } : {});

export function mergeTodos({ learnleaf = [], subjects = {}, google = [] }, now) {
  const today = startOf(now);
  const dated = [];
  const undated = [];
  for (const t of learnleaf) {
    if (!t.due) continue;
    const [subject, color] = subjects[t.subject] ?? ['No subject', 'var(--muted)'];
    dated.push({ key: `ll:${t.id}`, source: 'learnleaf', id: t.id, name: t.name, due: parseDate(t.due), time: t.time || '', color, tag: subject, ...whoOf(t) });
  }
  for (const t of google) {
    const row = { key: `g:${t.list}:${t.id}`, source: 'google', id: t.id, list: t.list, name: t.title, time: '', color: 'var(--ahead)', tag: t.listTitle || 'Google Tasks', ...whoOf(t) };
    if (t.due) dated.push({ ...row, due: parseDate(t.due) });
    else undated.push({ ...row, due: null, n: null });
  }
  const soon = dated
    .map((t) => ({ ...t, n: daysBetween(today, t.due) }))
    .filter((t) => t.n <= WEEK)
    .sort((a, b) => a.n - b.n || (a.time || '99').localeCompare(b.time || '99') || a.name.localeCompare(b.name));
  return [...soon, ...undated];
}

/** An event's first and last day, as local midnights. All-day end dates from Google are exclusive. */
export function eventDays(e) {
  if (e.allDay) {
    const start = parseDate(e.start);
    const endEx = parseDate(e.end || e.start);
    const last = new Date(Math.max(start.getTime(), endEx.getTime() - DAY_MS));
    return { first: start, last: startOf(last) };
  }
  const s = new Date(e.start), en = new Date(e.end || e.start);
  // An event ending exactly at midnight belongs to the day before.
  const lastInstant = en > s ? new Date(en.getTime() - 1) : s;
  return { first: startOf(s), last: startOf(lastInstant) };
}

const STOP = new Set(['the', 'and', 'for', 'with', 'trip', 'flight', 'flights', 'stay', 'hotel', 'from', 'drive', 'travel', 'vacation', 'weekend', 'day', 'days', 'our', 'your', 'reservation', 'booking', 'check', 'arrive', 'depart', 'return']);
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
/** "AA 3521", "AA3521", "UA 12" → "aa3521" */
const flightCodes = (s) => [...String(s || '').toLowerCase().matchAll(/\b([a-z]{2}|[a-z]\d|\d[a-z])\s?(\d{1,4})\b/g)].map((m) => m[1] + m[2]);

function tripKeys(t) {
  const keys = new Set([...words(t.name), ...words(t.dest)]);
  const codes = new Set();
  for (const i of t.items || []) {
    words(i.title).forEach((w) => keys.add(w));
    flightCodes(i.title).forEach((c) => codes.add(c));
    flightCodes(i.route).forEach((c) => codes.add(c));
  }
  return { keys, codes };
}

/**
 * Calendar events that are really a Wander trip (or one of its flights or
 * stays) are hidden, since the trip already shows under Travel. An event
 * counts as the trip when it falls within the trip's dates (a day either side)
 * and either:
 *   - shares a flight number with one of the trip's flights, or
 *   - shares a word with the trip's name, destination, or a flight or stay, or
 *   - is an all-day event spanning the trip's dates (a day either side).
 * Returns { shown, hidden: [{ event, tripId }] }.
 */
export function dedupeEvents(events, trips) {
  const prepared = trips.map((t) => ({ t, first: parseDate(t.startDate), last: parseDate(t.endDate), ...tripKeys(t) }));
  const shown = [], hidden = [];
  for (const e of events) {
    const { first, last } = eventDays(e);
    const ew = new Set(words(e.title));
    const ec = new Set([...flightCodes(e.title), ...flightCodes(e.location)]);
    const match = prepared.find(({ t, first: tf, last: tl, keys, codes }) => {
      const within = daysBetween(tf, first) >= -1 && daysBetween(last, tl) >= -1;
      if (!within) return false;
      if ([...ec].some((c) => codes.has(c))) return true;
      if ([...ew].some((w) => keys.has(w))) return true;
      const spansTrip = e.allDay && Math.abs(daysBetween(tf, first)) <= 1 && Math.abs(daysBetween(tl, last)) <= 1 && daysBetween(first, last) >= 1;
      return spansTrip && !!t;
    });
    if (match) hidden.push({ event: e, tripId: match.t.id });
    else shown.push(e);
  }
  return { shown, hidden };
}

/**
 * Events from today for `days` days, grouped by day: [{ date, n, events }].
 * A multi-day event shows on each day it covers; timed events sort first by time.
 */
export function agendaDays(events, now, days = WEEK) {
  const today = startOf(now);
  const out = [];
  for (let n = 0; n < days; n++) {
    const date = new Date(today); date.setDate(today.getDate() + n);
    const todays = events
      .filter((e) => { const { first, last } = eventDays(e); return first <= date && date <= last; })
      .map((e) => ({ ...e, continued: daysBetween(eventDays(e).first, date) > 0 }))
      .sort((a, b) => (a.allDay === b.allDay ? String(a.start).localeCompare(String(b.start)) : a.allDay ? -1 : 1));
    if (todays.length) out.push({ date, n, events: todays });
  }
  return out;
}

/* ------------------------------------------------------------ timeline --- */

/** "6:10 AM", "18:30", "9 pm" → minutes after midnight, or null. */
export function minutesOf(t) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?\s*$/i.exec(String(t || ''));
  if (!m) return null;
  let h = +m[1] % 24;
  const min = +(m[2] || 0);
  if (m[3]) h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0);
  return h * 60 + min;
}
const minutesOfIso = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const plusDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/**
 * Everything coming up, in one list: tasks, calendar events, trips and the
 * next breeding group, grouped by day.
 *
 *   overdue   tasks past due
 *   days      [{ date, n, away, items }] from today for `horizon` days (longer if a
 *             trip or breeding run starting inside it runs past), days with nothing left out
 *   later     trips and breeding beyond the horizon (within their own windows)
 *   anytime   tasks with no date
 *
 * Item kinds: task, event, trip-start, trip-now (under way), trip-end, leg, stay, breed.
 * trip-start/now/end only for away trips (`far`); legs and stays are already only yours. Within a day:
 * all-day things first (trips, breeding, all-day events), then by time, then
 * untimed tasks.
 */
/** A trip close to home shows only its legs and stays; one with none of yours doesn't show. */
const shows = (t) => t.far || (t.items || []).some((i) => i.date);

export function timeline({ todos = [], events = [], trips = [], breeding = null }, now, { horizon = 14 } = {}) {
  const today = startOf(now);
  // Two weeks, stretched so a trip or breeding run that starts inside it is shown whole.
  let end = plusDays(today, horizon - 1);
  const firstEnd = end;
  for (const t of trips) { const s = parseDate(t.startDate), f = parseDate(t.endDate); if (shows(t) && s <= firstEnd && f > end) end = f; }
  if (breeding && breeding.cidr <= firstEnd && breeding.b2 > end) end = startOf(breeding.b2);
  const items = [];
  const put = (date, item) => { if (date >= today && date <= end) items.push({ ...item, date: startOf(date) }); };

  for (const t of todos) if (t.n != null && t.n >= 0) put(t.due, { kind: 'task', key: t.key, at: minutesOf(t.time), task: t });

  for (const e of events) {
    const { first, last } = eventDays(e);
    for (let d = new Date(Math.max(first, today)); d <= last && d <= end; d = plusDays(d, 1)) {
      const continued = daysBetween(first, d) > 0;
      put(d, { kind: 'event', key: `ev:${e.id}:${daysBetween(today, d)}`, at: e.allDay || continued ? -1 : minutesOfIso(e.start), event: e, continued });
    }
  }

  const later = [];
  const away = new Map(); // day number → destination
  for (const t of trips) {
    const s = parseDate(t.startDate), f = parseDate(t.endDate);
    if (f < today || !shows(t)) continue;
    if (s > firstEnd) { later.push({ kind: 'trip', key: `trip:${t.id}`, date: s, n: daysBetween(today, s), trip: t }); continue; }
    // Leaving and coming back only for an away trip; a trip close to home is just its activities.
    if (t.far) {
      if (s < today) put(today, { kind: 'trip-now', key: `tn:${t.id}`, at: -2, trip: t });
      else put(s, { kind: 'trip-start', key: `ts:${t.id}`, at: -2, trip: t });
      if (daysBetween(s, f) > 0) put(f, { kind: 'trip-end', key: `te:${t.id}`, at: 24 * 60, trip: t });
    }
    if (t.far) for (let d = new Date(Math.max(s, today)); d <= f && d <= end; d = plusDays(d, 1)) away.set(daysBetween(today, d), (t.dest || t.name).split(',')[0]);
    (t.items || []).forEach((i, n) => {
      if (!i.date) return;
      const kind = i.kind === 'stay' ? 'stay' : 'leg';
      put(parseDate(i.date), { kind, key: `it:${t.id}:${n}`, at: kind === 'stay' ? -1 : minutesOf(i.time) ?? -1, leg: i, trip: t });
    });
  }

  if (breeding) {
    const b = breeding;
    const steps = [['CIDRs in', b.cidr, 'cidr'], ['Lutalyse', b.lut, 'lut'], ['Breeding starts', b.b1, 'b1'], ['Breeding ends', b.b2, 'b2']];
    if (b.cidr > firstEnd) later.push({ kind: 'breed', key: 'breed', date: b.cidr, n: daysBetween(today, b.cidr), breeding: b });
    else for (const [label, date, step] of steps) put(date, { kind: 'breed', key: `br:${step}`, at: -1, label, step, breeding: b });
  }

  const rank = (i) => (i.at == null ? 1e6 : i.at);
  const days = [];
  for (let n = 0; n <= daysBetween(today, end); n++) {
    const date = plusDays(today, n);
    const its = items.filter((i) => daysBetween(today, i.date) === n).sort((a, b) => rank(a) - rank(b));
    if (its.length) days.push({ date, n, away: away.get(n) || null, items: its });
  }
  return {
    overdue: todos.filter((t) => t.n != null && t.n < 0),
    days,
    later: later.sort((a, b) => a.n - b.n),
    anytime: todos.filter((t) => t.n == null),
  };
}
