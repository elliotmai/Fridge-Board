import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { makeKeys, signPass } from './hiveAssertion.mjs';
import handler, { EXCHANGE_APPS, exchange } from '../functions/app-exchange.mjs';
import { CATALOG } from '../../src/config/catalog.js';
import { passApps } from '../functions/hive-pass.mjs';

const keys = makeKeys();
const me = { uid: 'h1', email: 'me@example.com', email_verified: true, name: 'Me' };
const pass = (user = me, app = 'aerologger') => signPass(user, app, keys.signingKey);
const deps = (o = {}) => ({
  publicKey: keys.publicKey, sa: { project_id: 'p' },
  find: async (email) => ({ 'me@example.com': 'uid-me' })[email] ?? null,
  create: async () => 'uid-new',
  mint: (uid) => `token-for-${uid}`,
  ...o,
});
const run = async (p, o) => { const r = await exchange(p, 'aerologger', deps(o)); return { status: r.status, body: await r.json() }; };

test('every app signed in here is one Hive gives passes to, at the address its frame opens', () => {
  for (const [id, a] of Object.entries(EXCHANGE_APPS)) {
    assert.ok(passApps().includes(id), id);
    assert.ok(a.origins.includes(new URL(CATALOG[id].url).origin), id);
  }
});

test('an existing account signs straight in; a new person gets one', async () => {
  assert.deepEqual(await run(pass()), { status: 200, body: { token: 'token-for-uid-me', created: false, name: 'Me' } });
  assert.deepEqual(await run(pass({ ...me, email: 'new@example.com' })), { status: 200, body: { token: 'token-for-uid-new', created: true, name: 'Me' } });
});

test('an app closed to new people only signs in existing accounts', async () => {
  assert.equal((await run(pass({ ...me, email: 'new@example.com' }), { allowNew: false })).status, 403);
  assert.equal((await run(pass(), { allowNew: false })).status, 200);
});

test('a pass for another app, a forged pass, or an unverified email gets nothing', async () => {
  assert.equal((await run(pass(me, 'learnleaf'))).status, 401);
  assert.equal((await run(signPass(me, 'aerologger', makeKeys().signingKey))).status, 401);
  assert.equal((await run(pass({ ...me, email_verified: false }))).status, 401);
  assert.equal((await run('junk')).status, 401);
});

const call = (app, { method = 'POST', origin = 'https://aero-logger.com', body = { pass: 'x' } } = {}) =>
  handler(new Request(`http://x/api/hive/exchange/${app}`, { method, headers: { origin, 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined }), { params: { app } });

test('only the app\'s own address may call, and unknown apps are refused', async () => {
  const pre = await call('aerologger', { method: 'OPTIONS' });
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://aero-logger.com');
  assert.equal((await call('aerologger', { method: 'OPTIONS', origin: 'https://evil.example' })).headers.get('access-control-allow-origin'), null);
  assert.equal((await call('learnleaf')).status, 404);
  assert.equal((await call('toString')).status, 404);
});

test('says plainly when the app\'s service account is missing or for another project', async () => {
  delete process.env.AEROLOGGER_SERVICE_ACCOUNT;
  let r = await call('aerologger');
  assert.equal(r.status, 503);
  assert.deepEqual((await r.json()).missing, ['AEROLOGGER_SERVICE_ACCOUNT']);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.AEROLOGGER_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'a@b', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), project_id: 'someone-else' });
  r = await call('aerologger');
  assert.equal(r.status, 503);
  process.env.AEROLOGGER_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'a@b', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), project_id: 'aerologger-ec6a6' });
  assert.equal((await call('aerologger', { body: {} })).status, 400);
  assert.equal((await call('aerologger', { body: { pass: 'junk' } })).status, 401);
  delete process.env.AEROLOGGER_SERVICE_ACCOUNT;
});
