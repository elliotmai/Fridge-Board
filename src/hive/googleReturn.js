import { safeNext } from './emailLink.js';

/**
 * The bookkeeping around Connect Google (googleConnect.js), kept free of the
 * browser so it can be tested: what we remember in this tab while Google's
 * screen is up, and where to go afterwards.
 */
export const PENDING_KEY = 'hive.googleConnect';
const PENDING_MAX_MS = 30 * 60 * 1000;

/** Remember who is connecting (and where to go back to) for this tab's return from Google. */
export function savePending(storage, { uid, back = null }, now = Date.now()) {
  storage.setItem(PENDING_KEY, JSON.stringify({ uid, back, at: now }));
}

/** The pending connect, once: reading it forgets it. Null when none, or when it's stale or garbled. */
export function takePending(storage, now = Date.now()) {
  let raw = null;
  try { raw = storage.getItem(PENDING_KEY); storage.removeItem(PENDING_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (typeof p?.uid !== 'string' || !p.uid || !(now - p.at < PENDING_MAX_MS) || p.at > now + 60000) return null;
    return { uid: p.uid, back: typeof p.back === 'string' ? p.back : null };
  } catch { return null; }
}

export const hasPending = (storage) => { try { return Boolean(storage.getItem(PENDING_KEY)); } catch { return false; } };

/**
 * `?connect=google&back=<url>`: another app (Our Den) sending someone here to
 * connect. `back` is only kept for an address under the shared domain.
 * Returns { back } or null.
 */
export function connectRequest(search, origin) {
  const q = new URLSearchParams(search);
  if (q.get('connect') !== 'google') return null;
  return { back: safeNext(q.get('back'), origin) };
}

/** What the session brought back from Google, judged against who started. */
export function judgeReturn(pending, session) {
  if (!session?.user) return { ok: false, message: 'You’re signed out of Hive. Sign in, then connect Google again.' };
  if (session.user.id !== pending.uid) return { ok: false, message: 'That Google account belongs to a different Hive account. Connect again with your own Google account.' };
  if (!session.provider_refresh_token || !session.provider_token) return { ok: false, message: 'Google didn’t connect. Try again, and allow Calendar and Tasks.' };
  return { ok: true, refreshToken: session.provider_refresh_token, accessToken: session.provider_token };
}
