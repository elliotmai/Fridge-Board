import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeKeys, verifyPass } from './hiveAssertion.mjs';
import handler, { parseCookies, safeReturn, userFromCookie } from '../functions/hive-hop.mjs';

const keys = makeKeys();
const hop = (qs, cookie) => handler(new Request(`https://hive.flyingdoublemranch.com/api/hive/hop?${qs}`, { headers: cookie ? { cookie } : {} }));
const ret = encodeURIComponent('https://aero-logger.com/?x=1#old');

test('a pass only ever goes back to the app it was made for', () => {
  assert.equal(safeReturn('aerologger', 'https://aero-logger.com/logbook').href, 'https://aero-logger.com/logbook');
  assert.equal(safeReturn('aerologger', 'https://evil.example/'), null);
  assert.equal(safeReturn('aerologger', 'https://aero-logger.com.evil.example/'), null);
  assert.equal(safeReturn('aerologger', 'http://aero-logger.com/'), null);
  assert.equal(safeReturn('learnleaf', 'https://aero-logger.com/'), null);
  assert.equal(safeReturn('board', 'https://hive.flyingdoublemranch.com/'), null); // built in, no passes
  assert.equal(safeReturn('nope', 'https://aero-logger.com/'), null);
});

test('refuses a bad return address instead of redirecting', async () => {
  assert.equal((await hop(`app=aerologger&return=${encodeURIComponent('https://evil.example/')}`)).status, 400);
});

test('no Hive session: straight back with an empty pass', async () => {
  process.env.HIVE_SIGNING_KEY = keys.signingKey;
  const r = await hop(`app=aerologger&return=${ret}`, 'other=1');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://aero-logger.com/?x=1#hive-pass=');
  delete process.env.HIVE_SIGNING_KEY;
});

test('reads the session from the cookie and passes back any refreshed cookies', async () => {
  const req = new Request('https://x/', { headers: { cookie: 'hive-auth.0=abc; hive-auth.1=def' } });
  let seen;
  const client = (url, key, o) => {
    seen = o.cookies.getAll();
    return { auth: { getSession: async () => { o.cookies.setAll([{ name: 'hive-auth.0', value: 'new', options: {} }]); return { data: { session: { access_token: 't' } } }; } } };
  };
  const me = { uid: 'u1', email: 'me@example.com', email_verified: true, name: 'Me' };
  const { user, cookies } = await userFromCookie(req, { client, verify: async (t) => (assert.equal(t, 't'), me) });
  assert.deepEqual(user, me);
  assert.deepEqual(seen.map((c) => c.name), ['hive-auth.0', 'hive-auth.1']);
  assert.match(cookies[0], /^hive-auth\.0=new; Path=\/; Domain=\.flyingdoublemranch\.com; .*SameSite=Lax; Secure/);
  assert.deepEqual(await userFromCookie(new Request('https://x/', { headers: { cookie: 'a=b' } })), { user: null, cookies: [] });
});

test('parses a cookie header', () => {
  assert.deepEqual(parseCookies('a=1; b=x%20y'), [{ name: 'a', value: '1' }, { name: 'b', value: 'x y' }]);
});

test('a pass made by the hop checks out for the app', async () => {
  // signPass is what the hop uses; the app side verifies with Hive's public key.
  const { signPass } = await import('./hiveAssertion.mjs');
  const p = signPass({ uid: 'u1', email: 'me@example.com', email_verified: true }, 'aerologger', keys.signingKey);
  assert.equal(verifyPass(p, 'aerologger', keys.publicKey).sub, 'u1');
});
