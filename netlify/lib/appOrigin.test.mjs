import test from 'node:test';
import assert from 'node:assert/strict';
import { isAppOrigin } from './shared.mjs';
import { LEGACY_APPS } from './carryOver.mjs';

test('sign-in endpoints accept the shared domain and each app’s old netlify.app address', () => {
  for (const o of ['https://hive.flyingdoublemranch.com', 'https://flyingdoublemranch.com', 'https://wander.flyingdoublemranch.com',
    'https://wander-tripplanner.netlify.app', 'https://main--wander-tripplanner.netlify.app', 'https://ourden.netlify.app', 'https://journaltogether.netlify.app']) {
    assert.ok(isAppOrigin(o), o);
  }
});

test('and nothing else', () => {
  for (const o of [null, '', 'http://wander.flyingdoublemranch.com', 'https://evil.netlify.app', 'https://wander-tripplanner.netlify.app.evil.com',
    'https://evilflyingdoublemranch.com', 'https://xwander-tripplanner.netlify.app']) {
    assert.ok(!isAppOrigin(o), String(o));
  }
});

test('carry-over checks every moved app’s old project', () => {
  for (const app of ['wander', 'ourden', 'kitchenhub', 'journal', 'alcohol', 'stimultrack', 'learnleaf', 'aerologger']) assert.ok(LEGACY_APPS[app]?.key, app);
});
