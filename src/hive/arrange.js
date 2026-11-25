/**
 * How this device's home screen is arranged, as plain functions with no
 * React (arrange.test.js). Saved per device under `hive.home`.
 *
 *   { v: 3, pinned: appId[], hidden: appId[], off: sectionId[], custom: { [appId]: { name?, color?, glyph? } } }
 *
 *   pinned  apps kept first in the app list, and in the bar at the bottom of a phone
 *   hidden  apps tucked under "Hidden apps" (search still finds them)
 *   off     parts of the day the home screen leaves out
 *   custom  your name, colour and symbol for an app
 *
 * Version 2 was the old icon grid (`hive.layout`): its dock becomes the
 * pinned apps, apps that weren't on it become hidden, and custom icons carry
 * over. Its folders and widget sizes have no equivalent and are dropped.
 */
export const PIN_MAX = 4;

/** Parts of the day, in the order they show. */
export const SECTIONS = {
  line: 'Day line',
  chores: 'Chores',
  tasks: 'To do',
  shopping: 'Shopping',
  herd: 'Herd',
  tonight: 'Tonight’s dinner',
  ahead: 'Coming up',
};
export const sectionIds = Object.keys(SECTIONS);

export const defaultArrangement = () => ({ v: 3, pinned: ['board', 'kitchenhub', 'galaxyfarm', 'wander'], hidden: [], off: [], custom: {} });

const uniq = (list, ok) => [...new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && ok(x)))];

function cleanCustom(custom, appIds) {
  const out = {};
  for (const [id, c] of Object.entries(custom && typeof custom === 'object' ? custom : {})) {
    if (appIds.includes(id) && c && typeof c === 'object') out[id] = c;
  }
  return out;
}

/** Apps an old (v1/v2) layout had anywhere: grid, dock or a folder. */
function placedInOld(old) {
  const out = new Set();
  for (const i of [...(old.grid || []), ...(old.dock || [])]) {
    if (i?.k === 'app') out.add(i.key);
    if (i?.k === 'folder' && Array.isArray(i.apps)) i.apps.forEach((a) => out.add(a));
  }
  return out;
}

/** The old icon grid's layout, turned into an arrangement. */
export function fromOldLayout(old, appIds) {
  if (!old || ![1, 2].includes(old.v) || !Array.isArray(old.grid) || !Array.isArray(old.dock)) return null;
  const placed = placedInOld(old);
  const pinned = uniq(old.dock.filter((i) => i?.k === 'app').map((i) => i.key), (k) => appIds.includes(k)).slice(0, PIN_MAX);
  return {
    v: 3,
    pinned,
    hidden: appIds.filter((id) => !placed.has(id) && id !== 'settings'),
    off: [],
    custom: cleanCustom(old.custom, appIds),
  };
}

/** A stored arrangement, made safe: unknown apps and sections dropped, nothing twice. */
export function normalize(stored, appIds, old = null) {
  if (!stored || stored.v !== 3) return fromOldLayout(old, appIds) || defaultArrangement();
  const pinned = uniq(stored.pinned, (k) => appIds.includes(k)).slice(0, PIN_MAX);
  return {
    v: 3,
    pinned,
    hidden: uniq(stored.hidden, (k) => appIds.includes(k) && !pinned.includes(k)),
    off: uniq(stored.off, (k) => sectionIds.includes(k)),
    custom: cleanCustom(stored.custom, appIds),
  };
}

const without = (list, id) => list.filter((x) => x !== id);

export function pin(a, id) {
  if (a.pinned.includes(id) || a.pinned.length >= PIN_MAX) return a;
  return { ...a, pinned: [...a.pinned, id], hidden: without(a.hidden, id) };
}
export const unpin = (a, id) => ({ ...a, pinned: without(a.pinned, id) });

/** Move a pinned app one place earlier (-1) or later (+1). */
export function movePin(a, id, by) {
  const i = a.pinned.indexOf(id), j = i + by;
  if (i < 0 || j < 0 || j >= a.pinned.length) return a;
  const pinned = [...a.pinned];
  [pinned[i], pinned[j]] = [pinned[j], pinned[i]];
  return { ...a, pinned };
}

export const hide = (a, id) => (a.hidden.includes(id) ? a : { ...a, hidden: [...a.hidden, id], pinned: without(a.pinned, id) });
export const show = (a, id) => ({ ...a, hidden: without(a.hidden, id) });

export const setSection = (a, key, on) => ({ ...a, off: on ? without(a.off, key) : [...new Set([...a.off, key])] });
export const sectionOn = (a, key) => !a.off.includes(key);

/**
 * Change an app's name, colour or symbol. `patch` keys: name, color, glyph (an
 * empty value clears that one); `null` puts the icon back to its default.
 */
export function setCustom(a, appId, patch) {
  const custom = { ...(a.custom || {}) };
  if (patch === null) { delete custom[appId]; return { ...a, custom }; }
  const next = { ...(custom[appId] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (!['name', 'color', 'glyph'].includes(k)) continue;
    const val = typeof v === 'string' ? v.trim().slice(0, 40) : '';
    if (val) next[k] = val; else delete next[k];
  }
  if (Object.keys(next).length) custom[appId] = next; else delete custom[appId];
  return { ...a, custom };
}
