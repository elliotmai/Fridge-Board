/**
 * Per-app identity. Everything else (localStorage namespacing, footer link,
 * manifest name) reads from here.
 */
export const APP_NAME = 'Fridge Board';

// Namespaces localStorage keys (e.g. `${APP_KEY}.whatsNewSeen`).
export const APP_KEY = 'fridge-board';

// Shared bug-report / feature-request destination for all apps.
export const FEEDBACK_URL = 'https://ticketbooth.netlify.app/';
