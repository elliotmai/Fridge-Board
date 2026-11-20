import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claim } from '../functions/legacy.mjs';

function memoryDb() {
  const rows = new Map();
  return {
    rows,
    insert: async (r) => { const k = `${r.app}/${r.legacy_id}`; if (!rows.has(k)) rows.set(k, r.user_id); },
    owner: async (app, id) => rows.get(`${app}/${id}`) ?? null,
  };
}
const verifyNew = async (t) => { if (!t?.startsWith('sb-')) throw new Error('no'); return { uid: t.slice(3) }; };
const verifyOld = async (t, { projectId }) => { if (projectId !== 'alctracker-b6c8a' || !t?.startsWith('fb-')) throw new Error('no'); return { uid: t.slice(3) }; };

test('records an old account for the person who proves it', async () => {
  const db = memoryDb();
  const r = await claim({ app: 'alcohol', idToken: 'fb-old1', accessToken: 'sb-amy' }, { db, verifyNew, verifyOld });
  assert.equal(r.status, 200); assert.equal(r.body.legacyId, 'old1'); assert.equal(db.rows.get('alcohol/old1'), 'amy');
  assert.equal((await claim({ app: 'alcohol', idToken: 'fb-old1', accessToken: 'sb-amy' }, { db, verifyNew, verifyOld })).status, 200, 'again is fine');
});

test('an old account belongs to one person only', async () => {
  const db = memoryDb();
  await claim({ app: 'alcohol', idToken: 'fb-old1', accessToken: 'sb-amy' }, { db, verifyNew, verifyOld });
  const r = await claim({ app: 'alcohol', idToken: 'fb-old1', accessToken: 'sb-ben' }, { db, verifyNew, verifyOld });
  assert.equal(r.status, 409); assert.equal(db.rows.get('alcohol/old1'), 'amy');
});

test('refuses unknown apps, bad old tokens and the signed-out', async () => {
  const db = memoryDb();
  assert.equal((await claim({ app: 'nope', idToken: 'fb-x', accessToken: 'sb-amy' }, { db, verifyNew, verifyOld })).status, 400);
  assert.equal((await claim({ app: 'alcohol', idToken: 'forged', accessToken: 'sb-amy' }, { db, verifyNew, verifyOld })).status, 401);
  assert.equal((await claim({ app: 'alcohol', idToken: 'fb-x', accessToken: '' }, { db, verifyNew, verifyOld })).status, 401);
  assert.equal(db.rows.size, 0);
});
