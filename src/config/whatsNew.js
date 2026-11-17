/**
 * End-user "What's New" entries — NEWEST FIRST. The pre-commit hook stamps
 * `version` with today's date on commit, so a placeholder is fine.
 * Nothing users would notice? Skip the entry and put `[whats-new: none]` in the
 * commit message.
 */
export const WHATS_NEW = [
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
