/**
 * Ticking off the egg round opens GalaxyFarm's egg count.
 *
 * GalaxyFarm decides which chore is the egg round (its board API sends
 * `eggs: true` on it), so the fridge board, Hive's widget and GalaxyFarm's own
 * screens all follow one rule. The egg count opens inside Hive's frame at
 * EGG_COUNT_PATH; once the count is logged GalaxyFarm posts `hive:close` and
 * Hive goes back home (see `bridge.js`).
 */

/** GalaxyFarm's egg count, in its "opened from Hive" mode. */
export const EGG_COUNT_PATH = '/kiosk/eggs?from=hive';

/** Window event that asks Hive to open the egg count. */
export const OPEN_EGG_COUNT = 'hive:open-egg-count';

/**
 * Whether a tick should open the egg count: the egg round, on the way to done,
 * ticked in GalaxyFarm itself (`live`). A sample-mode tick never reaches
 * GalaxyFarm, so there is nothing there to count against.
 */
export function opensEggCount(chore, wasDone, live) {
  return live && !wasDone && chore?.eggs === true;
}

/** Ask Hive to open the egg count. */
export const openEggCount = () => window.dispatchEvent(new Event(OPEN_EGG_COUNT));
