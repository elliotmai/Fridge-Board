import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeKeys, verifyPass } from './hiveAssertion.mjs';
import { appAuth, passHeader } from './hiveUser.mjs';
import { boardGate } from './household.mjs';
import { claimScreen, looksLikeCode, normaliseCode, removeScreen, screenPass, SCREEN_EMAIL_DOMAIN, withMembers } from './screens.mjs';

const HID = '11111111-2222-3333-4444-555555555555';
const SCREEN = { uid: '99999999-0000-0000-0000-000000000001', email: `screen-x@${SCREEN_EMAIL_DOMAIN}`, email_verified: true, name: 'Kitchen screen', screen: HID };

test('pairing codes are typed any way', () => {
  assert.equal(normaliseCode(' abcd-ef23 '), 'ABCDEF23');
  assert.ok(looksLikeCode('abcd ef23'));
  assert.ok(!looksLikeCode('ABCDEF21'), 'no 1s (or 0s, Is, Os)');
  assert.ok(!looksLikeCode('ABC'));
});

test('a screen gets household passes only for household apps', () => {
  const keys = makeKeys();
  const kitchen = verifyPass(screenPass(SCREEN, 'kitchenhub', keys.signingKey), 'kitchenhub', keys.publicKey);
  assert.equal(kitchen.sub, SCREEN.uid, 'KitchenHub: as the screen account, which it finds the household from');
  const farm = verifyPass(screenPass({ ...SCREEN, members: ['Eli@Example.com', 'b@example.com'] }, 'galaxyfarm', keys.signingKey), 'galaxyfarm', keys.publicKey);
  assert.equal(farm.kind, 'household');
  assert.equal(farm.household, HID);
  assert.equal(farm.sub, `household:${HID}`);
  assert.equal(farm.email, null, 'never readable as a person');
  assert.equal(farm.email_verified, false);
  assert.deepEqual(farm.members, ['eli@example.com', 'b@example.com']);
  assert.throws(() => screenPass(SCREEN, 'galaxyfarm', keys.signingKey), /confirmed email/, 'no people, no farm');
  for (const app of ['learnleaf', 'wander', 'ourden', 'alcoholtracker', 'stimultrack']) {
    assert.throws(() => screenPass({ ...SCREEN, members: ['a@b.c'] }, app, keys.signingKey), (e) => e.screenRefused, `${app} is personal`);
  }
});

test('the board calls apps as the household from a screen', () => {
  const keys = makeKeys();
  process.env.HIVE_SIGNING_KEY = keys.signingKey;
  const screen = { ...SCREEN, members: ['eli@example.com'], keyless: true };
  assert.match(passHeader(screen, 'galaxyfarm').authorization, /^Hive /);
  assert.throws(() => passHeader(screen, 'ourden'), /each person/);
  process.env.LEARNLEAF_TOKEN = 'old-token';
  assert.throws(() => appAuth(screen, 'learnleaf', 'LEARNLEAF_TOKEN'), /each person/, 'no site tokens without the board key');
  assert.equal(appAuth({ ...screen, keyless: false }, 'learnleaf', 'LEARNLEAF_TOKEN').authorization, 'Bearer old-token', 'with the key, the old token still works');
  delete process.env.LEARNLEAF_TOKEN;
  delete process.env.HIVE_SIGNING_KEY;
});

test('a removed screen is let in nowhere and gets no emails', async () => {
  const req = new Request('http://x/api/board');
  const out = await boardGate(req, { session: async () => ({ user: SCREEN, expired: false }), household: async () => null, members: async (u) => u });
  assert.equal(out.ok, false);
  assert.equal((await out.response.json()).removed, true);
  const inn = await boardGate(req, { session: async () => ({ user: SCREEN, expired: false }), household: async () => HID, members: async (u) => ({ ...u, members: ['a@b.c'] }) });
  assert.equal(inn.ok, true);
  assert.deepEqual(inn.user.members, ['a@b.c']);
  assert.equal(inn.user.keyless, true);
  assert.equal((await withMembers({ uid: 'person' }, null)).members, undefined, 'people are left alone');
  assert.deepEqual((await withMembers(SCREEN, {}, async () => { throw new Error('down'); })).members, []);
});

/** A fake service-role Supabase: records calls, answers from `answers`. */
function fakeSupabase(answers) {
  const calls = [];
  const call = async (path, init = {}) => {
    calls.push({ path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const hit = Object.entries(answers).find(([k]) => path.startsWith(k));
    if (!hit) throw new Error(`unexpected ${path}`);
    return typeof hit[1] === 'function' ? hit[1](init) : hit[1];
  };
  return { call, calls };
}

test('claiming a code makes the screen and hands back a sign-in token', async () => {
  const { call, calls } = fakeSupabase({
    '/rest/v1/rpc/claim_screen_code': [{ household_id: HID, name: 'Fridge', created_by: 'owner-1' }],
    '/auth/v1/admin/users': { id: SCREEN.uid },
    '/rest/v1/rpc/attach_screen': null,
    '/auth/v1/admin/generate_link': { properties: { hashed_token: 'tok' } },
  });
  const r = await claimScreen('abcd-ef23', { call, random: () => 'r1' });
  assert.deepEqual(r, { token: 'tok', name: 'Fridge', household: HID });
  assert.deepEqual(calls[0].body, { raw: 'ABCDEF23' });
  const made = calls[1].body;
  assert.equal(made.email, `screen-r1@${SCREEN_EMAIL_DOMAIN}`);
  assert.equal(made.app_metadata.hive_screen, HID, 'marked a screen where only the server can');
  assert.equal(made.password, undefined, 'no password: the code is the only way in');
  assert.deepEqual(calls[2].body, { uid: SCREEN.uid, hid: HID, screen_name: 'Fridge', made_by: 'owner-1' });
});

test('a code that does not work makes nothing', async () => {
  const { call, calls } = fakeSupabase({ '/rest/v1/rpc/claim_screen_code': [] });
  assert.equal(await claimScreen('ABCDEF23', { call }), null);
  assert.equal(calls.length, 1);
  assert.equal(await claimScreen('nope', { call }), null);
  assert.equal(calls.length, 1, 'malformed codes never reach the database');
});

test('if attaching fails, the half-made account is removed', async () => {
  const { call, calls } = fakeSupabase({
    '/rest/v1/rpc/claim_screen_code': [{ household_id: HID, name: 'Fridge', created_by: 'o' }],
    '/auth/v1/admin/users': (init) => (init.method === 'DELETE' ? null : { id: SCREEN.uid }),
    '/rest/v1/rpc/attach_screen': () => { throw new Error('guard'); },
  });
  await assert.rejects(claimScreen('ABCDEF23', { call }), /guard/);
  assert.equal(calls.at(-1).method, 'DELETE');
});

test('only an owner of its household removes a screen', async () => {
  const owner = { uid: 'owner-1' };
  const mk = (own) => fakeSupabase({
    '/rest/v1/screens': [{ household_id: HID }],
    '/rest/v1/household_members': own ? [{ role: 'owner' }] : [],
    '/auth/v1/admin/users/': null,
  });
  let f = mk(true);
  assert.equal(await removeScreen(owner, SCREEN.uid, f), true);
  assert.equal(f.calls.at(-1).method, 'DELETE');
  f = mk(false);
  assert.equal(await removeScreen(owner, SCREEN.uid, f), false);
  assert.ok(!f.calls.some((c) => c.method === 'DELETE'));
  assert.equal(await removeScreen(SCREEN, SCREEN.uid, mk(true)), false, 'a screen can’t remove screens');
  assert.equal(await removeScreen(owner, 'not-a-uuid', mk(true)), false);
});
