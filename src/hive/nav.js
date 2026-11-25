/**
 * Which app is open lives in the address (#kitchenhub), so the phone's back
 * gesture leaves an app. These are the only two moves Hive makes on it, kept
 * apart from React so they can be tested (nav.test.js).
 *
 * Going home never uses history.back(): framed apps add their own entries to
 * the browser's history (a page change inside the app), so "back" from Hive
 * can land on an app's earlier page, or on another app's entry, instead of
 * home. Home always replaces the current entry with the bare address.
 */

/** The app named in the address, if any (one Hive knows and can show in a frame). */
export function viewIn(loc, isApp) {
  const h = decodeURIComponent(String(loc.hash || '').replace(/^#\/?/, ''));
  return h && isApp(h) ? h : null;
}

/**
 * Open app `id`. From home it adds an entry (so back goes home); from another
 * app it replaces that app's entry (so back still goes home, never to it).
 * Returns true when the address changed without a hashchange event to follow
 * (the caller sets its view itself).
 */
export function showView(win, id, isApp) {
  const cur = viewIn(win.location, isApp);
  if (cur === id) return true;
  if (!cur) { win.location.hash = id; return false; }
  win.history.replaceState(null, '', `#${id}`);
  return true;
}

/** Go home: the bare address, in place of the app's entry. */
export function homeView(win) {
  win.history.replaceState(null, '', win.location.pathname + win.location.search);
}
