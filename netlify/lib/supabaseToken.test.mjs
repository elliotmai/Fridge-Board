import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifySupabaseToken } from './supabaseToken.mjs';

const URL = 'https://p.supabase.co';
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'ES256' };
const keys = async () => [jwk];
const now = Date.now();

function token(claims, { kid = 'k1', key = privateKey, alg = 'ES256' } = {}) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${enc({ alg, kid, typ: 'JWT' })}.${enc(claims)}`;
  const sig = sign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${sig}`;
}
const good = { iss: `${URL}/auth/v1`, aud: 'authenticated', sub: 'u-1', email: 'me@example.com', exp: Math.floor(now / 1000) + 600, user_metadata: { display_name: 'Me' } };
const check = (t) => verifySupabaseToken(t, { url: URL, keys, now });

test('a good token gives the person', async () => {
  assert.deepEqual(await check(token(good)), { uid: 'u-1', email: 'me@example.com', email_verified: true, name: 'Me', screen: null });
});

test('a household screen is marked by the server-only app_metadata', async () => {
  assert.equal((await check(token({ ...good, app_metadata: { hive_screen: 'h-1' } }))).screen, 'h-1');
  assert.equal((await check(token({ ...good, user_metadata: { hive_screen: 'h-1' } }))).screen, null, 'not by anything a person can set');
});

test('bad tokens are refused', async () => {
  await assert.rejects(check('nope'), /malformed/);
  await assert.rejects(check(token({ ...good, exp: 1 })), /expired/);
  await assert.rejects(check(token({ ...good, iss: 'https://other.supabase.co/auth/v1' })), /issuer/);
  await assert.rejects(check(token({ ...good, aud: 'anon' })), /audience/);
  await assert.rejects(check(token(good, { kid: 'k2' })), /unknown signing key/);
  const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  await assert.rejects(check(token(good, { key: other })), /bad signature/);
  await assert.rejects(check(token({ ...good, is_anonymous: true })), /anonymous/);
});

test('an email Google says is unverified does not count', async () => {
  assert.equal((await check(token({ ...good, user_metadata: { email_verified: false } }))).email_verified, false);
});
