import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIN_MAX, defaultArrangement, fromOldLayout, hide, movePin, normalize, pin, sectionOn, setCustom, setSection, show, unpin } from './arrange.js';

const IDS = ['board', 'settings', 'galaxyfarm', 'znt', 'kitchenhub', 'wander', 'learnleaf', 'pool', 'muster'];

test('the old icon grid carries over: dock pinned, missing apps hidden, icons kept', () => {
  const old = {
    v: 2,
    grid: [{ k: 'widget', key: 'w:chores', w: 'chores' }, { k: 'folder', key: 'f:1', name: 'Farm', apps: ['galaxyfarm', 'znt'] }, { k: 'app', key: 'pool' }],
    dock: [{ k: 'app', key: 'board' }, { k: 'app', key: 'kitchenhub' }, { k: 'app', key: 'gone' }],
    custom: { pool: { name: 'Pool' }, gone: { name: 'x' } },
  };
  const a = normalize(null, IDS, old);
  assert.deepEqual(a.pinned, ['board', 'kitchenhub']);
  assert.deepEqual(a.hidden, ['wander', 'learnleaf', 'muster']); // Settings is never hidden by the move
  assert.deepEqual(a.custom, { pool: { name: 'Pool' } });
  assert.equal(fromOldLayout({ v: 9 }, IDS), null);
});

test('nothing stored starts from the default', () => {
  assert.deepEqual(normalize(null, IDS), defaultArrangement());
  assert.deepEqual(normalize({ v: 1 }, IDS), defaultArrangement());
});

test('normalize drops unknown apps, repeats and sections, and caps pins', () => {
  const a = normalize({ v: 3, pinned: ['board', 'board', 'nope', 'znt', 'pool', 'muster', 'wander'], hidden: ['board', 'learnleaf', 7], off: ['line', 'wat'], custom: {} }, IDS);
  assert.deepEqual(a.pinned, ['board', 'znt', 'pool', 'muster'].slice(0, PIN_MAX));
  assert.deepEqual(a.hidden, ['learnleaf']);
  assert.deepEqual(a.off, ['line']);
});

test('pin, unpin, reorder, hide and show', () => {
  let a = { v: 3, pinned: ['board'], hidden: ['pool'], off: [], custom: {} };
  a = pin(a, 'pool');
  assert.deepEqual([a.pinned, a.hidden], [['board', 'pool'], []]);
  a = movePin(a, 'pool', -1);
  assert.deepEqual(a.pinned, ['pool', 'board']);
  assert.equal(movePin(a, 'pool', -1), a);
  a = hide(a, 'board');
  assert.deepEqual([a.pinned, a.hidden], [['pool'], ['board']]);
  a = show(unpin(a, 'pool'), 'board');
  assert.deepEqual([a.pinned, a.hidden], [[], []]);
  const full = { ...a, pinned: ['a', 'b', 'c', 'd'] };
  assert.equal(pin(full, 'e'), full);
});

test('sections switch off and on', () => {
  let a = defaultArrangement();
  a = setSection(a, 'line', false);
  assert.equal(sectionOn(a, 'line'), false);
  assert.equal(sectionOn(setSection(a, 'line', true), 'line'), true);
});

test('custom icons: set, clear one field, reset', () => {
  let a = setCustom(defaultArrangement(), 'pool', { name: '  Pool  ', color: '#123456', bogus: 'x' });
  assert.deepEqual(a.custom.pool, { name: 'Pool', color: '#123456' });
  a = setCustom(a, 'pool', { name: '' });
  assert.deepEqual(a.custom.pool, { color: '#123456' });
  assert.equal(setCustom(a, 'pool', null).custom.pool, undefined);
});
