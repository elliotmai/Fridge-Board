import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addApp, defaultLayout, DOCK_MAX, locate, merge, move, normalize, placedApps, remove, rename, takeOut } from './layout.js';

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
