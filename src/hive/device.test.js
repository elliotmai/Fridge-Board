import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PHONE_QUERY, TABLET_QUERY, isTablet } from './device.js';

/** Enough of matchMedia for these queries: comma = or, "and" = and, min/max width/height in px. */
function matches(query, w, h) {
  return query.split(',').some((part) => [...part.matchAll(/\((min|max)-(width|height):\s*(\d+)px\)/g)].every(([, m, dim, n]) => {
    const v = dim === 'width' ? w : h;
    return m === 'min' ? v >= Number(n) : v <= Number(n);
  }));
}

const sizes = {
  'iPhone 14': [390, 664], 'iPhone 14 sideways': [750, 340], 'iPhone SE': [375, 667], 'iPhone SE sideways': [667, 375],
  'iPhone Pro Max': [430, 932], 'Pro Max sideways (cover)': [932, 430], 'Galaxy S8': [360, 740], 'Galaxy S8 sideways': [740, 360],
  'Fire HD 8 sideways': [854, 534], 'Fire HD 8 upright': [534, 854], 'Fire upright, keyboard up': [534, 520],
  'Fire 960 sideways': [960, 600], 'Fire 960 upright': [600, 960], 'Fire 1280': [1280, 800], 'Fire 1280 upright': [800, 1280],
  'iPad upright': [820, 1180], 'iPad sideways': [1180, 820],
};
const tablets = new Set(['Pro Max sideways (cover)', 'Fire HD 8 sideways', 'Fire HD 8 upright', 'Fire upright, keyboard up', 'Fire 960 sideways',
  'Fire 960 upright', 'Fire 1280', 'Fire 1280 upright', 'iPad upright', 'iPad sideways']);

test('the fridge Fire stays a tablet when turned; phones stay phones', () => {
  for (const [name, [w, h]] of Object.entries(sizes)) assert.equal(isTablet(w, h), tablets.has(name), name);
});

test('the media queries say the same as isTablet, and phone is exactly not-tablet', () => {
  for (const w of [320, 499, 500, 534, 600, 759, 760, 854, 1280]) {
    for (const h of [340, 499, 500, 534, 854, 1180]) {
      assert.equal(matches(TABLET_QUERY, w, h), isTablet(w, h), `tablet ${w}x${h}`);
      assert.equal(matches(PHONE_QUERY, w, h), !isTablet(w, h), `phone ${w}x${h}`);
    }
  }
});

test('board.css uses these queries, not the old 760px-only ones', () => {
  const css = readFileSync(new URL('../styles/board.css', import.meta.url), 'utf8');
  assert.ok(!/@media \(max-width: 759px\) \{/.test(css), 'a phone rule still keys off width alone');
  assert.ok(css.includes(`@media ${PHONE_QUERY} {`), 'board.css has no phone rule with PHONE_QUERY');
});
