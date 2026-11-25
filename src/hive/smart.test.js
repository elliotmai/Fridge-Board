import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glance, score, smartPick } from './smart.js';

const day = (hour, more = {}) => ({ hour, choresLeft: 0, toBuy: 0, due: 0, overdue: 0, nextEvent: null, dinner: null, trip: null, breedDays: null, wx: null, ...more });

test('a stack shows chores in the morning and dinner in the afternoon', () => {
  const s = ['chores', 'dinner', 'tasks'];
  assert.equal(s[smartPick(s, day(7, { choresLeft: 3, dinner: 'Tacos' }))], 'chores');
  assert.equal(s[smartPick(s, day(17, { choresLeft: 3, dinner: 'Tacos' }))], 'dinner');
});

test('an event in the next two hours beats everything', () => {
  const s = ['dinner', 'calendar'];
  assert.equal(s[smartPick(s, day(17, { dinner: 'Tacos', nextEvent: { title: 'Vet', mins: 45, at: '5:45 pm' } }))], 'calendar');
});

test('a widget with nothing to say scores nothing, and ties keep the first', () => {
  assert.equal(score('chores', day(8)), 0);
  assert.equal(smartPick(['trip', 'chores'], day(3)), 0); // both have nothing: the first stays
});

test('the line under the clock says the next thing that matters', () => {
  assert.deepEqual(glance(day(9, { nextEvent: { title: 'Dentist', mins: 90, at: '10:30 am' }, choresLeft: 2 })), { text: 'Dentist at 10:30 am', w: 'calendar' });
  assert.deepEqual(glance(day(9, { choresLeft: 1 })), { text: '1 chore left', w: 'chores' });
  assert.deepEqual(glance(day(15, { dinner: 'Chili', choresLeft: 4 })), { text: 'Chili tonight', w: 'dinner' });
  assert.deepEqual(glance(day(15, { trip: { name: 'Fall trip', dest: 'Denver', until: 1, current: false } })), { text: 'Leaving for Denver tomorrow', w: 'trip' });
  assert.deepEqual(glance(day(20, { wx: { now: 54, desc: 'Light rain' } })), { text: '54°, light rain', w: 'today' });
  assert.equal(glance(day(20)), null);
});
