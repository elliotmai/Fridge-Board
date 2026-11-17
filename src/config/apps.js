/**
 * The apps this board reads from, and where to send people on a phone.
 * On the fridge everything happens in place; on a phone each section links
 * through to the app that owns it.
 */
export const APPS = {
  galaxyfarm: {
    name: 'GalaxyFarm',
    url: 'https://galaxyfarm.netlify.app',
    paths: { chores: '/admin/chores', housesitter: '/admin/housesitter' },
  },
  kitchenhub: {
    name: 'KitchenHub',
    url: 'https://mykitchenhub.netlify.app',
    paths: { mealPlan: '/meal-plan', shopping: '/shopping-list', inventory: '/inventory', recipe: (id) => `/recipes?recipe=${encodeURIComponent(id)}` },
  },
  learnleaf: {
    name: 'LearnLeaf',
    url: 'https://learnleaf-organizer.netlify.app',
    paths: { tasks: '/tasks' },
  },
  wander: {
    name: 'Wander',
    url: 'https://wander-tripplanner.netlify.app',
    paths: { trips: '/', trip: (id) => `/trips/${encodeURIComponent(id)}` },
  },
  znt: {
    name: 'ZNT',
    // ZNT has no URL routes yet (pages are tab state), so every link opens its home.
    url: 'https://zntmanager.netlify.app',
    paths: { home: '/' },
  },
};

/** Build a link into one of the apps. `path` is a key of `paths`, or a literal path. */
export function appLink(app, path, ...args) {
  const a = APPS[app];
  const p = typeof a.paths[path] === 'function' ? a.paths[path](...args) : a.paths[path] ?? path ?? '';
  return a.url + p;
}
