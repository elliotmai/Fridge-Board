/*
 * Shared by the board's Netlify functions: the board key check, app URLs and
 * a fetch helper.
 *
 * The board key. Everything under /api/ needs header `x-board-key` matching
 * BOARD_ACCESS_KEY. Without it the API refuses, so a stranger who finds the URL
 * can't see your home location, trips and tasks or tick your chores. Set any
 * long random string in Netlify, then enter it once on each device (or open
 * the board once with ?key=... appended).
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const env = (k, d) => process.env[k] || d;

/**
 * Sites that may call Hive's sign-in endpoints from the browser: every app
 * under the shared domain, and each app's old netlify.app address, which
 * open tabs and installed home-screen apps keep using after the move
 * (a 301 only moves fresh page loads).
 */
const SHARED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?flyingdoublemranch\.com$/;
const OLD_SITES = ['fridge-board-7u23', 'stimultrack', 'wander-tripplanner', 'ourden', 'journaltogether', 'alcoholtracker',
  'side-quest-games', 'lets-go-eat', 'zntmanager', 'learnleaf-organizer', 'mykitchenhub', 'pool-heater-monitor'];
const OLD_ORIGIN = new RegExp(`^https://([a-z0-9-]+--)?(${OLD_SITES.join('|')})\\.netlify\\.app$`);
export const isAppOrigin = (o) => Boolean(o) && (SHARED_ORIGIN.test(o) || OLD_ORIGIN.test(o));

export const urls = {
  galaxyfarm: () => env('GALAXYFARM_URL', 'https://flyingdoublemranch.com').replace(/\/$/, ''),
  kitchenhub: () => env('KITCHENHUB_URL', 'https://us-central1-mykitchenhub-db665.cloudfunctions.net/board').replace(/\/$/, ''),
  learnleaf: () => env('LEARNLEAF_URL', 'https://learnleaf.flyingdoublemranch.com').replace(/\/$/, ''),
  ourden: () => env('OURDEN_URL', 'https://den.flyingdoublemranch.com').replace(/\/$/, ''),
  wander: () => env('WANDER_FUNCTIONS_URL', 'https://wander.flyingdoublemranch.com/api').replace(/\/$/, ''),
};

export const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

const digest = (s) => createHash('sha256').update(String(s)).digest();

/** Returns a 401 Response when the request lacks the board key, otherwise null. */
export function requireKey(req) {
  const want = env('BOARD_ACCESS_KEY');
  if (!want) return json(401, { error: 'locked', reason: 'Set BOARD_ACCESS_KEY on the Fridge Board site' });
  const got = req.headers.get('x-board-key') || '';
  // Compare digests so length differences don't leak through timing.
  if (!got || !timingSafeEqual(digest(got), digest(want))) return json(401, { error: 'locked', reason: 'Enter the board key' });
  return null;
}

export class SourceError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function getJson(url, init = {}, timeoutMs = 8000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new SourceError(`${new URL(url).host} answered ${res.status}`, res.status);
  return res.json();
}

export const bearer = (token, extra = {}) => ({ headers: { authorization: `Bearer ${token}`, ...extra } });
