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
export function mergeTodos({ learnleaf = [], subjects = {}, google = [] }, now) {
  const today = startOf(now);
  const dated = [];
  const undated = [];
  for (const t of learnleaf) {
    if (!t.due) continue;
    const [subject, color] = subjects[t.subject] ?? ['No subject', 'var(--muted)'];
    dated.push({ key: `ll:${t.id}`, source: 'learnleaf', id: t.id, name: t.name, due: parseDate(t.due), time: t.time || '', color, tag: subject });
  }
  for (const t of google) {
    const row = { key: `g:${t.list}:${t.id}`, source: 'google', id: t.id, list: t.list, name: t.title, time: '', color: 'var(--ahead)', tag: t.listTitle || 'Google Tasks' };
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
