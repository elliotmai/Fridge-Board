import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { passApps } from '../functions/hive-pass.mjs';

const call = (body, headers = {}, method = 'POST') => handler(new Request('http://x/api/hive/pass', { method, headers: { 'content-type': 'application/json', ...headers }, body: method === 'POST' ? JSON.stringify(body) : undefined }));

test('only framed apps with an address can get a pass', () => {
  const apps = passApps();
  assert.ok(apps.includes('learnleaf'));
  assert.ok(!apps.includes('board')); // built into Hive
});

test('says plainly when Hive sign-in is not set up', async () => {
  delete process.env.HIVE_SIGNING_KEY; delete process.env.VITE_HIVE_FIREBASE_PROJECT_ID;
  const r = await call({ app: 'learnleaf' });
  assert.equal(r.status, 503);
  assert.deepEqual((await r.json()).missing, ['VITE_HIVE_FIREBASE_PROJECT_ID', 'HIVE_SIGNING_KEY']);
});

test('refuses unknown apps, missing sign-ins and GETs', async () => {
  process.env.HIVE_SIGNING_KEY = 'x'; process.env.VITE_HIVE_FIREBASE_PROJECT_ID = 'hive-test';
  assert.equal((await call({ app: 'not-an-app' })).status, 400);
  assert.equal((await call({ app: 'board' })).status, 400);
  assert.equal((await call({ app: 'learnleaf' })).status, 401); // no ID token
  assert.equal((await call({ app: 'learnleaf' }, { authorization: 'Bearer junk' })).status, 401);
  assert.equal((await call(null, {}, 'GET')).status, 405);
});
