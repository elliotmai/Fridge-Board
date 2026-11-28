import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestMatch, createSwitcher, distance, isTheirs, plain, viewFor } from './faceSwitch.js';

const sig = (x) => Array.from({ length: 128 }, (_, i) => (i === 0 ? x : 0));
const KNOWN = [{ id: 'eli', descriptors: [sig(0), sig(0.05)] }, { id: 'kat', descriptors: [sig(1)] }];

test('signatures compare by distance', () => {
  assert.equal(distance(sig(0), sig(0.3)).toFixed(2), '0.30');
});

test('a face is someone only when clearly closest', () => {
  assert.equal(bestMatch(sig(0.1), KNOWN), 'eli');
  assert.equal(bestMatch(sig(0.9), KNOWN), 'kat');
  assert.equal(bestMatch(sig(5), KNOWN), null, 'a stranger is nobody');
  assert.equal(bestMatch(sig(0.5), [{ id: 'a', descriptors: [sig(0.3)] }, { id: 'b', descriptors: [sig(0.72)] }]), null, 'too close to call: nobody');
  assert.equal(bestMatch(sig(0), []), null);
});

test('switches on 3 of 4 looks, and back to Both when unsure', () => {
  const s = createSwitcher();
  assert.equal(s.step({ faces: 1, id: 'eli' }, 0), null);
  assert.equal(s.step({ faces: 1, id: null }, 1000), null);
  assert.equal(s.step({ faces: 1, id: 'eli' }, 2000), null);
  assert.equal(s.step({ faces: 1, id: 'eli' }, 3000), 'eli', 'three of four');
  assert.equal(s.step({ faces: 0 }, 10000), 'eli', 'stepped away for a moment: still Eli');
  assert.equal(s.step({ faces: 0 }, 24000), null, 'gone 20 seconds: Both');
});

test('two people at the screen is Both, straight away', () => {
  const s = createSwitcher();
  for (let t = 0; t < 4; t++) s.step({ faces: 1, id: 'eli' }, t);
  assert.equal(s.view, 'eli');
  assert.equal(s.step({ faces: 2 }, 5), null);
  assert.equal(s.step({ faces: 1, id: 'eli' }, 6), null, 'and it has to be sure again');
});

test('one person to another needs the same certainty', () => {
  const s = createSwitcher();
  for (let t = 0; t < 4; t++) s.step({ faces: 1, id: 'eli' }, t);
  assert.equal(s.step({ faces: 1, id: 'kat' }, 10), 'eli');
  assert.equal(s.step({ faces: 1, id: 'kat' }, 11), 'eli');
  assert.equal(s.step({ faces: 1, id: 'kat' }, 12), 'kat');
});

test('one person’s view keeps their rows and everyone’s, not the other’s', () => {
  const data = {
    tasks: [{ id: 1, who: 'E' }, { id: 2, who: 'K' }],
    gtasks: [{ id: 3, who: 'K' }],
    events: [{ id: 4, who: 'E+K' }, { id: 5 }],
    trips: [{ id: 6, who: 'E+K', items: [{ who: 'E' }, { who: 'K' }] }, { id: 7, who: 'K', items: [] }],
    chores: [{ id: 'c' }],
  };
  const v = viewFor(data, { initial: 'E' });
  assert.deepEqual(v.tasks.map((t) => t.id), [1]);
  assert.deepEqual(v.gtasks, []);
  assert.deepEqual(v.events.map((e) => e.id), [4, 5]);
  assert.deepEqual(v.trips.map((t) => [t.id, t.items.length]), [[6, 1]]);
  assert.equal(v.chores, data.chores);
  assert.equal(viewFor(data, null), data, 'Both: everything');
  assert.ok(isTheirs({ who: 'El+K' }, 'El') && !isTheirs({ who: 'El' }, 'E'));
});

test('signatures are stored as plain numbers', () => {
  assert.deepEqual(plain(new Float32Array([0.1234567, -2])), [0.123457, -2]);
});
