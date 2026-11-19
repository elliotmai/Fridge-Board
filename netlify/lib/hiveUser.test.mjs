import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appAuth, hiveUser, passHeader } from './hiveUser.mjs';
import { makeKeys, verifyPass } from './hiveAssertion.mjs';

const req = (auth) => new Request('http://x/api/board', { headers: auth ? { authorization: auth } : {} });
const verify = async (t) => { if (t !== 'good') throw new Error('bad'); return { uid: 'u1', email: 'me@example.com', email_verified: true }; };

test('no token or a bad token means nobody', async () => {
  assert.equal(await hiveUser(req(), { verify }), null);
  assert.equal(await hiveUser(req('Bearer junk'), { verify }), null);
  assert.equal((await hiveUser(req('Bearer good'), { verify })).uid, 'u1');
});

test('a pass header only for a signed-in, confirmed user, made for that app', () => {
  const keys = makeKeys();
  process.env.HIVE_SIGNING_KEY = keys.signingKey;
  assert.throws(() => passHeader(null, 'ourden'), /Sign in/);
  assert.throws(() => passHeader({ uid: 'u', email: 'a@b.c', email_verified: false }, 'ourden'), /Confirm/);
  const h = passHeader({ uid: 'u', email: 'a@b.c', email_verified: true }, 'ourden');
  const claims = verifyPass(h.authorization.replace(/^Hive /, ''), 'ourden', keys.publicKey);
  assert.equal(claims.email, 'a@b.c');
  delete process.env.HIVE_SIGNING_KEY;
  assert.throws(() => passHeader({ uid: 'u', email: 'a@b.c', email_verified: true }, 'ourden'), /not set up/);
});

test('apps are called as the Hive user when signed in, else with the old token', () => {
  const keys = makeKeys();
  const me = { uid: 'u', email: 'a@b.c', email_verified: true };
  process.env.HIVE_SIGNING_KEY = keys.signingKey;
  process.env.LEARNLEAF_TOKEN = 'old-token';
  assert.match(appAuth(me, 'learnleaf', 'LEARNLEAF_TOKEN').authorization, /^Hive /);
  assert.equal(appAuth(null, 'learnleaf', 'LEARNLEAF_TOKEN').authorization, 'Bearer old-token');
  assert.equal(appAuth({ ...me, email_verified: false }, 'learnleaf', 'LEARNLEAF_TOKEN').authorization, 'Bearer old-token');
  delete process.env.LEARNLEAF_TOKEN;
  assert.throws(() => appAuth(null, 'learnleaf', 'LEARNLEAF_TOKEN'), /Sign in to Hive/);
  delete process.env.HIVE_SIGNING_KEY;
});
