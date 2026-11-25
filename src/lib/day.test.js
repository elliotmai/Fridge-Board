import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choresNow, comingUp, currentSlot, dayLine, dinners, herdAlert, notUpdating, shoppingNow, tasksNow, upNext } from './day.js';
import { iso } from './dates.js';

const NOW = new Date(2026, 10, 24, 15, 10); // Tuesday 3:10 pm
const day = (n) => iso(new Date(2026, 10, 24 + n));
const at = (n, h, m = 0) => new Date(2026, 10, 24 + n, h, m).toISOString();

const CHORES = [
  { id: 'owed', title: 'Waterer', slot: 'owed', done: false },
  { id: 'm1', title: 'Hens out', slot: 'morning', done: true },
  { id: 'm2', title: 'Cubes', slot: 'morning', done: false },
  { id: 'e1', title: 'Feed dogs', slot: 'evening', done: false },
  { id: 'n1', title: 'Lock barn', slot: 'night', done: false },
];

test('the current chore slot is the first whose deadline is still ahead', () => {
  assert.equal(currentSlot(new Date(2026, 10, 24, 7)), 'morning');
  assert.equal(currentSlot(new Date(2026, 10, 24, 11)), 'midday');
  assert.equal(currentSlot(NOW), 'evening');
  assert.equal(currentSlot(new Date(2026, 10, 24, 23, 59)), 'night');
});

test('chores now: this slot and anything left from earlier, late first, done last', () => {
  const c = choresNow(CHORES, NOW);
  assert.equal(c.slot, 'evening');
  assert.deepEqual(c.rows.map((r) => r.id), ['owed', 'm2', 'e1', 'm1']);
  assert.deepEqual(c.rows.map((r) => r.late), [true, true, false, false]);
  assert.equal(c.left, 3);
  assert.equal(c.later, 1);
  assert.equal(c.laterSlot, 'night');
  assert.equal(c.allDone, false);
  assert.equal(choresNow(CHORES.map((x) => ({ ...x, done: true })), NOW).allDone, true);
});

test('tasks now: due today or overdue, with ticks applied', () => {
  const t = tasksNow({
    tasks: [{ id: 'a', name: 'Late one', due: day(-2) }, { id: 'b', name: 'Today', due: day(0), time: '21:00' }, { id: 'c', name: 'Later', due: day(3) }],
    gtasks: [{ id: 'g', list: 'L', title: 'No date', due: null }],
    todosDone: ['ll:b'],
  }, NOW);
  assert.deepEqual(t.map((x) => [x.name, x.late, x.done]), [['Late one', true, false], ['Today', false, true]]);
});

test('tonight and the dinners after it; shopping for tonight', () => {
  const d = dinners([{ d: 0, type: 'Lunch', name: 'Chili' }, { d: 2, type: 'Dinner', name: 'Fajitas' }, { d: 0, type: 'Dinner', name: 'Meatballs' }, { d: 9, type: 'Dinner', name: 'Far' }]);
  assert.equal(d.tonight.name, 'Meatballs');
  assert.deepEqual(d.after.map((m) => m.name), ['Fajitas']);
  const s = shoppingNow([{ id: 1, name: 'Beans', why: 'Tonight' }, { id: 2, name: 'Limes' }, { id: 3, name: 'Got', bought: true, why: 'Tonight' }]);
  assert.deepEqual([s.left.length, s.tonight.map((i) => i.name)], [2, ['Beans']]);
});

test('the day line pins timed events and tasks, and says what is next', () => {
  const data = {
    chores: CHORES,
    events: [
      { id: 'f', title: 'Farrier', allDay: false, start: at(0, 16), end: at(0, 17) },
      { id: 'd', title: 'Dentist', allDay: false, start: at(1, 9), end: at(1, 10) },
      { id: 'h', title: 'Hay', allDay: true, start: day(0), end: day(1) },
    ],
    trips: [],
    tasks: [{ id: 'r', name: 'Read ch 7', due: day(0), time: '21:00' }],
  };
  const line = dayLine(data, NOW);
  assert.deepEqual(line.pins.map((p) => [p.title, p.at]), [['Farrier', 960], ['Read ch 7', 1260]]);
  assert.deepEqual(line.slots.map((s) => [s.key, s.left]), [['morning', 1], ['midday', 0], ['evening', 1], ['night', 1]]);
  assert.equal(line.now, 15 * 60 + 10);
  assert.deepEqual([upNext(data, NOW).title, upNext(data, NOW).when], ['Farrier', 'next']);
  assert.deepEqual([upNext(data, new Date(2026, 10, 24, 16, 30)).title, upNext(data, new Date(2026, 10, 24, 16, 30)).when], ['Farrier', 'now']);
  // Nothing timed left: the end of the chore slot is what's next.
  assert.equal(upNext({ ...data, events: [], tasks: [] }, NOW).kind, 'chores');
});

test('coming up leaves out what is over today and tasks already under Needs', () => {
  const data = {
    events: [
      { id: 'gone', title: 'Morning call', allDay: false, start: at(0, 9), end: at(0, 10) },
      { id: 'f', title: 'Farrier', allDay: false, start: at(0, 16), end: at(0, 17) },
      { id: 'd', title: 'Dentist', allDay: false, start: at(1, 9), end: at(1, 10) },
    ],
    tasks: [{ id: 'r', name: 'Read', due: day(0) }, { id: 's', name: 'Slides', due: day(2) }],
    trips: [], sessions: [],
  };
  const c = comingUp(data, NOW);
  assert.deepEqual(c.days.map((d) => [d.n, d.items.map((i) => i.event?.title || i.task?.name)]), [[0, ['Farrier']], [1, ['Dentist']], [2, ['Slides']]]);
});

test('herd alerts only when a breeding step is today or tomorrow', () => {
  const s = (n) => ({ name: 'Fall heifers', cidr: day(n), groups: [['ZNT', 20]] });
  assert.equal(herdAlert({ sessions: [s(5)], trips: [] }, NOW), null);
  const a = herdAlert({ sessions: [s(1)], trips: [] }, NOW);
  assert.deepEqual(a.steps.map((x) => [x.label, x.n]), [['CIDRs in', 1]]);
  const lut = herdAlert({ sessions: [s(-7)], trips: [] }, NOW);
  assert.deepEqual(lut.steps.map((x) => x.label), ['Lutalyse']);
});

test('not updating names each stale app once', () => {
  assert.deepEqual(notUpdating({ meals: { status: 'stale' }, shopping: { status: 'stale' }, chores: { status: 'live' }, tasks: { status: 'sample' } }), ['KitchenHub']);
});
