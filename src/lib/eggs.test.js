import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EGG_COUNT_PATH, opensEggCount } from './eggs.js';

const eggs = { id: 'c3', title: 'Collect chicken eggs', eggs: true };
const gate = { id: 'c4', title: 'Shut the gate', eggs: false };

test('ticking the egg round in GalaxyFarm opens the egg count', () => {
  assert.equal(opensEggCount(eggs, false, true), true);
});

test('un-ticking it opens nothing', () => {
  assert.equal(opensEggCount(eggs, true, true), false);
});

test('a sample-mode tick opens nothing: GalaxyFarm never saw it', () => {
  assert.equal(opensEggCount(eggs, false, false), false);
});

test('only the chore GalaxyFarm marks, never one guessed from its title here', () => {
  assert.equal(opensEggCount(gate, false, true), false);
  assert.equal(opensEggCount({ id: 'x', title: 'Collect eggs' }, false, true), false);
});

test('the egg count opens in its Hive mode', () => {
  assert.equal(EGG_COUNT_PATH, '/kiosk/eggs?from=hive');
});
