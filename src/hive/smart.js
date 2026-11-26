/**
 * What matters right now, for stacks that turn by themselves and the line
 * under the clock. Plain functions over a few facts about the household's day
 * (`signals` in widgets.jsx gathers them), so they can be tested (smart.test.js).
 *
 *   s = { hour, choresLeft, toBuy, due, overdue,
 *         nextEvent: { title, mins, at } | null,   minutes from now, and the time as text
 *         dinner: 'Tacos' | null,                  tonight's dinner
 *         trip: { name, dest, until, current } | null,
 *         breedDays: n | null,                     days to the next CIDRs
 *         wx: { now, desc } | null }
 */

const between = (h, a, b) => h >= a && h < b;

/** How much a widget is worth showing now. Higher wins; 0 means it has nothing to say. */
export function score(w, s) {
  const h = s.hour;
  switch (w) {
    case 'chores': return s.choresLeft ? (h < 11 ? 6 : between(h, 16, 20) ? 4 : 2) : 0;
    case 'dinner': return s.dinner ? (between(h, 14, 20) ? 7 : h >= 11 ? 2 : 1) : 0.5;
    case 'shopping': return s.toBuy ? (between(h, 9, 18) ? 2.5 : 1) : 0.2;
    case 'tasks': return s.due ? (s.overdue ? 5 : between(h, 7, 17) ? 4 : 2) : 0.3;
    case 'calendar': return !s.nextEvent ? 1 : s.nextEvent.mins <= 120 ? 8 : s.nextEvent.mins < 1440 ? 3 : 1;
    case 'today': return between(h, 5, 9) ? 5 : 1.5;
    case 'trip': return !s.trip ? 0 : s.trip.current ? 4 : s.trip.until <= 2 ? 6 : s.trip.until <= 7 ? 2 : 0.5;
    case 'breeding': return s.breedDays != null && s.breedDays <= 3 ? 5 : 0.3;
    default: return 1;
  }
}

/** Which widget in a stack to show now: the highest score; the first on a tie. */
export function smartPick(widgets, s) {
  let best = 0;
  widgets.forEach((w, i) => { if (score(w, s) > score(widgets[best], s)) best = i; });
  return best;
}

/**
 * One short line for under the clock: the next thing that matters. Returns
 * { text, w } (the widget whose app it opens) or null when nothing does.
 */
export function glance(s) {
  const e = s.nextEvent;
  if (e && e.mins <= 180) return { text: e.mins <= 0 ? `${e.title}, now` : `${e.title} at ${e.at}`, w: 'calendar' };
  if (s.trip && !s.trip.current && s.trip.until <= 1) return { text: `Leaving for ${s.trip.dest || s.trip.name} ${s.trip.until === 0 ? 'today' : 'tomorrow'}`, w: 'trip' };
  if (s.hour >= 14 && s.dinner) return { text: `${s.dinner} tonight`, w: 'dinner' };
  if (s.hour < 12 && s.choresLeft) return { text: `${s.choresLeft} ${s.choresLeft === 1 ? 'chore' : 'chores'} left`, w: 'chores' };
  if (s.overdue) return { text: `${s.overdue} overdue`, w: 'tasks' };
  if (s.wx) return { text: `${s.wx.now}°${s.wx.desc ? `, ${s.wx.desc.toLowerCase()}` : ''}`, w: 'today' };
  return null;
}
