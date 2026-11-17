/**
 * End-user "What's New" entries — NEWEST FIRST. The pre-commit hook stamps
 * `version` with today's date on commit, so a placeholder is fine.
 * Nothing users would notice? Skip the entry and put `[whats-new: none]` in the
 * commit message.
 */
export const WHATS_NEW = [
  {
    version: '2026.11.17.3',
    date: 'November 2026',
    items: ['The whole board now fits an 8-inch tablet in landscape, instead of switching to the phone layout.'],
  },
  {
    version: '2026.11.17.2',
    date: 'November 2026',
    items: [
      'Chores and the housesitter guide come from GalaxyFarm, and ticking a chore here ticks it there.',
      'Meals, recipe cards and the shopping list come from KitchenHub. Adding or ticking an item updates KitchenHub.',
      'Weather and the away rule use the farm location from GalaxyFarm settings.',
      'The board now asks for its key once on each device, so only your devices can see your data.',
    ],
  },
  {
    version: '2026.11.17.1',
    date: 'November 2026',
    items: [
      'Weather, LearnLeaf tasks and the next ZNT breeding group are now live.',
      'Trips go live once Wander is connected. Anything still showing sample data is labelled Sample.',
    ],
  },
  {
    version: '2026.11.17',
    date: 'November 2026',
    items: [
      'One screen for the fridge: chores, meals, shopping, trips, tasks and the next breeding group.',
      'Tap Start cooking for step-by-step recipe cards with timers that keep running.',
      'Housesitter mode turns on by itself when you travel far from home.',
      'On a phone, each section links straight to the app it comes from.',
      'The board shows sample data until each app is connected.',
    ],
  },
];
