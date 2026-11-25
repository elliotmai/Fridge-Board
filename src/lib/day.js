import { dedupeEvents, mergeTodos, minutesOf, timeline } from './agenda.js';
import { SLOTS, nextBreeding, tripState } from './derive.js';
import { daysBetween, startOf } from './dates.js';

/*
 * The household's day, worked out from the board feed for Hive's home
 * screen: what's happening now, what's next, and what needs someone.
 * Plain functions, no React (day.test.js).
 */

export const OPTS = { window: 30, breedWindow: 30, awayMiles: 75 };

/** The day line runs from 5 am to midnight. Chore slots fill it end to end. */
export const DAY_FROM = 5 * 60;
export const DAY_TO = 24 * 60;
const SLOT_ORDER = ['morning', 'midday', 'evening', 'night'];
const SLOT_FROM = { morning: DAY_FROM, midday: 11 * 60, evening: 14 * 60, night: 20 * 60 };

const minsOf = (d) => d.getHours() * 60 + d.getMinutes();
const deadline = (slot) => (SLOTS[slot] ? SLOTS[slot][1] * 60 : 0); // unknown or "owed": due already

/** The chore slot we're in: the first whose deadline hasn't passed. */
export function currentSlot(now) {
  const m = minsOf(now);
  return SLOT_ORDER.find((k) => deadline(k) > m) || 'night';
}

/**
 * Chores that need doing by the end of the current slot (and any left from
 * earlier ones, which are late). Done ones from those slots stay, ticked, so
 * a tick can be undone where it was made.
 */
export function choresNow(chores = [], now) {
  const slot = currentSlot(now);
  const by = deadline(slot);
  const m = minsOf(now);
  const inScope = chores.filter((c) => deadline(c.slot) <= by);
  const rows = inScope
    .map((c) => ({ ...c, late: !c.done && (c.slot === 'owed' || (!!SLOTS[c.slot] && deadline(c.slot) <= m)) }))
    .sort((a, b) => Number(a.done) - Number(b.done) || Number(b.late) - Number(a.late) || deadline(a.slot) - deadline(b.slot));
  const later = chores.filter((c) => !c.done && deadline(c.slot) > by);
  return {
    slot,
    by,
    rows,
    left: rows.filter((c) => !c.done).length,
    later: later.length,
    laterSlot: later.length ? SLOT_ORDER.find((k) => later.some((c) => c.slot === k)) : null,
    allDone: chores.length > 0 && chores.every((c) => c.done),
  };
}

/** Tasks due today or overdue (LearnLeaf and Google), done ones last. */
export function tasksNow({ tasks = [], subjects = {}, gtasks = [], todosDone = [] }, now) {
  const done = new Set(todosDone);
  return mergeTodos({ learnleaf: tasks, subjects, google: gtasks }, now)
    .filter((t) => t.n != null && t.n <= 0)
    .map((t) => ({ ...t, done: done.has(t.key), late: t.n < 0 }))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.n - b.n);
}

/** Tonight's dinner and the next few after it. */
export function dinners(meals = []) {
  const week = meals.filter((m) => m.type === 'Dinner' && m.d >= 0 && m.d < 7).sort((a, b) => a.d - b.d);
  return { tonight: week.find((m) => m.d === 0) || null, after: week.filter((m) => m.d > 0).slice(0, 3) };
}

/** Shopping still to buy; `tonight` is what tonight's dinner is waiting on. */
export function shoppingNow(shopping = []) {
  const left = shopping.filter((i) => !i.bought);
  return { left, tonight: left.filter((i) => /^tonight$/i.test(String(i.why || '').trim())) };
}

/**
 * Herd alerts from ZNT: a breeding step today or tomorrow, and any clash with
 * a trip away. Null when nothing is close.
 */
export function herdAlert(data, now) {
  const ts = tripState(data.trips || [], data.home, now, OPTS);
  const b = nextBreeding(data.sessions || [], ts, now, OPTS);
  if (!b) return null;
  const today = startOf(now);
  const steps = [['CIDRs in', b.cidr], ['Lutalyse', b.lut], ['Breeding starts', b.b1], ['Breeding ends', b.b2]]
    .map(([label, date]) => ({ label, date, n: daysBetween(today, date) }));
  const close = steps.filter((s) => s.n === 0 || s.n === 1);
  if (!close.length && !b.clash.length) return null;
  return { name: b.name, head: b.head, steps: close, clash: b.clash };
}

/** Food to use in the next two days. */
export const useSoon = (expiring = []) => expiring.filter((x) => x.days <= 2).sort((a, b) => a.days - b.days);

const SECTION_NAMES = { chores: 'GalaxyFarm', meals: 'KitchenHub', shopping: 'KitchenHub', tasks: 'LearnLeaf', trips: 'Wander', breeding: 'ZNT', calendar: 'Google Calendar', weather: 'Weather' };

/** Apps whose feed couldn't be reached, once each, for one quiet line. */
export function notUpdating(status = {}) {
  return [...new Set(Object.entries(status).filter(([, s]) => s?.status === 'stale').map(([k]) => SECTION_NAMES[k] || k))];
}

/** Today's calendar events (trips that are also on the calendar show once). */
function todaysEvents(data, now) {
  const today = startOf(now);
  return dedupeEvents(data.events || [], data.trips || []).shown.filter((e) => {
    const s = new Date(e.allDay ? `${e.start}T00:00` : e.start);
    return daysBetween(today, s) === 0;
  });
}

/**
 * The day line: chore slots end to end from 5 am to midnight, with today's
 * timed events and tasks pinned where they happen, and where now is.
 */
export function dayLine(data, now) {
  const chores = data.chores || [];
  const slots = SLOT_ORDER.map((k, i) => {
    const mine = chores.filter((c) => c.slot === k);
    return {
      key: k, label: SLOTS[k][0], from: SLOT_FROM[k], to: SLOT_ORDER[i + 1] ? SLOT_FROM[SLOT_ORDER[i + 1]] : DAY_TO,
      left: mine.filter((c) => !c.done).length, total: mine.length,
    };
  });
  const pins = [];
  for (const e of todaysEvents(data, now)) {
    if (e.allDay) continue;
    const s = new Date(e.start), en = new Date(e.end || e.start);
    pins.push({ key: `ev:${e.id}`, kind: 'event', at: minsOf(s), until: daysBetween(startOf(now), en) === 0 ? minsOf(en) : DAY_TO, title: e.title, event: e });
  }
  for (const t of tasksNow(data, now)) {
    const at = minutesOf(t.time);
    if (t.n === 0 && at != null && !t.done) pins.push({ key: t.key, kind: 'task', at, until: at, title: t.name, task: t });
  }
  pins.sort((a, b) => a.at - b.at);
  return { from: DAY_FROM, to: DAY_TO, now: Math.min(DAY_TO, Math.max(DAY_FROM, minsOf(now))), slots, pins };
}

/**
 * The one thing to read from across the room: what's happening now, or the
 * next thing today. `{ kind: 'now' | 'next', title, at, until, ... }` or null.
 */
export function upNext(data, now) {
  const m = minsOf(now);
  const pins = dayLine(data, now).pins;
  const happening = pins.find((p) => p.kind === 'event' && p.at <= m && m < p.until);
  if (happening) return { ...happening, when: 'now' };
  const next = pins.find((p) => p.at > m);
  const chores = choresNow(data.chores, now);
  // The end of this chore slot counts as a "next" when chores are still left in it.
  const choreDue = chores.left > 0 && chores.by > m ? { key: 'chores', kind: 'chores', at: chores.by, title: `${chores.left} chore${chores.left === 1 ? '' : 's'} to finish` } : null;
  const pick = [next, choreDue].filter(Boolean).sort((a, b) => a.at - b.at)[0];
  return pick ? { ...pick, when: 'next' } : null;
}

/** Coming up after today, by day (tasks, calendar, trips, breeding): agenda.js `timeline`. */
export function comingUp(data, now, horizon = 10) {
  const todos = mergeTodos({ learnleaf: data.tasks || [], subjects: data.subjects || {}, google: data.gtasks || [] }, now);
  const ts = tripState(data.trips || [], data.home, now, OPTS);
  const breeding = nextBreeding(data.sessions || [], ts, now, OPTS);
  const { shown } = dedupeEvents(data.events || [], data.trips || []);
  const tl = timeline({ todos, events: shown, trips: ts.all, breeding }, now, { horizon });
  const m = minsOf(now);
  // Today: only what hasn't finished yet; tasks due today are under "Needs someone".
  const days = tl.days
    .map((d) => (d.n !== 0 ? d : { ...d, items: d.items.filter((i) => i.kind !== 'task' && !(i.kind === 'event' && !i.event.allDay && minsOf(new Date(i.event.end || i.event.start)) <= m)) }))
    .map((d) => ({ ...d, items: d.items.filter((i) => i.kind !== 'task' || !(data.todosDone || []).includes(i.key)) }))
    .filter((d) => d.items.length);
  return { days, later: tl.later };
}
