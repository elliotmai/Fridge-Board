/**
 * A household invite code waiting to be used: from a `?join=CODE` link, kept
 * in this tab until the person is signed in and joins (or dismisses it).
 */
const KEY = 'hive.joinCode';

export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

export function rememberJoinCode(code) {
  const c = cleanCode(code);
  try { if (c) sessionStorage.setItem(KEY, c); } catch { /* ignore */ }
}
export function pendingJoinCode() {
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
}
export function forgetJoinCode() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** The link that opens Hive with this code ready to join. */
export const joinLink = (code, origin = typeof location !== 'undefined' ? location.origin : 'https://hive.flyingdoublemranch.com') =>
  `${origin}/?join=${encodeURIComponent(cleanCode(code))}`;
