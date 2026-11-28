import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeKeys, verifyPass } from './hiveAssertion.mjs';
import { appAuth, passHeader } from './hiveUser.mjs';
import { boardGate } from './household.mjs';
import { bothView, claimScreen, householdPeople, initialsFor, looksLikeCode, mergeGoogle, mergeLearnleaf, mergeWander, normaliseCode, personFor, removeScreen, screenPass, SCREEN_EMAIL_DOMAIN, tagId, untagId, withMembers } from './screens.mjs';

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

/* ---------------------------------------------------------- Both view --- */
const ELI = { uid: 'u-eli', name: 'Eli', email: 'eli@example.com', email_verified: true, initial: 'E', share: { google: true, learnleaf: true, wander: true } };
const KAT = { uid: 'u-kat', name: 'Kat', email: 'kat@example.com', email_verified: true, initial: 'K', share: { google: true, learnleaf: false, wander: true } };

test('people get short initials, two letters only where they clash', () => {
  assert.deepEqual(initialsFor([{ name: 'Eli' }, { name: 'Kat' }]), ['E', 'K']);
  assert.deepEqual(initialsFor([{ name: 'Eli' }, { name: 'emma' }]), ['El', 'Em']);
});

test('what each person shares comes from their own sign-in, off by default', async () => {
  const users = { a: { email: 'A@x.com', email_confirmed_at: 'now', user_metadata: { hive_screen_share: { google: true, wander: 'yes' } } }, b: { email: 'b@x.com' } };
  const people = await householdPeople([{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bo' }, { id: 'c', name: 'Cy', email: 'c@x.com' }], async (id) => {
    if (!users[id]) throw new Error('gone');
    return users[id];
  });
  assert.deepEqual(people[0].share, { google: true, learnleaf: false, wander: false }, 'only a real true counts');
  assert.equal(people[0].email, 'a@x.com');
  assert.equal(people[1].email_verified, false);
  assert.deepEqual(people[2].share, { google: false, learnleaf: false, wander: false }, 'unreadable: shares nothing');
});

test('tagged ids lead back to their person, only for what they share', () => {
  assert.deepEqual(untagId(tagId('u-eli', 'list~1')), { uid: 'u-eli', id: 'list~1' });
  assert.equal(untagId('plain'), null);
  assert.equal(personFor([ELI, KAT], 'u-eli~t1', 'learnleaf').id, 't1');
  assert.equal(personFor([ELI, KAT], 'u-kat~t1', 'learnleaf'), null, 'Kat doesn’t share LearnLeaf');
  assert.equal(personFor([ELI, KAT], 'u-zed~t1', 'google'), null);
  assert.equal(personFor([{ ...ELI, email_verified: false }], 'u-eli~t1', 'google'), null);
});

test('Both merges calendars, tasks and trips with whose they are', () => {
  const g = mergeGoogle([
    { person: ELI, data: { events: [{ id: 'e1', iCalUID: 'shared', title: 'Dinner' }, { id: 'e2', title: 'Vet' }], tasks: [{ id: 't', list: 'L', title: 'Feed' }] } },
    { person: KAT, data: { events: [{ id: 'x9', iCalUID: 'shared', title: 'Dinner' }], tasks: [] } },
  ]);
  assert.equal(g.events.length, 2, 'a shared event once');
  assert.deepEqual([g.events[0].who, g.events[0].whoName], ['E+K', 'Eli and Kat']);
  assert.equal(g.events[1].who, 'E');
  assert.deepEqual([g.tasks[0].list, g.tasks[0].who], ['u-eli~L', 'E']);

  const l = mergeLearnleaf([{ person: ELI, data: { tasks: [{ id: '1', subject: 's' }], subjects: { s: ['Math', '#f00'] } } }]);
  assert.equal(l.tasks[0].id, 'u-eli~1');
  assert.deepEqual(l.subjects[l.tasks[0].subject], ['Math', '#f00']);

  const w = mergeWander([
    { person: ELI, data: { trips: [{ id: 'tr', name: 'Lisbon', items: [{ date: '2026-12-02', time: '9:00 AM' }] }] } },
    { person: KAT, data: { trips: [{ id: 'tr', name: 'Lisbon', items: [{ date: '2026-12-01' }] }] } },
  ]);
  assert.equal(w.trips.length, 1);
  assert.equal(w.trips[0].who, 'E+K');
  assert.deepEqual(w.trips[0].items.map((i) => i.who), ['K', 'E'], 'each person’s travel, in date order');
});

test('Both asks only people who share, as themselves, and says who is missing', async () => {
  const asked = [];
  const one = async (u) => { asked.push(u); return u.uid === 'u-kat' ? { status: 'error', reason: 'down' } : { status: 'live', data: { tasks: [{ id: '1' }], subjects: {} } }; };
  const r = await bothView([ELI, KAT], 'google', one, mergeLearnleaf);
  assert.equal(r.status, 'live');
  assert.deepEqual(r.missing, ['Kat']);
  assert.ok(asked.every((u) => u.keyless), 'never with the site-wide tokens');
  asked.length = 0;
  await bothView([ELI, KAT], 'learnleaf', one, mergeLearnleaf);
  assert.deepEqual(asked.map((u) => u.uid), ['u-eli'], 'Kat doesn’t share LearnLeaf');
  const none = await bothView([KAT], 'learnleaf', one, mergeLearnleaf);
  assert.equal(none.status, 'unconfigured');
  assert.match(none.reason, /On the household screen/);
  const conn = await bothView([ELI], 'google', async () => ({ status: 'connect' }), mergeGoogle);
  assert.deepEqual(conn, { status: 'unconfigured', reason: 'Eli hasn’t connected Google in Hive yet' });
  const thrown = await bothView([ELI], 'wander', async () => { throw new Error('boom'); }, mergeWander);
  assert.equal(thrown.status, 'error');
});
