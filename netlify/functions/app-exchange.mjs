/*
 * POST /api/hive/exchange/:app  { pass }  → { token, created }
 *
 * "Sign in once with Hive" for an app that has no server of its own to do
 * its half (a static site on GitHub Pages, like AeroLogger). The app's page,
 * opened inside Hive, gets a pass from Hive's frame bridge (src/hive/bridge.js)
 * and sends it here; this checks it exactly as an app's own
 * /api/hive/exchange would (netlify/lib/hiveAssertion.mjs) and answers with a
 * Firebase custom token for the account with the pass's confirmed email, made
 * if there is none. The page passes the token to signInWithCustomToken.
 *
 * Each app here is on its own site, not the shared domain, so only its own
 * address may call (CORS), and only with a pass made for it (aud).
 *
 * Environment (Netlify → Project configuration → Environment variables):
 *   AEROLOGGER_SERVICE_ACCOUNT  a service account key (JSON, or base64 JSON)
 *       for Firebase project aerologger-ec6a6 that may look up and create
 *       Firebase Auth users (Firebase Authentication Admin). Secret. Until it
 *       is set, this answers 503 and AeroLogger shows its own sign-in.
 */
import { verifyPass } from '../lib/hiveAssertion.mjs';
import { accountForEmail, createAccount, customToken, serviceAccount } from '../lib/firebaseAccounts.mjs';
import { HIVE_PUBLIC_KEY } from '../../src/config/hive.js';
import { env, json } from '../lib/shared.mjs';

export const config = { path: '/api/hive/exchange/:app' };

/** Apps Hive signs in to on their behalf: catalog id → where its page lives and whose Firebase. */
export const EXCHANGE_APPS = {
  aerologger: {
    origins: ['https://aero-logger.com', 'https://www.aero-logger.com'],
    project: 'aerologger-ec6a6',
    secret: 'AEROLOGGER_SERVICE_ACCOUNT',
  },
};

const cors = (app, req) => {
  const o = req.headers.get('origin');
  return app && app.origins.includes(o) ? { 'access-control-allow-origin': o, vary: 'origin' } : {};
};

/** The whole decision, with its dependencies passed in so it can be tested. */
export async function exchange(pass, id, { publicKey = HIVE_PUBLIC_KEY, sa, find = accountForEmail, create = createAccount, mint = customToken } = {}) {
  let claims;
  try {
    claims = verifyPass(pass, id, publicKey);
  } catch (e) {
    console.warn(`[app-exchange] ${id}: refused pass:`, e.message);
    return json(401, { error: 'Unauthorized' });
  }
  if (!claims.email || claims.email_verified !== true) return json(401, { error: 'Unauthorized' });
  let uid = await find(claims.email, { sa });
  let created = false;
  if (!uid) {
    uid = await create({ email: claims.email, name: claims.name }, { sa });
    created = true;
  }
  return json(200, { token: mint(uid, { sa, claims: { hive: true } }), created, name: claims.name || null });
}

export default async (req, context) => {
  const id = context?.params?.app || new URL(req.url).pathname.split('/').pop();
  const app = Object.hasOwn(EXCHANGE_APPS, id) ? EXCHANGE_APPS[id] : null;
  const headers = cors(app, req);
  const reply = (r) => { for (const [k, v] of Object.entries(headers)) r.headers.set(k, v); return r; };
  if (req.method === 'OPTIONS') {
    return reply(new Response(null, { status: 204, headers: { 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } }));
  }
  if (!app) return json(404, { error: 'Unknown app' });
  if (req.method !== 'POST') return reply(json(405, { error: 'POST only' }));
  let sa;
  try {
    sa = serviceAccount(env(app.secret));
    if (sa.project_id !== app.project) throw new Error(`${app.secret} is for ${sa.project_id}, not ${app.project}`);
  } catch (e) {
    console.warn(`[app-exchange] ${id}:`, e.message);
    return reply(json(503, { error: 'Hive sign-in is not set up for this app', missing: [app.secret] }));
  }
  let pass = '';
  try { ({ pass } = await req.json()); } catch { /* fall through */ }
  if (typeof pass !== 'string' || !pass) return reply(json(400, { error: 'Missing pass' }));
  try {
    return reply(await exchange(pass, id, { sa }));
  } catch (e) {
    console.error(`[app-exchange] ${id} failed:`, e.message);
    return reply(json(502, { error: 'Could not sign you in right now' }));
  }
};
