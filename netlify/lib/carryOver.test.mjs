import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carryOver, checkLegacy, supabaseAdmin } from './carryOver.mjs';

// Project "a" knows me@example.com / right and confirmed the email; project
// "u" knows me@example.com / other but never confirmed it; "down" is down.
const apps = { a: { key: 'ka' }, u: { key: 'ku' }, down: { key: 'kd' } };
const firebase = async (url, init) => {
  if (url.includes('key=kd')) throw new Error('down');
  const body = JSON.parse(init.body);
  if (url.includes(':lookup')) return new Response(JSON.stringify({ users: [{ emailVerified: body.idToken === 'tok-a' }] }), { status: 200 });
  const ok = (url.includes('key=ka') && body.password === 'right') || (url.includes('key=ku') && body.password === 'other');
  if (body.email === 'me@example.com' && ok) {
    const a = url.includes('key=ka');
    return new Response(JSON.stringify({ localId: a ? 'fb-a' : 'fb-u', email: body.email, idToken: a ? 'tok-a' : 'tok-u' }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }), { status: 400 });
};
const check = (email, password) => checkLegacy(email, password, { apps, fetch: firebase });

test('checkLegacy asks every old project, notes which confirmed the email, and ignores ones that are down', async () => {
  assert.deepEqual(await check('me@example.com', 'right'), [{ app: 'a', uid: 'fb-a', email: 'me@example.com', verified: true }]);
  assert.deepEqual(await check('me@example.com', 'other'), [{ app: 'u', uid: 'fb-u', email: 'me@example.com', verified: false }]);
  assert.deepEqual(await check('me@example.com', 'wrong'), []);
});

/** A pretend Supabase that records what it was asked to do. */
function fakeAdmin(users = {}) {
  const did = [];
  return {
    users, did,
    userIdByEmail: async (e) => Object.values(users).find((u) => u.email === e)?.id || null,
    getUser: async (id) => users[id],
    createUser: async (email, password) => { const id = `new-${email}`; users[id] = { id, email, password, email_confirmed_at: 'now', app_metadata: {} }; did.push('create'); return users[id]; },
    setPassword: async (id, password, meta) => { users[id] = { ...users[id], password, app_metadata: { ...meta, legacy: false } }; did.push('setPassword'); },
    sendConfirmation: async () => did.push('confirmEmail'),
    sendSignInLink: async (e, r, o) => did.push(o?.create ? 'linkEmail+create' : 'linkEmail'),
    signInToken: async () => { did.push('token'); return 'hashed'; },
    linkLegacy: async (rows) => did.push(`link:${rows.map((r) => r.app).join(',')}`),
  };
}
const confirmedUser = (extra = {}) => ({ u1: { id: 'u1', email: 'me@example.com', password: 'mine', email_confirmed_at: 'then', app_metadata: {}, ...extra } });

test('a wrong password changes nothing', async () => {
  const admin = fakeAdmin();
  assert.equal((await carryOver('me@example.com', 'wrong', { admin, check })).ok, false);
  assert.deepEqual(admin.did, []);
});

test('no account yet, confirmed old email: made with that password', async () => {
  const admin = fakeAdmin();
  assert.deepEqual(await carryOver(' Me@Example.com ', 'right', { admin, check }), { ok: true, how: 'password' });
  assert.equal(admin.users['new-me@example.com'].password, 'right');
  assert.deepEqual(admin.did, ['create', 'link:a']);
});

test('no account yet, unconfirmed old email: only an emailed link can make it', async () => {
  const admin = fakeAdmin();
  assert.deepEqual(await carryOver('me@example.com', 'other', { admin, check }), { ok: true, how: 'email' });
  assert.deepEqual(admin.did, ['linkEmail+create']);
  assert.deepEqual(admin.users, {}, 'no account, and so no password, until the email is followed');
});

test('a second old password, confirmed: signed in by token, Hive password untouched', async () => {
  const admin = fakeAdmin(confirmedUser());
  assert.deepEqual(await carryOver('me@example.com', 'right', { admin, check }), { ok: true, how: 'token', token: 'hashed' });
  assert.equal(admin.users.u1.password, 'mine');
  assert.deepEqual(admin.did, ['token', 'link:a']);
});

test('a second old password, unconfirmed: only an emailed link, never a sign-in', async () => {
  const admin = fakeAdmin(confirmedUser());
  assert.deepEqual(await carryOver('me@example.com', 'other', { admin, check }), { ok: true, how: 'email' });
  assert.equal(admin.users.u1.password, 'mine');
  assert.ok(!admin.did.includes('token') && !admin.did.includes('setPassword'));
});

test('an imported account gets a confirmed old password, but never an unconfirmed one', async () => {
  const a = fakeAdmin(confirmedUser({ password: null, app_metadata: { legacy: true } }));
  assert.deepEqual(await carryOver('me@example.com', 'right', { admin: a, check }), { ok: true, how: 'password' });
  assert.equal(a.users.u1.password, 'right');

  const b = fakeAdmin(confirmedUser({ password: null, app_metadata: { legacy: true } }));
  assert.deepEqual(await carryOver('me@example.com', 'other', { admin: b, check }), { ok: true, how: 'email' });
  assert.equal(b.users.u1.password, null);
  assert.ok(b.did.includes('linkEmail'));
});

test('supabaseAdmin speaks to the core schema with the service key', async () => {
  const seen = [];
  const f = async (url, init) => { seen.push({ url, init }); return new Response('[{"id":"u1"}]', { status: 200 }); };
  const admin = supabaseAdmin('https://p.supabase.co', 'svc', f);
  assert.equal(await admin.userIdByEmail('me@example.com'), 'u1');
  assert.match(seen[0].url, /\/rest\/v1\/profiles\?select=id&email=eq\.me%40example\.com$/);
  assert.equal(seen[0].init.headers['accept-profile'], 'core');
  assert.equal(seen[0].init.headers.authorization, 'Bearer svc');
  await supabaseAdmin('https://p.supabase.co', 'sb_secret_x', f).userIdByEmail('a@b.c');
  assert.equal(seen[1].init.headers.apikey, 'sb_secret_x');
  assert.equal(seen[1].init.headers.authorization, undefined);
});
