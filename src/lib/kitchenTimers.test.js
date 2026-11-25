import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byKey, fromRow, isDone, newTimerRow, ringing, sortTimers, stepKey, timeLeft } from './kitchenTimers.js';

const NOW = Date.parse('2026-11-25T18:00:00Z');
const t = (id, s, extra = {}) => ({ id, label: id, endsAt: NOW + s * 1000, key: null, ...extra });

test('a timer is stored by its end time and read back the same anywhere', () => {
  const row = newTimerRow({ label: 'Pasta', minutes: 9, key: stepKey('r1', 2), now: NOW });
  assert.deepEqual(row, { key: 'recipe:r1:2', label: 'Pasta', duration_s: 540, ends_at: '2026-11-25T18:09:00.000Z' });
  const timer = fromRow({ id: 'a', ...row });
  assert.equal(timer.endsAt, NOW + 540000);
  // reopened four minutes later, on another device
  assert.equal(timeLeft(timer, NOW + 240000), '5:00');
  // the KitchenHub board API already sends endsAt
  assert.equal(fromRow({ id: 'b', label: 'x', endsAt: 5 }).endsAt, 5);
});

test('refuses a time that cannot be a timer, and names an unnamed one', () => {
  assert.equal(newTimerRow({ minutes: 0 }), null);
  assert.equal(newTimerRow({ minutes: 'soon' }), null);
  assert.equal(newTimerRow({ minutes: 24 * 60 + 1 }), null);
  assert.equal(newTimerRow({ minutes: 5, now: NOW }).label, '5 minute timer');
});

test('counts down from the clock, rounding up, and is done from its end on', () => {
  assert.equal(timeLeft(t('a', 0.2), NOW), '0:01');
  assert.equal(timeLeft(t('a', 3725), NOW), '1:02:05');
  assert.equal(timeLeft(t('a', -1), NOW), 'Done');
  assert.equal(isDone(t('a', 0), NOW), true);
  assert.equal(isDone(t('a', 1), NOW), false);
});

test('several at once: ringing first, then soonest; step timers by key', () => {
  const list = [t('later', 600), t('rang', -60), t('soon', 30, { key: 'recipe:r:0' }), t('just', -1)];
  assert.deepEqual(sortTimers(list, NOW).map((x) => x.id), ['rang', 'just', 'soon', 'later']);
  assert.deepEqual(ringing(list, NOW).map((x) => x.id).sort(), ['just', 'rang']);
  assert.deepEqual(Object.keys(byKey(list)), ['recipe:r:0']);
});
