import { APP_KEY } from '@/config/app';
import { daysBetween, parseDate, startOf } from '@/lib/dates';
import { callApi } from './api';
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
 *   weather                             Open-Meteo  at the GalaxyFarm location
 *
 * Each section reports `status[section]`:
 *   live    straight from the app (ticks and adds go back to it)
 *   stale   the app couldn't be reached; showing the last good copy
 *   sample  not connected yet; showing sample data
 */
const CACHE = (k) => `${APP_KEY}.feed.${k}`;
const readCache = (k) => { try { return JSON.parse(localStorage.getItem(CACHE(k))); } catch { return null; } };
const writeCache = (k, v) => { try { localStorage.setItem(CACHE(k), JSON.stringify(v)); } catch { /* ignore */ } };

function pick(feed, key, fallback) {
  const src = feed?.sources?.[key];
  if (src?.status === 'live') { writeCache(key, { at: feed.generatedAt, data: src.data }); return { data: src.data, status: 'live' }; }
  const cached = readCache(key);
  if (cached && src?.status === 'error') return { data: cached.data, status: 'stale', reason: src.reason, at: cached.at };
  if (cached && !feed) return { data: cached.data, status: 'stale', reason: 'The board is offline', at: cached.at };
  return { data: fallback, status: 'sample', reason: src?.reason };
}
const meta = ({ status, reason, at }) => ({ status, reason, at });

const SAMPLE_GF = { chores: sample.CHORES.map((c) => ({ ...c, done: false })), sitter: sample.SITTER };
const SAMPLE_KH = { meals: null, recipes: sample.RECIPES, expiring: sample.EXPIRING, shopping: sample.SHOPPING.map((i) => ({ ...i, bought: false })) };

export async function loadBoard() {
  const res = await callApi('/api/board');
  const locked = res.status === 401 ? (res.data?.reason || 'Enter the board key') : null;
  const feed = res.ok ? res.data : null;

  const gf = pick(feed, 'galaxyfarm', SAMPLE_GF);
  const kh = pick(feed, 'kitchenhub', SAMPLE_KH);
  const weather = pick(feed, 'weather', sample.WEATHER);
  const learnleaf = pick(feed, 'learnleaf', { tasks: sample.TASKS, subjects: sample.SUBJECTS });
  const wander = pick(feed, 'wander', { trips: sample.TRIPS });
  const znt = pick(feed, 'znt', { sessions: sample.SESSIONS });

  // KitchenHub dates → days from today, which is what the meal components use.
  const today = startOf(new Date());
  const meals = kh.data.meals
    ? kh.data.meals.map((m) => ({ ...m, d: daysBetween(today, parseDate(m.date)) }))
    : sample.MEALS;

  // Distance from home only means something when trips and home are both real.
  const home = feed?.home ?? (wander.status === 'sample' ? sample.HOME : null);

  return {
    locked,
    home,
    weather: weather.data,
    tasks: learnleaf.data.tasks,
    subjects: learnleaf.data.subjects,
    trips: wander.data.trips,
    sessions: znt.data.sessions,
    chores: gf.data.chores,
    sitter: gf.data.sitter,
    meals,
    recipes: kh.data.recipes,
    expiring: kh.data.expiring,
    shopping: kh.data.shopping,
    quick: sample.QUICK,
    status: {
      weather: meta(weather), tasks: meta(learnleaf), trips: meta(wander), breeding: meta(znt),
      chores: meta(gf), sitter: meta(gf), meals: meta(kh), shopping: meta(kh),
    },
  };
}

/** How often the board asks for fresh data. */
export const REFRESH_MS = 5 * 60 * 1000;
