import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUSY_FOR_MS, isBusy, markBusy } from './busy.js';

test('an app stays busy while it keeps saying so, and lapses when it stops', () => {
  let claims = markBusy({}, 'kitchenhub', true, 0);
  assert.equal(isBusy(claims, 'kitchenhub', BUSY_FOR_MS - 1), true);
  assert.equal(isBusy(claims, 'kitchenhub', BUSY_FOR_MS), false);

  claims = markBusy(claims, 'kitchenhub', true, 60_000); // the minute's reminder
  assert.equal(isBusy(claims, 'kitchenhub', BUSY_FOR_MS + 1), true);
});

test('saying it is done ends it at once, and only for that app', () => {
  let claims = markBusy(markBusy({}, 'kitchenhub', true, 0), 'galaxyfarm', true, 0);
  claims = markBusy(claims, 'kitchenhub', false, 1);
  assert.equal(isBusy(claims, 'kitchenhub', 2), false);
  assert.equal(isBusy(claims, 'galaxyfarm', 2), true);
  assert.equal(isBusy(claims, null, 2), false);
});
