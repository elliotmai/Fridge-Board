/**
 * What one board section shows (src/data/sources.js), decided without the
 * browser so it can be tested. The rule that matters: signed in, a section
 * shows your data, an honest empty or "Couldn't reach" state, or why it's off,
 * and never the sample.
 */

/** Each source's name for "Couldn't reach …". */
export const SOURCE_NAMES = { galaxyfarm: 'GalaxyFarm', kitchenhub: 'KitchenHub', weather: 'the weather service', learnleaf: 'LearnLeaf', wander: 'Wander', znt: 'ZNT', google: 'Google' };

/**
 * `ctx`: samples (signed out: samples may show), demo, locked (the 401
 * reason, if any), readCache(key) / writeCache(key, value) for the last good
 * copy, kept per person.
 */
export function pickSection(feed, key, { sample: shown, empty }, ctx) {
  if (ctx.demo) return { data: shown, status: 'sample', reason: 'Demo' };
  const src = feed?.sources?.[key];
  if (src?.status === 'live') { ctx.writeCache?.(key, { at: feed.generatedAt, data: src.data }); return { data: src.data, status: 'live' }; }
  const name = SOURCE_NAMES[key] || key;
  const unreachable = src?.status === 'error' || (!feed && !ctx.locked);
  const cached = unreachable ? ctx.readCache?.(key) : null;
  const reason = src?.status === 'error' ? `Couldn’t reach ${name}` : !feed && !ctx.locked ? 'Couldn’t reach Hive' : src?.reason || ctx.locked || 'Not connected';
  if (cached) return { data: cached.data, status: 'stale', reason, at: cached.at };
  if (ctx.samples) return { data: shown, status: 'sample', reason: src?.reason || ctx.locked || reason };
  if (unreachable) return { data: empty, status: 'error', reason, source: name };
  return { data: empty, status: 'off', reason, source: name, connect: src?.status === 'connect' ? 'google' : null };
}
