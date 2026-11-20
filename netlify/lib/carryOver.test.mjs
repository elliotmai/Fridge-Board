import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carryOver, checkLegacy, supabaseAdmin } from './carryOver.mjs';

const apps = { a: { key: 'ka' }, b: { key: 'kb' } };
// Project "a" knows me@example.com / right; project "b" is down.
const firebase = async (url, init) => {
  if (url.includes('key=kb')) throw new Error('down');
  const { email, password } = JSON.parse(init.body);
  if (email === 'me@example.com' && password === 'right') return new Response(JSON.stringify({ localId: 'fb-uid-1', email }), { status: 200 });
  return new Response(JSON.stringify({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }), { status: 400 });
};

test('checkLegacy asks every old project and ignores ones that are down', async () => {
  assert.deepEqual(await checkLegacy('me@example.com', 'right', { apps, fetch: firebase }), [{ app: 'a', uid: 'fb-uid-1', email: 'me@example.com' }]);
  assert.deepEqual(await checkLegacy('me@example.com', 'wrong', { apps, fetch: firebase }), []);
});

/** A pretend Supabase: users by id, profiles by email, legacy links. */
function fakeAdmin(users = {}) {
  const links = [];
  return {
    users, links,
    userIdByEmail: async (e) => Object.values(users).find((u) => u.email === e)?.id || null,
    getUser: async (id) => users[id],
    createUser: async (email, password) => { const id = `new-${email}`; users[id] = { id, email, password, app_metadata: {} }; return users[id]; },
    setPassword: async (id, password, meta) => { users[id] = { ...users[id], password, app_metadata: { ...meta, legacy: false } }; },
    linkLegacy: async (rows) => { links.push(...rows); },
  };
}
const check = (email, password) => checkLegacy(email, password, { apps, fetch: firebase });

test('a wrong password changes nothing', async () => {
  const admin = fakeAdmin();
  assert.equal((await carryOver('me@example.com', 'wrong', { admin, check })).ok, false);
  assert.deepEqual(admin.users, {});
});

test('no Supabase account yet: one is made with the old password, and linked', async () => {
  const admin = fakeAdmin();
  const r = await carryOver(' Me@Example.com ', 'right', { admin, check });
  assert.deepEqual(r, { ok: true, created: true });
  assert.equal(admin.users['new-me@example.com'].password, 'right');
  assert.deepEqual(admin.links, [{ app: 'a', legacy_id: 'fb-uid-1', user_id: 'new-me@example.com' }]);
});

test('an imported account waiting for its password gets it, once', async () => {
  const admin = fakeAdmin({ u1: { id: 'u1', email: 'me@example.com', app_metadata: { legacy: true } } });
  assert.deepEqual(await carryOver('me@example.com', 'right', { admin, check }), { ok: true, created: false });
  assert.equal(admin.users.u1.password, 'right');
  // Second time: the account has its own password now, so the old one can't reset it.
  assert.equal((await carryOver('me@example.com', 'right', { admin, check })).ok, false);
});

test('an account with its own Supabase password is never taken over', async () => {
  const admin = fakeAdmin({ u1: { id: 'u1', email: 'me@example.com', password: 'new', app_metadata: {} } });
  const r = await carryOver('me@example.com', 'right', { admin, check });
  assert.equal(r.ok, false);
  assert.equal(admin.users.u1.password, 'new');
  assert.deepEqual(admin.links, []);
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
