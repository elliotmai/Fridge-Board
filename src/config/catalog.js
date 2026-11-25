import { APPS } from './apps.js';

/**
 * Every app Hive can put on the home screen.
 *
 *   url       where it opens. null = not deployed yet, so its icon says so.
 *   color     icon tile colour.
 *   glyph     key into src/hive/glyphs.jsx.
 *   audience  who can add it once Hive has accounts:
 *               anyone     any Hive user
 *               household  people in your household
 *               owner      only you
 *               invite     only people you invite (Our Den is for two)
 *   native    built into Hive itself instead of opened in a frame.
 *   shortcuts quick actions in the long-press menu: [{ label, path }], opened
 *             at that path inside the app.
 *   frame     false = always opens in its own tab. Cattle Graph and Our Den
 *             send X-Frame-Options: DENY, so a frame would stay blank.
 *
 * Apps with no `frame` key open inside Hive, with "Open in its own tab" always
 * one tap away. Each app's own sign-in still applies until the shared Hive
 * sign-in lands (step 2 in README).
 */
export const CATALOG = {
  board: { name: 'Fridge Board', color: '#2f7a4a', glyph: 'board', audience: 'household', native: true, blurb: 'Chores, meals, shopping, trips and breeding on one screen.' },
  settings: { name: 'Settings', color: '#8e8e93', glyph: 'gear', audience: 'anyone', native: true, blurb: 'Your Hive account, wallpaper, and how the home screen looks.' },
  // hive: signs you in with your Hive account (a pass), inside Hive and on its
  // own address. Its sign-in cookie is fine in Hive's frame: the same site.
  galaxyfarm: { name: 'GalaxyFarm', url: APPS.galaxyfarm.url, hive: true, start: '/admin', color: '#3d6b2f', glyph: 'barn', audience: 'household', blurb: 'Cattle, flocks, chores and the housesitter guide.',
    shortcuts: [{ label: 'Chores', path: APPS.galaxyfarm.paths.chores }, { label: 'Housesitter guide', path: APPS.galaxyfarm.paths.housesitter }] },
  znt: { name: 'ZNT', url: APPS.znt.url, color: '#7a4e1d', glyph: 'cow', audience: 'household', blurb: 'Breeding groups, heat tracking and feeding.' },
  cattlegraph: { name: 'Cattle Graph', url: 'https://cattle.flyingdoublemranch.com', color: '#5a4632', glyph: 'graph', audience: 'household', blurb: 'Pedigrees across every breed association.' },
  kitchenhub: { name: 'KitchenHub', url: APPS.kitchenhub.url, color: '#9c3a5c', glyph: 'pot', audience: 'anyone', blurb: 'What is in the fridge, meal plans and shopping.',
    shortcuts: [{ label: 'Shopping list', path: APPS.kitchenhub.paths.shopping }, { label: 'Meal plan', path: APPS.kitchenhub.paths.mealPlan }, { label: 'What’s in the fridge', path: APPS.kitchenhub.paths.inventory }] },
  letseat: { name: "Let's Eat", url: 'https://letseat.flyingdoublemranch.com', color: '#c2553a', glyph: 'fork', audience: 'anyone', blurb: 'Recipes, holiday meals and shopping lists.' },
  pool: { name: 'Pool Heater', url: 'https://pool.flyingdoublemranch.com', color: '#1f7fa6', glyph: 'wave', audience: 'household', blurb: 'Live pool and heater temperatures.' },
  // hive: existing Property Care accounts sign in with Hive (inside Hive and on its own address).
  property: { name: 'Property Care', url: 'https://landlord-property-maintenance.netlify.app', hive: true, color: '#56606b', glyph: 'wrench', audience: 'anyone', blurb: 'Work orders for landlords and residents.' },
  ourden: { name: 'Our Den', url: 'https://den.flyingdoublemranch.com', color: '#4b3b78', glyph: 'moon', audience: 'invite', blurb: 'A private space for two, across the distance.' },
  wander: { name: 'Wander', url: APPS.wander.url, color: '#2c5e9e', glyph: 'plane', audience: 'anyone', blurb: 'Trips, itineraries and live flights.' },
  // hive: signs you in with your Hive account when opened inside Hive.
  aerologger: { name: 'AeroLogger', url: 'https://aero-logger.com', hive: true, color: '#3b6f8f', glyph: 'binoculars', audience: 'anyone', blurb: 'Log the aircraft you spot.' },
  // hive: signs you in with your Hive account when opened inside Hive.
  learnleaf: { name: 'LearnLeaf', url: APPS.learnleaf.url, hive: true, color: '#355147', glyph: 'leaf', audience: 'anyone', blurb: 'Tasks, subjects and projects for school and life.',
    shortcuts: [{ label: 'Tasks', path: APPS.learnleaf.paths.tasks }] },
  journal: { name: 'Journal Together', url: 'https://journal.flyingdoublemranch.com', color: '#8a5a44', glyph: 'book', audience: 'anyone', blurb: 'A shared journal.' },
  stimultrack: { name: 'StimulTrack', url: 'https://stimul.flyingdoublemranch.com', color: '#6b4226', glyph: 'cup', audience: 'anyone', blurb: 'How much caffeine is in you right now.' },
  alcohol: { name: 'Drink Tracker', url: 'https://drinks.flyingdoublemranch.com', color: '#8e2f3c', glyph: 'glass', audience: 'anyone', blurb: 'Track drinks over time.' },
  sidequest: { name: 'Side Quest', url: 'https://sidequest.flyingdoublemranch.com', color: '#c27c0e', glyph: 'dice', audience: 'anyone', blurb: 'Points games for trips, game days and hangouts.' },
  muster: { name: 'Muster', url: 'https://muster.flyingdoublemranch.com', color: '#24292f', glyph: 'pulse', audience: 'owner', blurb: 'Every project you have going, and what Claude is waiting on.' },
  // Ticket Booth's admin page (passcode-protected): every app's bug reports and
  // requests. The "Report a bug" links in each app still go to the public form.
  feedback: { name: 'Feedback', url: 'https://tickets.flyingdoublemranch.com/admin', color: '#6b6f76', glyph: 'ticket', audience: 'owner', blurb: 'Bug reports and feature requests from every app.',
    shortcuts: [{ label: 'Report a bug', path: 'https://tickets.flyingdoublemranch.com/' }] },
};

export const AUDIENCE = {
  anyone: 'Anyone',
  household: 'Household',
  owner: 'Only you',
  invite: 'By invite',
};

export const appIds = Object.keys(CATALOG);

/** Used to name a new folder: two apps from the same group get its name. */
export const GROUPS = {
  Farm: ['board', 'galaxyfarm', 'znt', 'cattlegraph'],
  Kitchen: ['kitchenhub', 'letseat'],
  Home: ['pool', 'property'],
  Travel: ['wander', 'aerologger'],
  Together: ['ourden', 'journal', 'sidequest'],
  Health: ['stimultrack', 'alcohol'],
  School: ['learnleaf'],
  Tools: ['muster', 'feedback', 'settings'],
};

export function folderName(a, b) {
  return Object.entries(GROUPS).find(([, ids]) => ids.includes(a) && ids.includes(b))?.[0] ?? 'Folder';
}

/** An app as it shows on this home screen: its own name, colour and glyph, or yours. */
export function appLook(id, custom = {}) {
  const a = CATALOG[id] || {};
  const c = custom[id] || {};
  return { name: c.name || a.name || id, color: c.color || a.color || '#777', glyph: c.glyph || a.glyph };
}

/**
 * Where a shortcut path goes: an absolute URL as is, else under the app's own
 * address. With no path, the app's `start` page (its owner view), if it has one.
 */
export function appUrl(id, path = '') {
  const a = CATALOG[id];
  if (!a?.url) return null;
  path = path || a.start || '';
  if (/^https?:\/\//.test(path)) return path;
  try { return new URL(path || '', a.url.endsWith('/') ? a.url : `${a.url}/`).href.replace(/\/$/, path ? '' : '/'); } catch { return a.url; }
}

/**
 * Whether an app opens in its own tab rather than inside Hive. Everything
 * opens inside Hive unless you choose otherwise: per app (`look.external[id]`
 * true, from press-and-hold) or for all apps ("Open apps inside Hive" off).
 * `frame: false` is for an app that refuses to be shown inside another site.
 */
export function opensInTab(id, look = {}) {
  const a = CATALOG[id] || {};
  if (!a.url || a.native) return false;
  if (a.frame === false || look.inside === false) return true;
  return look.external?.[id] === true;
}
