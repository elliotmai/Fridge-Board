/**
 * The home screen layout and every change to it, as plain functions with no
 * React, so they can be tested on their own (layout.test.js).
 *
 *   { v: 1, grid: Item[], dock: Item[] }
 *
 *   Item = { k: 'app', key: 'kitchenhub' }
 *        | { k: 'widget', key: 'w:chores', w: 'chores' }
 *        | { k: 'folder', key: 'f:1', name: 'Farm', apps: ['galaxyfarm', 'znt'] }
 *
 * An app is in at most one place. Apps that are nowhere are in the App Library
 * (the Add sheet). Folders hold apps only; the dock holds apps only.
 */
export const DOCK_MAX = 4;

const app = (key) => ({ k: 'app', key });
const widget = (w) => ({ k: 'widget', key: `w:${w}`, w });
const folder = (key, name, apps) => ({ k: 'folder', key, name, apps });

export function defaultLayout() {
  return {
    v: 1,
    grid: [
      widget('today'), widget('chores'), widget('calendar'),
      folder('f:farm', 'Farm', ['galaxyfarm', 'znt', 'cattlegraph']),
      app('letseat'), app('pool'), app('property'),
      app('ourden'), app('journal'), app('sidequest'), app('aerologger'),
      folder('f:health', 'Health', ['stimultrack', 'alcohol']),
      app('muster'), app('feedback'),
      widget('tasks'), widget('dinner'), widget('trip'), widget('shopping'), widget('breeding'),
    ],
    dock: [app('board'), app('kitchenhub'), app('wander'), app('learnleaf')],
  };
}

/** Apps that are on the home screen anywhere: grid, dock or a folder. */
export function placedApps(layout) {
  const out = new Set();
  for (const i of [...layout.grid, ...layout.dock]) {
    if (i.k === 'app') out.add(i.key);
    if (i.k === 'folder') i.apps.forEach((a) => out.add(a));
  }
  return out;
}

export const placedWidgets = (layout) => new Set(layout.grid.filter((i) => i.k === 'widget').map((i) => i.w));

/** Find an item by key, including an app inside a folder. */
export function locate(layout, key) {
  for (const zone of ['grid', 'dock']) {
    const index = layout[zone].findIndex((i) => i.key === key);
    if (index >= 0) return { zone, index, item: layout[zone][index] };
    const fi = layout[zone].findIndex((i) => i.k === 'folder' && i.apps.includes(key));
    if (fi >= 0) return { zone, index: fi, item: app(key), folder: layout[zone][fi] };
  }
  return null;
}

const clone = (l) => ({ ...l, grid: l.grid.map((i) => (i.k === 'folder' ? { ...i, apps: [...i.apps] } : i)), dock: [...l.dock] });

/** A folder left with one app turns back into that app, in the same spot. */
function tidy(l) {
  for (const zone of ['grid', 'dock']) {
    l[zone] = l[zone]
      .map((i) => (i.k === 'folder' && i.apps.length === 1 ? app(i.apps[0]) : i))
      .filter((i) => i.k !== 'folder' || i.apps.length > 0);
  }
  return l;
}

/** Take an item out wherever it is. Returns [layout, item]. Folders tidy up after. */
function detach(layout, key) {
  const l = clone(layout);
  const at = locate(l, key);
  if (!at) return [l, null];
  if (at.folder) {
    const f = l[at.zone][at.index];
    l[at.zone][at.index] = { ...f, apps: f.apps.filter((a) => a !== key) };
    return [l, at.item];
  }
  l[at.zone].splice(at.index, 1);
  return [l, at.item];
}

/**
 * Move an item to `index` in `zone`. Index is counted in the zone as it looks
 * once the item is gone, which is what a drop target shows.
 * Widgets and folders can't go in the dock; a full dock refuses new apps.
 */
export function move(layout, key, zone, index) {
  const from = locate(layout, key);
  if (!from) return layout;
  if (zone === 'dock') {
    if (from.item.k !== 'app') return layout;
    if (from.zone !== 'dock' && layout.dock.length >= DOCK_MAX) return layout;
  }
  const [l, item] = detach(layout, key);
  const list = l[zone];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, item);
  return tidy(l);
}

/**
 * Drop app `key` onto `targetKey`: onto an app makes a folder in the target's
 * spot, onto a folder adds it to the end. Anything else is ignored.
 */
export function merge(layout, key, targetKey, nameFor = () => 'Folder') {
  if (key === targetKey) return layout;
  const from = locate(layout, key);
  const to = locate(layout, targetKey);
  if (!from || !to || from.item.k !== 'app' || to.folder) return layout;
  if (to.item.k === 'widget') return layout;
  if (to.item.k === 'folder' && to.item.apps.includes(key)) return layout;
  const [l] = detach(layout, key);
  const at = locate(l, targetKey);
  const target = l[at.zone][at.index];
  if (target.k === 'folder') {
    l[at.zone][at.index] = { ...target, apps: [...target.apps, key] };
  } else {
    l[at.zone][at.index] = folder(`f:${Date.now().toString(36)}`, nameFor(targetKey, key), [targetKey, key]);
  }
  // A folder can't live in the dock: move it to the start of the grid.
  if (at.zone === 'dock' && l.dock[at.index].k === 'folder') {
    const [f] = l.dock.splice(at.index, 1);
    l.grid.unshift(f);
  }
  return tidy(l);
}

/** Off the home screen: apps go back to the App Library, widgets go away. */
export function remove(layout, key) {
  return tidy(detach(layout, key)[0]);
}

/** Take an app out of its folder and put it just after the folder. */
export function takeOut(layout, appKey) {
  const at = locate(layout, appKey);
  if (!at?.folder) return layout;
  const zone = at.zone === 'dock' ? 'grid' : at.zone;
  const [l] = detach(layout, appKey);
  l[zone].splice(at.zone === 'dock' ? l[zone].length : at.index + 1, 0, app(appKey));
  return tidy(l);
}

export function rename(layout, folderKey, name) {
  const l = clone(layout);
  l.grid = l.grid.map((i) => (i.key === folderKey ? { ...i, name: name.trim() || 'Folder' } : i));
  return l;
}

export function addApp(layout, key) {
  if (placedApps(layout).has(key)) return layout;
  return { ...layout, grid: [...layout.grid, app(key)] };
}

export function addWidget(layout, w) {
  if (placedWidgets(layout).has(w)) return layout;
  return { ...layout, grid: [widget(w), ...layout.grid] };
}

/**
 * Make a stored layout safe to use: drop apps and widgets that no longer
 * exist, and any app that shows up twice. Anything unreadable starts fresh.
 */
export function normalize(stored, appIds, widgetIds) {
  if (!stored || stored.v !== 1 || !Array.isArray(stored.grid) || !Array.isArray(stored.dock)) return defaultLayout();
  const seen = new Set();
  const okApp = (k) => appIds.includes(k) && !seen.has(k) && seen.add(k);
  const clean = (list, inDock) => list.flatMap((i) => {
    if (i?.k === 'app') return okApp(i.key) ? [app(i.key)] : [];
    if (inDock) return [];
    if (i?.k === 'widget') return widgetIds.includes(i.w) && !seen.has(i.key) && seen.add(i.key) ? [widget(i.w)] : [];
    if (i?.k === 'folder' && Array.isArray(i.apps)) {
      const apps = i.apps.filter(okApp);
      return apps.length ? [folder(String(i.key), String(i.name || 'Folder'), apps)] : [];
    }
    return [];
  });
  const dock = clean(stored.dock, true).slice(0, DOCK_MAX);
  return tidy({ v: 1, grid: clean(stored.grid, false), dock });
}
