/*
 * Apps that say they are in use, so the idle return leaves them alone.
 *
 * Hive drifts back to the board after a quiet spell, judged by touches on
 * Hive's own page. Taps inside an app's frame never reach that page, so a
 * cook following KitchenHub's cook mode for 20 minutes looks, to Hive, like
 * nobody at all. An app in that state says so ({ type: 'hive:busy', busy })
 * and repeats it every minute; Hive keeps it on screen while the claim is
 * fresh. A claim lapses on its own a few minutes after the last one, so an
 * app that crashes or loses its page mid-cook can't pin the screen forever.
 */

/** A busy claim lasts this long unless it's renewed. */
export const BUSY_FOR_MS = 3 * 60 * 1000;

/** Record a claim: `busy` true renews it, false drops it. Returns the new map. */
export function markBusy(claims, id, busy, now = Date.now()) {
  const next = { ...claims };
  if (busy) next[id] = now + BUSY_FOR_MS;
  else delete next[id];
  return next;
}

/** Is this app's claim still fresh? */
export const isBusy = (claims, id, now = Date.now()) => !!id && (claims[id] ?? 0) > now;
