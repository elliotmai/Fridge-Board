import test from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_KEY, connectRequest, hasPending, judgeReturn, savePending, takePending } from './googleReturn.js';

const HIVE = 'https://hive.flyingdoublemranch.com';
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

test('a pending connect is read once, and only while fresh', () => {
  const s = store();
  savePending(s, { uid: 'u1', back: 'https://den.flyingdoublemranch.com/google' }, 1000);
  assert.ok(hasPending(s));
  assert.deepEqual(takePending(s, 2000), { uid: 'u1', back: 'https://den.flyingdoublemranch.com/google' });
  assert.equal(takePending(s, 2000), null);
  assert.ok(!hasPending(s));

  savePending(s, { uid: 'u1' }, 0);
  assert.equal(takePending(s, 31 * 60 * 1000), null, 'stale');
  s.setItem(PENDING_KEY, '{nope');
  assert.equal(takePending(s), null, 'garbled');
  s.setItem(PENDING_KEY, JSON.stringify({ at: Date.now() }));
  assert.equal(takePending(s), null, 'no uid');
});

test('other apps can send people here to connect, and back only within the shared domain', () => {
  assert.equal(connectRequest('?x=1', HIVE), null);
  assert.deepEqual(connectRequest('?connect=google', HIVE), { back: null });
  assert.deepEqual(connectRequest(`?connect=google&back=${encodeURIComponent('https://den.flyingdoublemranch.com/google')}`, HIVE), { back: 'https://den.flyingdoublemranch.com/google' });
  assert.deepEqual(connectRequest(`?connect=google&back=${encodeURIComponent('https://evil.example/')}`, HIVE), { back: null });
  assert.deepEqual(connectRequest('?connect=google&back=javascript:alert(1)', HIVE), { back: null });
});

test('the return from Google is kept only for the person who started it, with both tokens', () => {
  const pending = { uid: 'u1', back: null };
  const session = { user: { id: 'u1' }, provider_token: 'at', provider_refresh_token: 'rt' };
  assert.deepEqual(judgeReturn(pending, session), { ok: true, refreshToken: 'rt', accessToken: 'at' });
  assert.match(judgeReturn(pending, { ...session, user: { id: 'u2' } }).message, /different Hive account/);
  assert.match(judgeReturn(pending, { ...session, provider_refresh_token: undefined }).message, /didn’t connect/);
  assert.match(judgeReturn(pending, null).message, /signed out/);
});
