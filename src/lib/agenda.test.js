import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agendaDays, dedupeEvents, eventDays, mergeTodos } from './agenda.js';

const NOW = new Date(2026, 10, 19, 9, 0); // Thu 19 Nov 2026, local
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (n) => iso(new Date(2026, 10, 19 + n));
const at = (n, h) => new Date(2026, 10, 19 + n, h, 0).toISOString();

const thanksgiving = {
  id: 'tg', name: 'Thanksgiving', dest: 'Asheville, NC', startDate: day(7), endDate: day(11),
  items: [
    { kind: 'flight', title: 'AA 3521', route: 'CLL to DFW', date: day(7) },
    { kind: 'stay', title: 'Airbnb in Montford', date: day(7), until: day(11) },
  ],
};

test('to-dos from both apps in one list, soonest first, undated Google tasks last', () => {
  const rows = mergeTodos({
    learnleaf: [{ id: 'a', name: 'Lab report', subject: 'bio', due: day(-1) }, { id: 'b', name: 'Read ch 7', subject: 'stats', due: day(0), time: '21:00' }, { id: 'c', name: 'Far off', due: day(20) }],
    subjects: { bio: ['Biology', '#1f9e89'] },
    google: [{ id: 'g1', list: 'L', listTitle: 'My Tasks', title: 'Call vet', due: day(0) }, { id: 'g2', list: 'L', listTitle: 'House', title: 'Fix gate', due: null }],
  }, NOW);
  assert.deepEqual(rows.map((r) => [r.key, r.n]), [['ll:a', -1], ['ll:b', 0], ['g:L:g1', 0], ['g:L:g2', null]]);
  assert.equal(rows[0].tag, 'Biology');
  assert.equal(rows[1].tag, 'No subject'); // timed tasks come before untimed ones on the same day
  assert.equal(rows[2].tag, 'My Tasks');
});

test('all-day end dates are exclusive; a timed event ending at midnight stays on its day', () => {
  const ad = eventDays({ allDay: true, start: day(7), end: day(12) });
  assert.equal(iso(ad.first), day(7)); assert.equal(iso(ad.last), day(11));
  const single = eventDays({ allDay: true, start: day(2), end: day(3) });
  assert.equal(iso(single.last), day(2));
  const late = eventDays({ allDay: false, start: at(0, 22), end: new Date(2026, 10, 20, 0, 0).toISOString() });
  assert.equal(iso(late.last), day(0));
});

test('the trip itself, its flight and its stay are hidden; other events stay', () => {
  const events = [
    { id: 'trip', title: 'Thanksgiving in Asheville', allDay: true, start: day(7), end: day(12) },
    { id: 'flight', title: 'Flight to Dallas (AA 3521)', allDay: false, start: at(7, 6), end: at(7, 7) },
    { id: 'stay', title: 'Stay at Montford Airbnb', allDay: true, start: day(7), end: day(11) },
    { id: 'dentist', title: 'Dentist', allDay: false, start: at(1, 15), end: at(1, 16) },
    { id: 'turkey', title: 'Order turkey', allDay: true, start: day(5), end: day(6) },
  ];
  const { shown, hidden } = dedupeEvents(events, [thanksgiving]);
  assert.deepEqual(shown.map((e) => e.id), ['dentist', 'turkey']);
  assert.deepEqual(hidden.map((h) => [h.event.id, h.tripId]), [['trip', 'tg'], ['flight', 'tg'], ['stay', 'tg']]);
});

test('an unlabelled all-day block over the trip dates counts as the trip; a meeting during it does not', () => {
  const events = [
    { id: 'ooo', title: 'Out of office', allDay: true, start: day(7), end: day(12) },
    { id: 'call', title: 'Team call', allDay: false, start: at(8, 10), end: at(8, 11) },
  ];
  assert.deepEqual(dedupeEvents(events, [thanksgiving]).shown.map((e) => e.id), ['call']);
});

test('the same words outside the trip dates are left alone', () => {
  const events = [{ id: 'later', title: 'Asheville planning call', allDay: false, start: at(1, 10), end: at(1, 11) }];
  assert.equal(dedupeEvents(events, [thanksgiving]).shown.length, 1);
});

test('agenda groups by day, multi-day events on each day, all-day first', () => {
  const ev = [
    { id: 'b', title: 'Dentist', allDay: false, start: at(1, 15), end: at(1, 16) },
    { id: 'a', title: 'Conference', allDay: true, start: day(1), end: day(3) },
    { id: 'c', title: 'Lunch', allDay: false, start: at(0, 12), end: at(0, 13) },
  ];
  const days = agendaDays(ev, NOW, 7);
  assert.deepEqual(days.map((d) => [d.n, d.events.map((e) => e.id)]), [[0, ['c']], [1, ['a', 'b']], [2, ['a']]]);
  assert.equal(days[2].events[0].continued, true);
});

import { minutesOf, timeline } from './agenda.js';

test('times in the forms the apps use', () => {
  assert.equal(minutesOf('6:10 AM'), 370);
  assert.equal(minutesOf('9 pm'), 1260);
  assert.equal(minutesOf('21:00'), 1260);
  assert.equal(minutesOf('12:30 AM'), 30);
  assert.equal(minutesOf(''), null);
});

test('one timeline: trips, legs, breeding, events and tasks by day', () => {
  const todos = mergeTodos({
    learnleaf: [{ id: 'old', name: 'Lab report', due: day(-2) }, { id: 'rd', name: 'Read ch 7', due: day(0), time: '21:00' }],
    google: [{ id: 'g', list: 'L', title: 'Fix gate', due: null }],
  }, NOW);
  const timed = { ...thanksgiving, far: true, items: thanksgiving.items.map((i) => (i.kind === 'flight' ? { ...i, time: '6:10 AM' } : i)) };
  const trips = [timed, { id: 'lis', name: 'Lisbon', dest: 'Lisbon, Portugal', startDate: day(40), endDate: day(48), items: [] }];
  const breeding = { name: 'Fall heifers', cidr: new Date(2026, 10, 20), lut: new Date(2026, 10, 27), b1: new Date(2026, 10, 29), b2: new Date(2026, 11, 1), head: 30, groups: [], clash: [] };
  const events = [{ id: 'den', title: 'Dentist', allDay: false, start: at(0, 15), end: at(0, 16) }];
  const tl = timeline({ todos, events, trips, breeding }, NOW, { horizon: 14 });

  assert.deepEqual(tl.overdue.map((t) => t.key), ['ll:old']);
  assert.deepEqual(tl.anytime.map((t) => t.key), ['g:L:g']);
  const d0 = tl.days.find((d) => d.n === 0);
  assert.deepEqual(d0.items.map((i) => i.kind), ['event', 'task']); // 3 pm dentist, then the 9 pm task
  assert.deepEqual(tl.days.find((d) => d.n === 1).items.map((i) => i.label), ['CIDRs in']);
  const leave = tl.days.find((d) => d.n === 7);
  assert.deepEqual(leave.items.map((i) => i.kind), ['trip-start', 'stay', 'leg']);
  assert.equal(leave.away, 'Asheville');
  assert.equal(tl.days.find((d) => d.n === 11).items.at(-1).kind, 'trip-end');
  assert.deepEqual(tl.later.map((l) => [l.key, l.n]), [['trip:lis', 40]]);
});

test('a breeding run or trip starting inside two weeks is shown whole', () => {
  const b = { name: 'Fall', cidr: new Date(2026, 10, 30), lut: new Date(2026, 11, 7), b1: new Date(2026, 11, 9), b2: new Date(2026, 11, 11), groups: [], clash: [] };
  const trip = { id: 'x', name: 'Long', dest: 'Far', startDate: day(12), endDate: day(20), items: [] };
  const tl = timeline({ breeding: b, trips: [trip] }, NOW, { horizon: 14 });
  const kinds = tl.days.flatMap((d) => d.items.map((i) => i.label || i.kind));
  assert.deepEqual(kinds, ['CIDRs in', 'trip-start', 'Lutalyse', 'Breeding starts', 'trip-end', 'Breeding ends']);
});

test('breeding past the horizon goes to Later; finished trips are gone', () => {
  const b = { name: 'Spring', cidr: new Date(2026, 11, 30), lut: new Date(2027, 0, 6), b1: new Date(2027, 0, 8), b2: new Date(2027, 0, 10), groups: [], clash: [] };
  const past = { id: 'p', name: 'Past', dest: 'X', startDate: day(-5), endDate: day(-1), items: [] };
  const tl = timeline({ trips: [past], breeding: b }, NOW, { horizon: 14 });
  assert.equal(tl.days.length, 0);
  assert.deepEqual(tl.later.map((l) => l.kind), ['breed']);
});

test('a trip already under way shows on today', () => {
  const now = { id: 'n', name: 'Lake', dest: 'Lake Somerville', startDate: day(-1), endDate: day(1), far: false, items: [] };
  const tl = timeline({ trips: [now] }, NOW);
  assert.deepEqual(tl.days.map((d) => [d.n, d.items.map((i) => i.kind)]), [[0, ['trip-now']], [1, ['trip-end']]]);
});
