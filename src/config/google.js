/**
 * Google Calendar and Google Tasks: each person connects once, in Hive
 * (src/hive/googleConnect.js). Hive signs in with Google through Supabase for
 * these scopes and keeps the refresh token where Our Den keeps its Google
 * links (netlify/lib/googleConnect.mjs); the board and widgets read it through
 * Our Den (netlify/functions/board.mjs `google`), and so does Our Den.
 */
/** The one Google OAuth client: Supabase's Google sign-in and Our Den's link. Public by design. */
export const GOOGLE_CLIENT_ID = '636066329408-onq8ss219iktkr21ni8t8mn749scgto1.apps.googleusercontent.com';
export const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks';
/** The board's reason when this person hasn't connected Google. */
export const GOOGLE_NOT_CONNECTED = 'Connect Google to see your calendar and Google Tasks';
