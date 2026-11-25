import { APP_KEY } from '@/config/app';
import { hiveSession } from '@/hive/account';

/*
 * The board key (BOARD_ACCESS_KEY on the server) lives on each device. It can be
 * entered on the board, or passed once as ?key=... in the URL, which is handy
 * when setting up the kiosk browser. It's removed from the address bar after.
 */
const KEY = `${APP_KEY}.boardKey`;

export function getKey() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
export function setKey(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* ignore */ } }

export function takeKeyFromUrl() {
  const url = new URL(window.location.href);
  const k = url.searchParams.get('key');
  if (!k) return;
  setKey(k.trim());
  url.searchParams.delete('key');
  window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
}

/**
 * Calls one of the board's own /api routes with the key, and as the signed-in
 * Hive user when there is one (for things that are personal, like Google).
 * If the server says the sign-in had expired, refreshes it and asks once more.
 * Never throws. `signedIn` and `uid` say who the page asked as.
 */
export async function callApi(path, { method = 'GET', body } = {}) {
  const once = async (fresh) => {
    const session = await hiveSession({ fresh });
    const res = await fetch(path, {
      method,
      headers: {
        accept: 'application/json', 'x-board-key': getKey(),
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const isJson = (res.headers.get('content-type') || '').includes('json');
    const data = isJson ? await res.json().catch(() => null) : null;
    return { ok: res.ok && isJson, status: res.status, data, signedIn: !!session, uid: session?.uid || null };
  };
  try {
    const r = await once(false);
    const expired = r.signedIn && (r.data?.expired || r.data?.viewer?.expired);
    return expired ? await once(true) : r;
  } catch {
    return { ok: false, status: 0, data: null, signedIn: false, uid: null }; // offline, or `vite dev` without the functions
  }
}
