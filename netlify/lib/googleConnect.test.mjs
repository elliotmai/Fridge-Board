import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkGrant, connect, isConnected, linkStatus, tokensFrom } from './googleConnect.mjs';
import { makeKeys, verifyPass } from './hiveAssertion.mjs';
import { handle } from '../functions/google-connect.mjs';
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from '../../src/config/google.js';

const RT = '1//0refresh-token-from-google-xyz';
const AT = 'ya29.access-token-from-google-abc';
const SCOPE = `openid email profile ${GOOGLE_SCOPES}`;

/** A stand-in for Google's tokeninfo and Supabase's REST API that records each call. */
function fakeFetch({ info = { aud: GOOGLE_CLIENT_ID, azp: GOOGLE_CLIENT_ID, scope: SCOPE }, infoStatus = 200, rows = [], storeStatus = 201, den = null } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, ...init });
    const u = new URL(url);
    if (u.pathname === '/api/board/google/status') return den ? den(init) : new Response('{"error":"Not found"}', { status: 404 });
    if (u.host === 'oauth2.googleapis.com') return new Response(JSON.stringify(infoStatus === 200 ? info : { error: 'invalid_token' }), { status: infoStatus });
    if (u.pathname === '/rest/v1/google_tokens' && init.method === 'POST') return new Response(null, { status: storeStatus });
    if (u.pathname === '/rest/v1/google_tokens') return new Response(JSON.stringify(rows), { status: 200 });
    throw new Error(`unexpected ${url}`);
  };
  return { f, calls };
}

beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test'; });
afterEach(() => { delete process.env.SUPABASE_SERVICE_ROLE_KEY; });

test('only plausible tokens are accepted from the browser', () => {
  assert.deepEqual(tokensFrom({ refreshToken: RT, accessToken: AT }), { refreshToken: RT, accessToken: AT });
  for (const b of [null, {}, { refreshToken: RT }, { accessToken: AT }, { refreshToken: 'short', accessToken: AT }, { refreshToken: `${RT}"; drop`, accessToken: AT }, { refreshToken: 5, accessToken: AT }]) {
    assert.throws(() => tokensFrom(b), (e) => e.status === 400, JSON.stringify(b));
  }
});

test('the grant must be for our client, with Calendar (read only) and Tasks', async () => {
  const { f, calls } = fakeFetch();
  await checkGrant(AT, { f });
  // The access token goes in the POST body, never in a URL.
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/tokeninfo');
  assert.equal(new URLSearchParams(calls[0].body).get('access_token'), AT);

  await assert.rejects(checkGrant(AT, fakeFetch({ info: { aud: 'someone-else', azp: 'someone-else', scope: SCOPE } })), /wasn’t for Hive/);
  await assert.rejects(checkGrant(AT, fakeFetch({ info: { aud: GOOGLE_CLIENT_ID, scope: 'openid email https://www.googleapis.com/auth/tasks' } })), /both Calendar and Tasks/);
  await assert.rejects(checkGrant(AT, fakeFetch({ infoStatus: 400 })), /expired/);
});

test('connecting stores the refresh token in den.google_tokens exactly as Our Den does', async () => {
  const { f, calls } = fakeFetch();
  assert.deepEqual(await connect('user-1', { refreshToken: RT, accessToken: AT }, { f }), { connected: true });
  const store = calls.find((c) => c.method === 'POST' && c.url.includes('/rest/v1/'));
  assert.equal(store.url, 'https://fcjiummxpacwriwopcho.supabase.co/rest/v1/google_tokens?on_conflict=user_id');
  assert.equal(store.headers['content-profile'], 'den');
  assert.equal(store.headers.apikey, 'sb_secret_test');
  assert.equal(store.headers.authorization, undefined);
  assert.equal(store.headers.prefer, 'resolution=merge-duplicates,return=minimal');
  const row = JSON.parse(store.body);
  assert.deepEqual(Object.keys(row).sort(), ['refresh_token', 'updated_at', 'user_id']);
  assert.equal(row.user_id, 'user-1');
  assert.equal(row.refresh_token, RT);
});

test('a refused grant stores nothing', async () => {
  const { f, calls } = fakeFetch({ info: { aud: 'other', scope: SCOPE } });
  await assert.rejects(connect('user-1', { refreshToken: RT, accessToken: AT }, { f }));
  assert.equal(calls.filter((c) => c.url.includes('/rest/v1/')).length, 0);
});

test('without the service key it says what to set', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await assert.rejects(connect('u', { refreshToken: RT, accessToken: AT }, fakeFetch()), (e) => e.status === 503 && /SUPABASE_SERVICE_ROLE_KEY/.test(e.message));
});

test('status reads only whether a row exists', async () => {
  const { f, calls } = fakeFetch({ rows: [{ user_id: 'u' }] });
  assert.equal(await isConnected('u', { f }), true);
  assert.match(calls[0].url, /user_id=eq\.u&select=user_id$/);
  assert.equal(await isConnected('u', fakeFetch({ rows: [] })), false);
});

/* ------------------------------------------------------------ the function --- */
const verify = async (t) => { if (t !== 'good') throw new Error('bad'); return { uid: 'user-1', email: 'me@example.com', email_verified: true }; };
const req = (method, { auth = 'Bearer good', body } = {}) => new Request('https://hive.example/api/google/connect', {
  method, headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
});

test('the function needs a Hive sign-in', async () => {
  const { f, calls } = fakeFetch();
  assert.equal((await handle(req('POST', { auth: null, body: { refreshToken: RT, accessToken: AT } }), { verify, f })).status, 401);
  assert.equal((await handle(req('POST', { auth: 'Bearer forged', body: { refreshToken: RT, accessToken: AT } }), { verify, f })).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await handle(req('DELETE'), { verify, f })).status, 405);
});

test('the function connects the signed-in person, and reports status', async () => {
  const { f, calls } = fakeFetch();
  const res = await handle(req('POST', { body: { refreshToken: RT, accessToken: AT } }), { verify, f });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { connected: true });
  assert.ok(!text.includes(RT) && !text.includes(AT), 'tokens never come back');
  assert.equal(JSON.parse(calls.at(-1).body).user_id, 'user-1');

});

test('status comes from Our Den checking with Google, as the signed-in person', async () => {
  const keys = makeKeys();
  process.env.HIVE_SIGNING_KEY = keys.signingKey;
  try {
    let pass = null;
    const answer = { connected: true, working: false, calendar: 'Google answered 403: Google Calendar API has not been used', tasks: true };
    const { f } = fakeFetch({ den: (init) => { pass = init.headers.authorization; return new Response(JSON.stringify(answer)); } });
    const res = await handle(req('GET'), { verify, f });
    assert.deepEqual(await res.json(), { ...answer, checked: true });
    assert.equal(verifyPass(pass.replace(/^Hive /, ''), 'ourden', keys.publicKey).sub, 'user-1');
  } finally { delete process.env.HIVE_SIGNING_KEY; }
});

test('when Our Den can’t be asked, status falls back to whether a link is stored, marked unchecked', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    assert.deepEqual(await linkStatus('u', {}, fakeFetch({ rows: [{ user_id: 'u' }] })), { connected: true, checked: false });
    assert.deepEqual(await linkStatus('u', {}, fakeFetch({ rows: [] })), { connected: false, checked: false, reason: 'Google isn’t connected yet' });
    const s = await handle(req('GET'), { verify, f: fakeFetch({ den: () => { throw new Error('down'); }, rows: [] }).f });
    assert.equal((await s.json()).connected, false);
  } finally { console.warn = warn; }
});

test('errors come back readable, without tokens, and are not logged with them', async () => {
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  try {
    const bad = await handle(req('POST', { body: { refreshToken: RT, accessToken: AT } }), { verify, f: fakeFetch({ storeStatus: 500 }).f });
    assert.equal(bad.status, 502);
    assert.ok(!(await bad.text()).includes(RT));
    const boom = async () => { throw new Error('socket closed'); };
    const res = await handle(req('POST', { body: { refreshToken: RT, accessToken: AT } }), { verify, f: boom });
    assert.equal(res.status, 502);
  } finally { console.error = orig; }
  assert.ok(logged.every((l) => !l.includes(RT) && !l.includes(AT)));
});
