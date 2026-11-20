/**
 * Per-app identity. Everything else (localStorage namespacing, footer link,
 * manifest name) reads from here.
 */
export const APP_NAME = 'Hive';

// Namespaces localStorage keys (e.g. `${APP_KEY}.whatsNewSeen`). Still
// 'fridge-board' after the rename to Hive, so the fridge tablet keeps its board
// key, settings and ticks. Don't change it.
export const APP_KEY = 'fridge-board';

// Shared bug-report / feature-request destination for all apps.
export const FEEDBACK_URL = 'https://tickets.flyingdoublemranch.com/';
