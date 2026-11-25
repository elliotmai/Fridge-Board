import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickSection } from './feed.js';

const SHOWN = { sample: { chores: ['sample'] }, empty: { chores: [] } };
const feed = (src) => ({ generatedAt: 't', sources: { galaxyfarm: src } });
const signedIn = { samples: false, demo: false, locked: null };
const signedOut = { samples: true, demo: false, locked: null };

test('live data shows, even when it is empty', () => {
  const r = pickSection(feed({ status: 'live', data: { chores: [] } }), 'galaxyfarm', SHOWN, signedIn);
  assert.equal(r.status, 'live');
  assert.deepEqual(r.data.chores, []);
});

test('signed in, a failed source is "Couldn’t reach", never the sample', () => {
  const r = pickSection(feed({ status: 'error', reason: 'x answered 500' }), 'galaxyfarm', SHOWN, signedIn);
  assert.equal(r.status, 'error');
  assert.match(r.reason, /Couldn’t reach GalaxyFarm/);
  assert.deepEqual(r.data.chores, []);
});

test('signed in, a failed source with a last good copy shows that copy as stale', () => {
  const r = pickSection(feed({ status: 'error' }), 'galaxyfarm', SHOWN, { ...signedIn, readCache: () => ({ at: 'then', data: { chores: ['mine'] } }) });
  assert.equal(r.status, 'stale');
  assert.deepEqual(r.data.chores, ['mine']);
});

test('signed in, not set up is "off" with the reason; Google not connected asks to connect', () => {
  const off = pickSection(feed({ status: 'unconfigured', reason: 'Confirm your Hive email to see this' }), 'galaxyfarm', SHOWN, signedIn);
  assert.equal(off.status, 'off');
  assert.match(off.reason, /Confirm/);
  const g = pickSection({ sources: { google: { status: 'connect', reason: 'Connect Google' } } }, 'google', SHOWN, signedIn);
  assert.equal(g.status, 'off');
  assert.equal(g.connect, 'google');
});

test('signed in but the board is locked: off with why, no sample', () => {
  const r = pickSection(null, 'galaxyfarm', SHOWN, { ...signedIn, locked: 'Join a household' });
  assert.equal(r.status, 'off');
  assert.equal(r.reason, 'Join a household');
});

test('signed in and Hive unreachable: error, not sample', () => {
  const r = pickSection(null, 'galaxyfarm', SHOWN, signedIn);
  assert.equal(r.status, 'error');
});

test('samples only signed out or in demo, and labelled', () => {
  assert.equal(pickSection(feed({ status: 'unconfigured' }), 'galaxyfarm', SHOWN, signedOut).status, 'sample');
  assert.equal(pickSection(null, 'galaxyfarm', SHOWN, { ...signedOut, locked: 'Enter the board key' }).status, 'sample');
  assert.equal(pickSection(feed({ status: 'live', data: { chores: [] } }), 'galaxyfarm', SHOWN, { ...signedIn, demo: true }).status, 'sample');
});
