import { APPS } from './apps';

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
 *   frame     false = always opens in its own tab. Cattle Graph and Our Den
 *             send X-Frame-Options: DENY, so a frame would stay blank.
 *
 * Apps with no `frame` key open inside Hive, with "Open in its own tab" always
 * one tap away. Each app's own sign-in still applies until the shared Hive
 * sign-in lands (step 2 in README).
 */
export const CATALOG = {
  board: { name: 'Fridge Board', color: '#2f7a4a', glyph: 'board', audience: 'household', native: true, blurb: 'Chores, meals, shopping, trips and breeding on one screen.' },
  galaxyfarm: { name: 'GalaxyFarm', url: APPS.galaxyfarm.url, color: '#3d6b2f', glyph: 'barn', audience: 'household', blurb: 'Cattle, flocks, chores and the housesitter guide.' },
  znt: { name: 'ZNT', url: APPS.znt.url, color: '#7a4e1d', glyph: 'cow', audience: 'household', blurb: 'Breeding groups, heat tracking and feeding.' },
  cattlegraph: { name: 'Cattle Graph', url: 'https://cattle-registrations.netlify.app', color: '#5a4632', glyph: 'graph', audience: 'household', frame: false, blurb: 'Pedigrees across every breed association.' },
  kitchenhub: { name: 'KitchenHub', url: APPS.kitchenhub.url, color: '#9c3a5c', glyph: 'pot', audience: 'anyone', blurb: 'What is in the fridge, meal plans and shopping.' },
  letseat: { name: "Let's Eat", url: 'https://lets-go-eat.netlify.app', color: '#c2553a', glyph: 'fork', audience: 'anyone', blurb: 'Recipes, holiday meals and shopping lists.' },
  pool: { name: 'Pool Heater', url: 'https://pool-heater-monitor.netlify.app', color: '#1f7fa6', glyph: 'wave', audience: 'household', blurb: 'Live pool and heater temperatures.' },
  property: { name: 'Property Care', url: 'https://landlord-property-maintenance.netlify.app', color: '#56606b', glyph: 'wrench', audience: 'anyone', blurb: 'Work orders for landlords and residents.' },
  ourden: { name: 'Our Den', url: 'https://ourden.netlify.app', color: '#4b3b78', glyph: 'moon', audience: 'invite', frame: false, blurb: 'A private space for two, across the distance.' },
  wander: { name: 'Wander', url: APPS.wander.url, color: '#2c5e9e', glyph: 'plane', audience: 'anyone', blurb: 'Trips, itineraries and live flights.' },
  aerologger: { name: 'AeroLogger', url: null, color: '#3b6f8f', glyph: 'binoculars', audience: 'anyone', blurb: 'Log the aircraft you spot.' },
  learnleaf: { name: 'LearnLeaf', url: APPS.learnleaf.url, color: '#355147', glyph: 'leaf', audience: 'anyone', blurb: 'Tasks, subjects and projects for school and life.' },
  journal: { name: 'Journal Together', url: 'https://journaltogether.netlify.app', color: '#8a5a44', glyph: 'book', audience: 'anyone', blurb: 'A shared journal.' },
  stimultrack: { name: 'StimulTrack', url: 'https://stimultrack.netlify.app', color: '#6b4226', glyph: 'cup', audience: 'anyone', blurb: 'How much caffeine is in you right now.' },
  alcohol: { name: 'Drink Tracker', url: 'https://alcoholtracker.netlify.app', color: '#8e2f3c', glyph: 'glass', audience: 'anyone', blurb: 'Track drinks over time.' },
  sidequest: { name: 'Side Quest', url: 'https://side-quest-games.netlify.app', color: '#c27c0e', glyph: 'dice', audience: 'anyone', blurb: 'Points games for trips, game days and hangouts.' },
  muster: { name: 'Muster', url: 'https://muster-dashboard.netlify.app', color: '#24292f', glyph: 'pulse', audience: 'owner', blurb: 'Every project you have going, and what Claude is waiting on.' },
  feedback: { name: 'Feedback', url: 'https://ticketbooth.netlify.app', color: '#6b6f76', glyph: 'ticket', audience: 'anyone', blurb: 'Report a bug or ask for a feature in any app.' },
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
  Home: ['pool', 'property', 'board'],
  Travel: ['wander', 'aerologger'],
  Together: ['ourden', 'journal', 'sidequest'],
  Health: ['stimultrack', 'alcohol'],
  School: ['learnleaf'],
  Tools: ['muster', 'feedback'],
};

export function folderName(a, b) {
  return Object.entries(GROUPS).find(([, ids]) => ids.includes(a) && ids.includes(b))?.[0] ?? 'Folder';
}
