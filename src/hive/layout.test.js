import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addApp, defaultLayout, DOCK_MAX, locate, merge, move, normalize, pack, placedApps, placedWidgets, remove, rename, setCustom, setPageBreak, setStack, setWidgetSize, takeOut, unstack } from './layout.js';

const keys = (list) => list.map((i) => i.key);
const base = () => ({
  v: 1,
  grid: [{ k: 'widget', key: 'w:chores', w: 'chores' }, { k: 'app', key: 'a' }, { k: 'app', key: 'b' }, { k: 'app', key: 'c' }],
  dock: [{ k: 'app', key: 'd' }],
});

test('move reorders within the grid', () => {
  assert.deepEqual(keys(move(base(), 'c', 'grid', 1).grid), ['w:chores', 'c', 'a', 'b']);
});

test('move into and out of the dock', () => {
  const l = move(base(), 'a', 'dock', 0);
  assert.deepEqual(keys(l.dock), ['a', 'd']);
  assert.deepEqual(keys(l.grid), ['w:chores', 'b', 'c']);
  assert.deepEqual(keys(move(l, 'd', 'grid', 0).grid), ['d', 'w:chores', 'b', 'c']);
});

test('the dock refuses widgets and a fifth app', () => {
  const b = base();
  assert.equal(move(b, 'w:chores', 'dock', 0), b);
  assert.deepEqual(keys(move(base(), 'w:chores', 'dock', 0).dock), ['d']);
  let l = base();
  for (const k of ['a', 'b', 'c']) l = move(l, k, 'dock', 0);
  assert.equal(l.dock.length, DOCK_MAX);
  l = addApp(l, 'e');
  assert.equal(move(l, 'e', 'dock', 0).dock.length, DOCK_MAX);
});

test('dropping an app on an app makes a folder in its place', () => {
  const l = merge(base(), 'c', 'a', () => 'Farm');
  assert.deepEqual(keys(l.grid).length, 3);
  const f = l.grid[1];
  assert.equal(f.k, 'folder');
  assert.equal(f.name, 'Farm');
  assert.deepEqual(f.apps, ['a', 'c']);
});

test('dropping on a folder adds to it; widgets never join folders', () => {
  let l = merge(base(), 'c', 'a');
  l = merge(l, 'b', l.grid[1].key);
  assert.deepEqual(l.grid[1].apps, ['a', 'c', 'b']);
  assert.equal(merge(l, 'w:chores', l.grid[1].key), l);
  assert.equal(merge(l, 'd', 'w:chores'), l);
});

test('a folder down to one app turns back into the app', () => {
  let l = merge(base(), 'c', 'a');
  l = takeOut(l, 'c');
  assert.deepEqual(keys(l.grid), ['w:chores', 'a', 'c', 'b']);
  l = merge(l, 'c', 'a');
  l = remove(l, 'a');
  assert.deepEqual(keys(l.grid), ['w:chores', 'c', 'b']);
});

test('making a folder on a dock app moves the folder to the grid', () => {
  const l = merge(base(), 'a', 'd');
  assert.equal(l.dock.length, 0);
  assert.equal(l.grid[0].k, 'folder');
  assert.deepEqual(l.grid[0].apps, ['d', 'a']);
});

test('locate finds apps inside folders', () => {
  const l = merge(base(), 'c', 'a');
  assert.equal(locate(l, 'c').folder.key, l.grid[1].key);
});

test('rename keeps a name', () => {
  const l = merge(base(), 'c', 'a');
  assert.equal(rename(l, l.grid[1].key, '  ').grid[1].name, 'Folder');
  assert.equal(rename(l, l.grid[1].key, 'Kitchen').grid[1].name, 'Kitchen');
});

test('normalize drops unknown and repeated apps, and rescues junk', () => {
  const stored = {
    v: 1,
    grid: [{ k: 'app', key: 'a' }, { k: 'app', key: 'gone' }, { k: 'folder', key: 'f', name: 'X', apps: ['a', 'b'] }, { k: 'widget', key: 'w:nope', w: 'nope' }],
    dock: [{ k: 'app', key: 'a' }, { k: 'widget', key: 'w:chores', w: 'chores' }],
  };
  const l = normalize(stored, ['a', 'b'], ['chores']);
  assert.deepEqual(keys(l.dock), ['a']);
  assert.deepEqual(keys(l.grid), ['b']); // folder lost "a" to the dock, so it became just "b"
  assert.deepEqual(normalize(null, [], []), defaultLayout());
  assert.deepEqual(normalize({ v: 9 }, [], []), defaultLayout());
});

test('the default layout places every app exactly once', () => {
  const l = defaultLayout();
  const all = [...l.dock, ...l.grid].flatMap((i) => (i.k === 'app' ? [i.key] : i.k === 'folder' ? i.apps : []));
  assert.equal(all.length, new Set(all).size);
  assert.equal(placedApps(l).size, all.length);
});

// ------------------------------------------------------------------ pages
const apps = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ k: 'app', key: `a${i + from}` }));
const spots = (page) => page.map((p) => `${p.item.key}@${p.col},${p.row}${p.w > 1 || p.h > 1 ? `:${p.w}x${p.h}` : ''}`);

test('pack fills a page row by row, then starts the next', () => {
  const pages = pack(apps(10), 4, 2);
  assert.equal(pages.length, 2);
  assert.deepEqual(spots(pages[0]), ['a0@1,1', 'a1@2,1', 'a2@3,1', 'a3@4,1', 'a4@1,2', 'a5@2,2', 'a6@3,2', 'a7@4,2']);
  assert.deepEqual(spots(pages[1]), ['a8@1,1', 'a9@2,1']);
  assert.deepEqual(pages[1].map((p) => p.index), [8, 9]); // indexes stay global
});

test('widgets take their size, and small apps fill in beside them', () => {
  const grid = [{ k: 'widget', key: 'w:x', w: 'x', size: 's' }, ...apps(5)];
  assert.deepEqual(spots(pack(grid, 4, 4)[0]), ['w:x@1,1:2x2', 'a0@3,1', 'a1@4,1', 'a2@3,2', 'a3@4,2', 'a4@1,3']);
});

test('a widget that does not fit moves to the next page; smaller items fill the gap', () => {
  const grid = [...apps(6), { k: 'widget', key: 'w:s', w: 's', size: 's' }, ...apps(2, 6)];
  const pages = pack(grid, 4, 2);
  assert.equal(pages.length, 2);
  // a6 and a7 come after the widget but fit on page 1, so page 1 has no hole.
  assert.deepEqual(spots(pages[0]).slice(-2), ['a6@3,2', 'a7@4,2']);
  assert.deepEqual(spots(pages[1]), ['w:s@1,1:2x2']); // the widget goes first on the next page
  assert.deepEqual(spots(pack(grid, 4, 3)[0]).slice(-3), ['w:s@3,2:2x2', 'a6@1,3', 'a7@2,3']); // a taller screen fits it all
  assert.deepEqual(spots(pack([{ k: 'widget', key: 'w:l', w: 'l', size: 'l' }], 4, 3)[0]), ['w:l@1,1:4x3']); // shrinks to the page
});

test('making a widget large never empties the page it was on', () => {
  const grid = [{ k: 'widget', key: 'w:t', w: 't', size: 'm' }, { k: 'widget', key: 'w:c', w: 'c', size: 'l' }, { k: 'widget', key: 'w:k', w: 'k', size: 's' }, ...apps(4)];
  const [p1, p2] = pack(grid, 4, 5);
  assert.deepEqual(spots(p1), ['w:t@1,1:4x2', 'w:k@1,3:2x2', 'a0@3,3', 'a1@4,3', 'a2@3,4', 'a3@4,4']);
  assert.deepEqual(spots(p2), ['w:c@1,1:4x4']);
});

test('an empty grid is one empty page', () => {
  assert.deepEqual(pack([], 4, 5), [[]]);
});

// ------------------------------------------------------- sizes and icons
test('widget size changes, and only to a real size', () => {
  const l = { v: 2, grid: [{ k: 'widget', key: 'w:chores', w: 'chores', size: 's' }], dock: [], custom: {} };
  assert.equal(setWidgetSize(l, 'w:chores', 'l').grid[0].size, 'l');
  assert.equal(setWidgetSize(l, 'w:chores', 'xl'), l);
});

test('icons can be renamed and recoloured, and reset', () => {
  const l = { v: 2, grid: [], dock: [], custom: {} };
  let c = setCustom(l, 'kitchenhub', { name: '  Kitchen ', color: '#ff0000' });
  assert.deepEqual(c.custom.kitchenhub, { name: 'Kitchen', color: '#ff0000' });
  c = setCustom(c, 'kitchenhub', { name: '' });
  assert.deepEqual(c.custom.kitchenhub, { color: '#ff0000' });
  assert.equal(setCustom(c, 'kitchenhub', null).custom.kitchenhub, undefined);
  assert.deepEqual(setCustom(l, 'x', { evil: 'y' }).custom, {});
});

test('a version 1 layout upgrades: sizes for widgets, and the new Settings app', () => {
  const v1 = { v: 1, grid: [{ k: 'widget', key: 'w:today', w: 'today' }, { k: 'widget', key: 'w:chores', w: 'chores' }, { k: 'app', key: 'a' }], dock: [] };
  const l = normalize(v1, ['a', 'settings'], ['today', 'chores']);
  assert.equal(l.v, 3);
  assert.deepEqual(l.grid.map((i) => i.size || i.key), ['m', 's', 'a', 'settings']);
  assert.deepEqual(l.custom, {});
});

// ------------------------------------------------- stacks and page breaks
const widgets = () => ({
  v: 2,
  grid: [{ k: 'widget', key: 'w:chores', w: 'chores', size: 'm' }, { k: 'app', key: 'a' }, { k: 'widget', key: 'w:dinner', w: 'dinner', size: 's' }, { k: 'widget', key: 'w:tasks', w: 'tasks', size: 's' }],
  dock: [],
  custom: {},
});

test('a version 2 layout loads unchanged as version 3', () => {
  const v2 = widgets();
  const l = normalize(v2, ['a'], ['chores', 'dinner', 'tasks']);
  assert.equal(l.v, 3);
  assert.deepEqual(l.grid, v2.grid);
});

test('dropping a widget on a widget makes a stack in the target\'s spot and size', () => {
  const l = merge(widgets(), 'w:dinner', 'w:chores');
  assert.equal(l.grid.length, 3);
  assert.equal(l.grid[0].k, 'stack');
  assert.equal(l.grid[0].size, 'm');
  assert.deepEqual(l.grid[0].widgets, ['dinner', 'chores']); // the dropped one shows first
  assert.equal(l.grid[0].rotate, true);
  assert.deepEqual([...placedWidgets(l)].sort(), ['chores', 'dinner', 'tasks']);
  const more = merge(l, 'w:tasks', l.grid[0].key);
  assert.deepEqual(more.grid[0].widgets, ['tasks', 'dinner', 'chores']);
  assert.equal(merge(l, 'a', l.grid[0].key), l); // apps never join stacks
});

test('a stack down to one widget turns back into that widget', () => {
  let l = merge(widgets(), 'w:dinner', 'w:chores');
  const key = l.grid[0].key;
  l = unstack(l, key, 'dinner');
  assert.deepEqual(keys(l.grid), ['w:chores', 'w:dinner', 'a', 'w:tasks']);
  assert.equal(l.grid[1].size, 'm');
  l = merge(l, 'w:tasks', 'w:dinner');
  l = setStack(l, l.grid[1].key, { drop: 'tasks' });
  assert.equal(l.grid[1].k, 'widget');
});

test('stacks reorder, stop turning, and size like a widget', () => {
  let l = merge(widgets(), 'w:dinner', 'w:chores');
  const key = l.grid[0].key;
  l = setStack(l, key, { widgets: ['chores', 'dinner'], rotate: false });
  assert.deepEqual(l.grid[0].widgets, ['chores', 'dinner']);
  assert.equal(l.grid[0].rotate, false);
  assert.equal(setStack(l, key, { widgets: ['chores', 'nope'] }).grid[0].widgets.join(), 'chores,dinner'); // not the same widgets: ignored
  assert.equal(setWidgetSize(l, key, 'l').grid[0].size, 'l');
  assert.deepEqual(spots(pack(l.grid, 4, 4)[0])[0], `${key}@1,1:4x2`);
});

test('normalize keeps stacks, drops unknown widgets in them, and never shows a widget twice', () => {
  const stored = { v: 3, grid: [{ k: 'stack', key: 's:1', size: 's', widgets: ['dinner', 'gone', 'tasks'] }, { k: 'widget', key: 'w:tasks', w: 'tasks' }, { k: 'stack', key: 's:2', widgets: ['gone'] }], dock: [] };
  const l = normalize(stored, [], ['dinner', 'tasks']);
  assert.deepEqual(l.grid, [{ k: 'stack', key: 's:1', size: 's', widgets: ['dinner', 'tasks'], rotate: true }]);
});

test('a page break starts a new page on any screen, and joins back', () => {
  const grid = [...apps(3), { k: 'break', key: 'b:1' }, ...apps(2, 3)];
  const pages = pack(grid, 4, 4);
  assert.equal(pages.length, 2);
  assert.deepEqual(spots(pages[1]), ['a3@1,1', 'a4@2,1']);
  assert.equal(pack(grid, 8, 6).length, 2);
  let l = { v: 3, grid: apps(4), dock: [], custom: {} };
  l = setPageBreak(l, 'a2', true);
  assert.deepEqual(l.grid.map((i) => i.k), ['app', 'app', 'break', 'app', 'app']);
  assert.equal(setPageBreak(l, 'a2', true).grid.length, 5); // already starts a page
  assert.deepEqual(keys(setPageBreak(l, 'a2', false).grid), ['a0', 'a1', 'a2', 'a3']);
  assert.equal(remove(remove(l, 'a2'), 'a3').grid.some((i) => i.k === 'break'), false); // nothing after it: the break goes
});
