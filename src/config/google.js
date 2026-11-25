/**
 * Google Calendar and Google Tasks on the board come through Our Den's Google
 * link (netlify/functions/board.mjs `google`). Each person connects once, on
 * Our Den's /google page; Hive links there wherever Google isn't connected.
 */
export const GOOGLE_CONNECT_URL = 'https://den.flyingdoublemranch.com/google';
/** The board's reason when this person hasn't connected Google. */
export const GOOGLE_NOT_CONNECTED = 'Connect Google to see your calendar and Google Tasks';
