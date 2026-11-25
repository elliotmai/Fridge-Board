import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDrink, handleDrinks, localDateTime, pushId, quickOptions, safeZone } from './drinks.mjs';

const NOW = new Date('2026-11-26T02:30:00Z'); // 8:30 pm on the 25th in Chicago
const ME = 'u-me', PARTNER = 'u-partner', STRANGER = 'u-stranger';

function deps({ user = { uid: ME }, household = 'h1', rows = {} } = {}) {
  const inserted = [];
  return {
    inserted,
    session: async () => ({ user }),
    household: async (uid) => (uid === ME || uid === PARTNER ? household : null),
    members: async () => [{ id: ME, name: 'Me' }, { id: PARTNER, name: 'Partner' }],
    read: async (path) => (path.includes('distinctDrinks') ? rows.distinct || [] : path.includes('value->>date') ? rows.today || [] : rows.recent || []),
    insert: async (row) => { inserted.push(row); },
    now: () => NOW,
    tz: 'America/Chicago',
  };
}
const post = (body) => new Request('http://x/api/drinks/m', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const get = (q = '') => new Request(`http://x/api/drinks/m${q}`);

test('a drink is stored the way Drink Tracker stores one', () => {
  const d = buildDrink({ type: 'Beer', name: '  Miller   Lite ', quantity: '12', extra: 'dropped', date: '1999-01-01' }, { now: NOW, tz: 'America/Chicago' });
  assert.deepEqual(d, { type: 'Beer', name: 'Miller Lite', quantity: 12, unit: 'oz', date: '2026-11-25', time: '20:30' });
});

test('bad drinks are refused', () => {
  assert.throws(() => buildDrink({ type: 'Juice', quantity: 8 }), /type/);
  assert.throws(() => buildDrink({ type: 'Beer', quantity: 0 }), /amount/);
  assert.throws(() => buildDrink({ type: 'Beer', quantity: 500 }), /amount/);
  assert.throws(() => buildDrink(null), /object/);
});

test('local day and time follow the household time zone', () => {
  assert.deepEqual(localDateTime(NOW, 'UTC'), { date: '2026-11-26', time: '02:30' });
  assert.deepEqual(localDateTime(new Date('2026-11-25T05:05:00Z'), 'America/Chicago'), { date: '2026-11-24', time: '23:05' });
  assert.equal(safeZone('Not/AZone'), 'America/Chicago');
  assert.equal(safeZone('Europe/London'), 'Europe/London');
});

test('push ids are 20 characters and sort by time', () => {
  const a = pushId(1000), b = pushId(2000);
  assert.equal(a.length, 20);
  assert.ok(a < b);
  assert.match(a, /^[-0-9A-Za-z_]{20}$/);
});

test('quick options: favourites first, then recent ones not already there, then types', () => {
  const o = quickOptions(
    [{ type: 'Beer', name: 'Miller Lite', quantity: 12, count: 40 }, { type: 'Wine', name: '', quantity: 5, count: 3 }, { type: 'Bogus', quantity: 1 }],
    [{ type: 'Beer', name: 'Miller Lite', quantity: 12 }, { type: 'Cocktail', name: 'Margarita', quantity: 8 }, { type: 'Spirit', name: 'Rye', quantity: 1.5 }],
  );
  assert.deepEqual(o.favorites.map((d) => d.name || d.type), ['Miller Lite', 'Wine']);
  assert.deepEqual(o.recent.map((d) => d.name), ['Margarita', 'Rye']);
  assert.equal(o.types.length, 5);
  assert.deepEqual(quickOptions(null, null).favorites, []);
});

test('signed out: refused, nothing written', async () => {
  const d = deps({ user: null });
  const r = await handleDrinks(post({ type: 'Beer', quantity: 12 }), PARTNER, d);
  assert.equal(r.status, 401);
  assert.equal(d.inserted.length, 0);
});

test('signed in but in no household: refused', async () => {
  const d = deps({ user: { uid: STRANGER } });
  const r = await handleDrinks(post({ type: 'Beer', quantity: 12 }), ME, d);
  assert.equal(r.status, 403);
  assert.equal(d.inserted.length, 0);
});

test('someone outside the household can’t be the target', async () => {
  const d = deps();
  const r = await handleDrinks(post({ type: 'Beer', quantity: 12 }), STRANGER, d);
  assert.equal(r.status, 403);
  assert.equal(d.inserted.length, 0);
});

test('a household member adds a drink for another member: one new drink row, nothing else', async () => {
  const d = deps();
  const r = await handleDrinks(post({ type: 'Wine', name: 'Pinot', quantity: 5, tz: 'America/Chicago', path: ['users', ME, 'stats'], value: { hacked: true } }), PARTNER, d);
  assert.equal(r.status, 200);
  assert.equal(d.inserted.length, 1);
  const [row] = d.inserted;
  assert.equal(row.path.length, 4);
  assert.deepEqual(row.path.slice(0, 3), ['users', PARTNER, 'drinks']);
  assert.deepEqual(Object.keys(row).sort(), ['path', 'value']);
  assert.deepEqual(row.value, { type: 'Wine', name: 'Pinot', quantity: 5, unit: 'oz', date: '2026-11-25', time: '20:30' });
});

test('a bad drink is a 400 and writes nothing', async () => {
  const d = deps();
  const r = await handleDrinks(post({ type: 'Beer', quantity: -1 }), ME, d);
  assert.equal(r.status, 400);
  assert.equal(d.inserted.length, 0);
});

test('the people list is the household, with me marked', async () => {
  const r = await handleDrinks(new Request('http://x/api/drinks'), null, deps());
  assert.deepEqual((await r.json()).people, [{ id: ME, name: 'Me', me: true }, { id: PARTNER, name: 'Partner', me: false }]);
});

test('options for a member: favourites, recent and today’s count', async () => {
  const d = deps({ rows: { distinct: [{ value: [{ type: 'Beer', name: 'Lite', quantity: 12, count: 9 }] }], recent: [{ value: { type: 'Wine', name: '', quantity: 5 } }], today: [{ key: 'a' }, { key: 'b' }] } });
  const r = await handleDrinks(get('?tz=America/Chicago'), PARTNER, d);
  const o = await r.json();
  assert.equal(o.today, 2);
  assert.equal(o.favorites[0].name, 'Lite');
  assert.equal(o.recent[0].type, 'Wine');
});

test('only GET and POST', async () => {
  const r = await handleDrinks(new Request('http://x/api/drinks/m', { method: 'DELETE' }), PARTNER, deps());
  assert.equal(r.status, 405);
});

test('quick options: top 3 by count, 3 recent not in the top, everything for search', () => {
  const distinct = [
    { type: 'Beer', name: 'Yuengling', quantity: 12, count: 5 },
    { type: 'Beer', name: 'Miller Lite', quantity: 12, count: 134 },
    { type: 'Spirit', name: 'Lychee Soju', quantity: 6, count: 113 },
    { type: 'Wine', name: '', quantity: 5, count: 40 },
    { type: 'Nope', name: 'bad', quantity: 5, count: 999 },
  ];
  const recent = [
    { type: 'Beer', name: 'Miller Lite', quantity: 12 },
    { type: 'Cocktail', name: 'Margarita', quantity: 8 },
    { type: 'Beer', name: 'Yuengling', quantity: 12 },
    { type: 'Spirit', name: 'Rye', quantity: 1.5 },
    { type: 'Other', name: 'Twisted Tea', quantity: 12 },
  ];
  const o = quickOptions(distinct, recent);
  assert.deepEqual(o.favorites.map((d) => d.name || d.type), ['Miller Lite', 'Lychee Soju', 'Wine']);
  assert.deepEqual(o.recent.map((d) => d.name), ['Margarita', 'Yuengling', 'Rye']);
  assert.deepEqual(o.all.map((d) => d.name || d.type), ['Miller Lite', 'Lychee Soju', 'Wine', 'Yuengling']);
});
