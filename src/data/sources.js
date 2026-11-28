import { APP_KEY } from '@/config/app';
import { daysBetween, parseDate, startOf } from '@/lib/dates';
import { callApi } from './api';
import { pickSection } from '@/lib/feed';
import * as sample from './sample';

/**
 * Where the board's data comes from. `/api/board` (netlify/functions/board.mjs)
 * fetches every app server-side with tokens that never reach the tablet.
 *
 *   chores, housesitter, home location  GalaxyFarm  /api/board/v1
 *   meals, recipes, shopping, use soon  KitchenHub  board function
 *   tasks                               LearnLeaf   /api/summary
 *   trips                               Wander      appTrips, appTripTravel
 *   breeding sessions                   ZNT         Firestore sessions
 *   calendar, Google Tasks              Our Den     /api/board/google (your Google link there)
 *   weather                             Open-Meteo  at the GalaxyFarm location
 *
 * Each section reports `status[section]`:
 *   live    straight from the app (ticks and adds go back to it); may be empty
 *   stale   the app couldn't be reached; showing the last good copy (yours)
 *   error   the app couldn't be reached and there's no copy: "Couldn't reach X"
 *   off     it can't be shown for you yet, and `reason` says why ("Connect Google")
 *   sample  sample data, labelled Sample: only when nobody is signed in to
 *           Hive, or in demo mode (?demo in the address)
 *
 * Signed in, a section never falls back to the sample.
 */
const CACHE = (who, k) => `${APP_KEY}.feed.${who}.${k}`;
const readCache = (who, k) => { try { return JSON.parse(localStorage.getItem(CACHE(who, k))); } catch { return null; } };
const writeCache = (who, k, v) => { try { localStorage.setItem(CACHE(who, k), JSON.stringify(v)); } catch { /* ignore */ } };

/** Demo mode: ?demo in the address shows the samples whoever is signed in (for previews and screenshots). */
export function demoMode() {
  try { return new URLSearchParams(window.location.search).has('demo'); } catch { return false; }
}

const pick = (feed, key, shown, ctx) => pickSection(feed, key, shown, { ...ctx, readCache: (k) => readCache(ctx.who, k), writeCache: (k, v) => writeCache(ctx.who, k, v) });
const meta = ({ status, reason, at, source, connect }) => ({ status, reason, at, source, connect });

const SAMPLE_GF = { chores: sample.CHORES.map((c) => ({ ...c, done: false })), sitter: sample.SITTER };
const SAMPLE_KH = { meals: null, recipes: sample.RECIPES, expiring: sample.EXPIRING, shopping: sample.SHOPPING.map((i) => ({ ...i, bought: false })) };
const EMPTY_GF = { chores: [], sitter: { contacts: [], notes: [], intro: null, doNotHandle: [], care: [] } };
const EMPTY_KH = { meals: [], recipes: {}, expiring: [], shopping: [] };

export async function loadBoard() {
  const res = await callApi('/api/board');
  const locked = res.status === 401 ? (res.data?.reason || 'Enter the board key') : null;
  const feed = res.ok ? res.data : null;
  // Signed in counts from either side: the page has a Hive session, or the
  // server says so. Only then are samples ruled out.
  const signedIn = Boolean(res.signedIn || feed?.viewer?.signedIn || res.data?.signedIn);
  const demo = demoMode();
  const ctx = { who: res.uid || 'anon', samples: !signedIn, demo, locked };

  const gf = pick(feed, 'galaxyfarm', { sample: SAMPLE_GF, empty: EMPTY_GF }, ctx);
  const kh = pick(feed, 'kitchenhub', { sample: SAMPLE_KH, empty: EMPTY_KH }, ctx);
  const weather = pick(feed, 'weather', { sample: sample.WEATHER, empty: null }, ctx);
  const learnleaf = pick(feed, 'learnleaf', { sample: { tasks: sample.TASKS, subjects: sample.SUBJECTS }, empty: { tasks: [], subjects: {} } }, ctx);
  const wander = pick(feed, 'wander', { sample: { trips: sample.TRIPS }, empty: { trips: [] } }, ctx);
  const znt = pick(feed, 'znt', { sample: { sessions: sample.SESSIONS }, empty: { sessions: [] } }, ctx);
  const google = pick(feed, 'google', { sample: { events: sample.EVENTS, tasks: sample.GTASKS }, empty: { events: [], tasks: [] } }, ctx);

  // KitchenHub dates → days from today, which is what the meal components use.
  const today = startOf(new Date());
  const meals = kh.data.meals
    ? kh.data.meals.map((m) => ({ ...m, d: daysBetween(today, parseDate(m.date)) }))
    : sample.MEALS;

  // Distance from home only means something when trips and home are both real.
  const home = (demo ? null : feed?.home) ?? (wander.status === 'sample' ? sample.HOME : null);

  return {
    locked: demo ? null : locked,
    signedIn: signedIn && !demo,
    // On a household screen: its people (Both view, face switching).
    screen: demo ? null : feed?.viewer?.screen || null,
    home,
    weather: weather.data,
    tasks: learnleaf.data.tasks,
    subjects: learnleaf.data.subjects,
    trips: wander.data.trips,
    sessions: znt.data.sessions,
    events: google.data.events,
    gtasks: google.data.tasks,
    chores: gf.data.chores,
    sitter: gf.data.sitter,
    meals,
    recipes: kh.data.recipes,
    expiring: kh.data.expiring,
    shopping: kh.data.shopping,
    quick: sample.QUICK,
    status: {
      weather: meta(weather), tasks: meta(learnleaf), trips: meta(wander), breeding: meta(znt),
      calendar: meta(google), gtasks: meta(google),
      chores: meta(gf), sitter: meta(gf), meals: meta(kh), shopping: meta(kh),
    },
  };
}

/** Ask the board and widgets to load again now (the Retry buttons). */
export const RETRY_EVENT = 'hive:board-retry';
export const retryBoard = () => window.dispatchEvent(new Event(RETRY_EVENT));

/** How often the board asks for fresh data. */
export const REFRESH_MS = 5 * 60 * 1000;
