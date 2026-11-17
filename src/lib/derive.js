import { DAY, dayFrom, daysBetween, nextWed, startOf } from './dates';

export const SLOTS = { owed: ['Still owed', 0], morning: ['Morning', 11], midday: ['Midday', 14], evening: ['Evening', 20], night: ['Night', 24] };

export function miles(a, b) {
  const R = 3958.8, r = (x) => (x * Math.PI) / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Trips starting within the window (or under way), and whether we're away. */
export function tripState(trips, home, now, opts) {
  const today = startOf(now);
  const all = trips.map((t) => {
    const startD = dayFrom(t.start), endD = dayFrom(t.end), dist = miles(home, t);
    return { ...t, startD, endD, dist, far: dist > opts.awayMiles, current: today >= startD && today <= endD, until: daysBetween(today, startD) };
  });
  const shown = all.filter((t) => t.current || (t.until >= 0 && t.until <= opts.window)).sort((a, b) => a.startD - b.startD);
  return { all, shown, away: all.find((t) => t.current && t.far) || null };
}

/** The next breeding session, only if its CIDRs go in within the window (or it's under way). */
export function nextBreeding(sessions, ts, now, opts) {
  const today = startOf(now);
  const s = sessions
    .map((s) => {
      const cidr = nextWed(dayFrom(s.cidrFrom)), at = (n) => new Date(cidr.getTime() + n * DAY);
      return { ...s, cidr, lut: at(7), b1: at(9), b2: at(11), head: s.groups.reduce((n, g) => n + g[1], 0) };
    })
    .filter((s) => s.b2 >= today)
    .sort((a, b) => a.cidr - b.cidr)[0];
  if (!s || daysBetween(today, s.cidr) > opts.breedWindow) return null;
  const clash = ts.all
    .filter((t) => t.far && t.startD <= s.b2 && t.endD >= s.cidr)
    .map((t) => {
      const hit = [['CIDRs', s.cidr], ['Lutalyse', s.lut], ['breeding', s.b1]].filter(([, d]) => d >= t.startD && d <= t.endD).map((x) => x[0]);
      return hit.length ? `You'll be in ${t.dest.split(',')[0]} for ${hit.join(' and ')}` : null;
    })
    .filter(Boolean);
  return { ...s, clash };
}
