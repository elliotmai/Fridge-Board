import { APP_KEY } from '@/config/app';
import * as sample from './sample';

/**
 * Where the board's data comes from.
 *
 *   weather            Open-Meteo, at HOME_LAT/HOME_LON        live via /api/board
 *   tasks              LearnLeaf  /api/summary + /api/subjects live via /api/board
 *   trips              Wander     appTrips + appTripTravel     live via /api/board
 *   breeding sessions  ZNT        Firestore sessions           live via /api/board
 *   chores, sitter     GalaxyFarm needs a read endpoint        sample for now
 *   meals, shopping    KitchenHub needs a read endpoint        sample for now
 *
 * `/api/board` (netlify/functions/board.mjs) holds the tokens server-side.
 * Each section reports how fresh it is, as `status[section]`:
 *   live    straight from the app
 *   stale   the app couldn't be reached; showing the last good copy
 *   sample  not connected yet (or never reached); showing sample data
 */
const CACHE = (k) => `${APP_KEY}.feed.${k}`;
const readCache = (k) => { try { return JSON.parse(localStorage.getItem(CACHE(k))); } catch { return null; } };
const writeCache = (k, v) => { try { localStorage.setItem(CACHE(k), JSON.stringify(v)); } catch { /* ignore */ } };

async function fetchFeed() {
  try {
    const res = await fetch('/api/board', { headers: { accept: 'application/json' } });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
    return await res.json();
  } catch {
    return null; // offline, or running under `vite dev` without the function
  }
}

/** Live data when we have it, the last good copy when the app is down, sample otherwise. */
function pick(feed, key, fallback) {
  const src = feed?.sources?.[key];
  if (src?.status === 'live') { writeCache(key, { at: feed.generatedAt, data: src.data }); return { data: src.data, status: 'live' }; }
  const cached = readCache(key);
  if (cached && src?.status === 'error') return { data: cached.data, status: 'stale', reason: src.reason, at: cached.at };
  if (cached && !feed) return { data: cached.data, status: 'stale', reason: 'The board is offline', at: cached.at };
  return { data: fallback, status: 'sample', reason: src?.reason };
}

const meta = ({ status, reason, at }) => ({ status, reason, at });

export async function loadBoard() {
  const feed = await fetchFeed();
  const weather = pick(feed, 'weather', sample.WEATHER);
  const learnleaf = pick(feed, 'learnleaf', { tasks: sample.TASKS, subjects: sample.SUBJECTS });
  const wander = pick(feed, 'wander', { trips: sample.TRIPS });
  const znt = pick(feed, 'znt', { sessions: sample.SESSIONS });

  // Distance from home only means something when trips and home are both real.
  const home = feed?.home ?? (wander.status === 'sample' ? sample.HOME : null);

  return {
    home,
    weather: weather.data,
    tasks: learnleaf.data.tasks,
    subjects: learnleaf.data.subjects,
    trips: wander.data.trips,
    sessions: znt.data.sessions,
    chores: sample.CHORES,
    recipes: sample.RECIPES,
    meals: sample.MEALS,
    expiring: sample.EXPIRING,
    shopping: sample.SHOPPING,
    quick: sample.QUICK,
    sitter: sample.SITTER,
    status: {
      weather: meta(weather), tasks: meta(learnleaf), trips: meta(wander), breeding: meta(znt),
      chores: { status: 'sample', reason: 'GalaxyFarm needs a read endpoint' },
      sitter: { status: 'sample', reason: 'GalaxyFarm needs a read endpoint' },
      meals: { status: 'sample', reason: 'KitchenHub needs a read endpoint' },
      shopping: { status: 'sample', reason: 'KitchenHub needs a read endpoint' },
    },
  };
}

/** How often the board asks for fresh data. */
export const REFRESH_MS = 5 * 60 * 1000;
