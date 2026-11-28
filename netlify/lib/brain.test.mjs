import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brainKey, handleReport, hashKey, MAX_BODY_BYTES } from './brain.mjs';

const KEY = 'hb_' + 'a1'.repeat(24);
const req = (body, { key = KEY, method = 'POST' } = {}) => new Request('http://x/api/brain/report', {
  method,
  headers: key ? { authorization: `Bearer ${key}` } : {},
  body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
});
const answer = (status, body) => async () => new Response(JSON.stringify(body), { status });

test('only a well-formed hb_ key is read', () => {
  assert.equal(brainKey(req({})), KEY);
  assert.equal(brainKey(req({}, { key: 'sk-ant-something' })), null);
  assert.equal(brainKey(req({}, { key: null })), null);
});

test('the key itself never leaves: only its SHA-256 goes to the database', async () => {
  let sent;
  const call = async (path, init) => { sent = { path, ...init }; return new Response('{"ok":true,"node":"n1","event":7}', { status: 200 }); };
  const r = await handleReport(req({ node: { key: 'session:s1' } }), call);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, node: 'n1', event: 7 });
  assert.equal(sent.path, '/rest/v1/rpc/report');
  assert.equal(sent.headers['content-profile'], 'brain');
  const body = JSON.parse(sent.body);
  assert.equal(body.key_hash, hashKey(KEY));
  assert.match(body.key_hash, /^[0-9a-f]{64}$/);
  assert.ok(!sent.body.includes(KEY));
  assert.deepEqual(body.p, { node: { key: 'session:s1' } });
});

test('no key, wrong method, bad JSON and oversized bodies are refused before the database', async () => {
  const never = async () => { throw new Error('should not be called'); };
  assert.equal((await handleReport(req({}, { key: null }), never)).status, 401);
  assert.equal((await handleReport(req(null, { method: 'GET' }), never)).status, 405);
  assert.equal((await handleReport(req('{nope'), never)).status, 400);
  assert.equal((await handleReport(req('[1]'), never)).status, 400);
  assert.equal((await handleReport(req('x'.repeat(MAX_BODY_BYTES + 1)), never)).status, 413);
});

test("the database's answers map to HTTP", async () => {
  assert.equal((await handleReport(req({}), answer(403, { code: '42501', message: 'unknown or revoked brain key' }))).status, 401);
  const bad = await handleReport(req({}), answer(400, { code: '22023', message: 'node.key is required' }));
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'node.key is required');
  assert.equal((await handleReport(req({}), answer(500, { code: 'XX000', message: 'boom' }))).status, 502);
  assert.equal((await handleReport(req({}), async () => { throw new Error('down'); })).status, 502);
});
