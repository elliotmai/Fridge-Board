import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeView, showView, viewIn } from './nav.js';

/** A browser's session history, enough to model Hive's moves and the back button. */
function fakeWindow() {
  const entries = [{ path: '/', hash: '' }];
  let at = 0;
  const win = {
    location: {
      get pathname() { return entries[at].path; },
      search: '',
      get hash() { return entries[at].hash; },
      set hash(h) { entries.splice(at + 1); entries.push({ path: entries[at].path, hash: `#${h}` }); at++; },
    },
    history: {
      replaceState(_s, _t, url) { const [path, hash = ''] = url.startsWith('#') ? [entries[at].path, url.slice(1)] : url.split('#'); entries[at] = { path, hash: hash ? `#${hash}` : '' }; },
      back() { if (at > 0) at--; },
      // An app inside a frame changing page adds an entry too (joint session history).
      framePush() { entries.splice(at + 1); entries.push({ ...entries[at] }); at++; },
    },
  };
  return win;
}
const apps = new Set(['a', 'b', 'board']);
const isApp = (h) => apps.has(h);
const view = (w) => viewIn(w.location, isApp);

test('open A, home, open B, home: home; back never brings A (or B) back', () => {
  const w = fakeWindow();
  showView(w, 'a', isApp); assert.equal(view(w), 'a');
  homeView(w); assert.equal(view(w), null);
  showView(w, 'b', isApp); assert.equal(view(w), 'b');
  homeView(w); assert.equal(view(w), null);
  w.history.back(); assert.equal(view(w), null);
  w.history.back(); assert.equal(view(w), null);
});

test('back from an app goes home', () => {
  const w = fakeWindow();
  showView(w, 'a', isApp);
  w.history.back();
  assert.equal(view(w), null);
});

test('home lands on home even after the app changed pages inside its frame', () => {
  const w = fakeWindow();
  showView(w, 'a', isApp);
  w.history.framePush(); w.history.framePush();
  homeView(w);
  assert.equal(view(w), null); // history.back() here would have stayed in A
});

test('switching apps replaces the entry, so back still goes home', () => {
  const w = fakeWindow();
  showView(w, 'a', isApp);
  assert.equal(showView(w, 'b', isApp), true); // no hashchange: the caller sets the view
  assert.equal(view(w), 'b');
  w.history.back();
  assert.equal(view(w), null);
});

test('only known apps count as a view', () => {
  const w = fakeWindow();
  w.location.hash = 'nope';
  assert.equal(view(w), null);
});
