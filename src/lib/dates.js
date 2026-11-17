export const DAY = 864e5;
export const startOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
/** Sample dates are anchored to the real today, so "pretend today" moves through them. */
export const dayFrom = (n) => new Date(startOf(new Date()).getTime() + n * DAY);
export const daysBetween = (a, b) => Math.round((startOf(b) - startOf(a)) / DAY);
export const fmt = (d, o) => d.toLocaleDateString(undefined, o);
export const wd = (d) => fmt(d, { weekday: 'short' });
export const md = (d) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
export const short = (d) => fmt(d, { month: 'short', day: 'numeric' });
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const nextWed = (d) => { const x = startOf(d); while (x.getDay() !== 3) x.setDate(x.getDate() + 1); return x; };
/** Local date as YYYY-MM-DD. */
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** YYYY-MM-DD as a local date (midnight), not UTC. */
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** "21:00" → "9 PM", "09:30" → "9:30 AM". */
export const clock12 = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
