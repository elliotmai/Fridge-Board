import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCode, joinLink } from './joinCode.js';

test('codes are cleaned: upper case, letters and digits only', () => {
  assert.equal(cleanCode(' ab12-cd34 '), 'AB12CD34');
  assert.equal(cleanCode(null), '');
});

test('the join link opens Hive with the code', () => {
  assert.equal(joinLink('ab12cd34', 'https://hive.flyingdoublemranch.com'), 'https://hive.flyingdoublemranch.com/?join=AB12CD34');
});
