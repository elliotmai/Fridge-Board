import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardGate, householdMembers } from './household.mjs';
import { hiveSession } from './hiveUser.mjs';

const req = (headers = {}) => new Request('http://x/api/board', { headers });
const session = (user, expired = false) => async () => ({ user, expired });
const household = (map) => async (uid) => map[uid] ?? null;

test('the board key lets the fridge in with nobody signed in', async () => {
  process.env.BOARD_ACCESS_KEY = 'k';
  const g = await boardGate(req({ 'x-board-key': 'k' }), { session: session(null), household: household({}) });
  assert.equal(g.ok, true);
  assert.equal(g.user, null);
  assert.equal(g.viaKey, true);
});

test('a signed-in household member gets in without the key', async () => {
  process.env.BOARD_ACCESS_KEY = 'k';
  const g = await boardGate(req(), { session: session({ uid: 'u1' }), household: household({ u1: 'h1' }) });
  assert.equal(g.ok, true);
  assert.equal(g.household, 'h1');
});

test('signed in but in no household, and no key: locked, and says why', async () => {
  process.env.BOARD_ACCESS_KEY = 'k';
  const g = await boardGate(req(), { session: session({ uid: 'u2' }), household: household({}) });
  assert.equal(g.ok, false);
  const body = await g.response.json();
  assert.equal(g.response.status, 401);
  assert.match(body.reason, /household/);
  assert.equal(body.signedIn, true);
});

test('a wrong key and nobody signed in: locked; an expired token is reported', async () => {
  process.env.BOARD_ACCESS_KEY = 'k';
  const g = await boardGate(req({ 'x-board-key': 'nope' }), { session: session(null, true), household: household({}) });
  assert.equal(g.ok, false);
  assert.equal((await g.response.json()).expired, true);
});

test('hiveSession says when a token had expired', async () => {
  const verify = async (t) => { if (t === 'old') throw new Error('expired'); if (t !== 'good') throw new Error('bad signature'); return { uid: 'u' }; };
  const r = (t) => req({ authorization: `Bearer ${t}` });
  assert.deepEqual(await hiveSession(r('old'), { verify }), { user: null, expired: true });
  assert.deepEqual(await hiveSession(r('junk'), { verify }), { user: null, expired: false });
  assert.equal((await hiveSession(r('good'), { verify })).user.uid, 'u');
  assert.deepEqual(await hiveSession(req(), { verify }), { user: null, expired: false });
});

test('household members come with their names, like Hive shows them', async () => {
  const read = async (path) => (path.startsWith('household_members')
    ? [{ user_id: 'a', role: 'owner' }, { user_id: 'b', role: 'member' }]
    : [{ id: 'a', email: 'ann@example.com', display_name: 'Ann' }, { id: 'b', email: 'bo@example.com', display_name: null }]);
  assert.deepEqual(await householdMembers('h', read), [
    { id: 'a', role: 'owner', email: 'ann@example.com', name: 'Ann' },
    { id: 'b', role: 'member', email: 'bo@example.com', name: 'bo' },
  ]);
});

test('in through the household alone, the site-wide app tokens are never used', async () => {
  const { asUser } = await import('./hiveUser.mjs');
  process.env.BOARD_ACCESS_KEY = 'k';
  process.env.KITCHENHUB_TOKEN = 'site-token';
  delete process.env.HIVE_SIGNING_KEY;
  const g = await boardGate(req(), { session: session({ uid: 'u9', email: 'x@y.z', email_verified: false }), household: household({ u9: 'their-own' }) });
  assert.equal(g.ok, true);
  const used = [];
  await assert.rejects(asUser(g.user, 'kitchenhub', 'KITCHENHUB_TOKEN', async (h) => { used.push(h); return {}; }));
  assert.deepEqual(used, []);
  // With the key, the fridge still falls back to the site token.
  const k = await boardGate(req({ 'x-board-key': 'k' }), { session: session(null), household: household({}) });
  await asUser(k.user, 'kitchenhub', 'KITCHENHUB_TOKEN', async (h) => { used.push(h.authorization); return {}; });
  assert.deepEqual(used, ['Bearer site-token']);
  delete process.env.KITCHENHUB_TOKEN;
});
