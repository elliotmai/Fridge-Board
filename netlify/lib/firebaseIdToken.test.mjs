import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyFirebaseIdToken } from './firebaseIdToken.mjs';

const PROJECT = 'hive-app';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keys = async () => ({ k1: publicKey.export({ type: 'spki', format: 'pem' }) });
const NOW = 1_800_000_000_000;
const secs = NOW / 1000;

function token(claims = {}, { kid = 'k1', alg = 'RS256', key = privateKey } = {}) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = { aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'u1', iat: secs - 60, exp: secs + 3000, auth_time: secs - 60, email: 'a@example.com', email_verified: true, name: 'A', ...claims };
  const head = `${enc({ alg, kid, typ: 'JWT' })}.${enc(body)}`;
  return `${head}.${sign('RSA-SHA256', Buffer.from(head), key).toString('base64url')}`;
}
const check = (t) => verifyFirebaseIdToken(t, { projectId: PROJECT, keys, now: NOW });

test('returns the user and their email claims', async () => {
  assert.deepEqual(await check(token()), { uid: 'u1', email: 'a@example.com', email_verified: true, name: 'A' });
});
test('email_verified is only true when Google says so', async () => {
  assert.equal((await check(token({ email_verified: 'true' }))).email_verified, false);
  assert.equal((await check(token({ email_verified: undefined }))).email_verified, false);
});
test('refuses other keys, other projects, expired and junk tokens', async () => {
  await assert.rejects(check(token({}, { key: other.privateKey })), /bad signature/);
  await assert.rejects(check(token({ aud: 'x' })), /audience/);
  await assert.rejects(check(token({ exp: secs - 1 })), /expired/);
  await assert.rejects(check(token({}, { kid: 'nope' })), /unknown signing key/);
  await assert.rejects(check(token({}, { alg: 'HS256' })), /algorithm/);
  await assert.rejects(check('junk'), /malformed/);
  await assert.rejects(verifyFirebaseIdToken(token(), { keys, now: NOW }), /project/);
});
