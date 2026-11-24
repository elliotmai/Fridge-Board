import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from './emailLink.js';

const HIVE = 'https://hive.flyingdoublemranch.com';

test('a sign-in link sends people back to the app that asked', () => {
  assert.equal(safeNext('https://wander.flyingdoublemranch.com/', HIVE), 'https://wander.flyingdoublemranch.com/');
  assert.equal(safeNext('https://flyingdoublemranch.com/x', HIVE), 'https://flyingdoublemranch.com/x');
  assert.equal(safeNext('https://hive.flyingdoublemranch.com/apps/stimultrack/', HIVE), 'https://hive.flyingdoublemranch.com/apps/stimultrack/');
});

test('Hive itself, nowhere, or anywhere the shared cookie does not reach: stay on Hive', () => {
  for (const n of [null, '', `${HIVE}/`, 'https://evil.com/', 'https://wander-tripplanner.netlify.app/', 'http://wander.flyingdoublemranch.com/',
    'https://flyingdoublemranch.com.evil.com/', 'javascript:alert(1)']) assert.equal(safeNext(n, HIVE), null, String(n));
});
