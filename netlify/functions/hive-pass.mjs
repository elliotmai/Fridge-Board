/*
 * POST /api/hive/pass  { app }   Authorization: Bearer <Hive (Supabase) access token>
 *   → { pass, expiresIn }
 *
 * Hive's half of "sign in once". The signed-in Hive user asks for a pass for
 * one app; the app's own /api/hive/exchange turns it into a sign-in there.
 * See netlify/lib/hiveAssertion.mjs for what a pass is.
 *
 * Environment (Netlify → Project configuration → Environment variables):
 *   HIVE_SIGNING_KEY   the private half of HIVE_PUBLIC_KEY (src/config/hive.js). Secret.
 * Hive's Supabase project comes from src/config/supabase.js.
 */
import { CATALOG } from '../../src/config/catalog.js';
import { PASS_SECONDS, signPass } from '../lib/hiveAssertion.mjs';
import { env, json } from '../lib/shared.mjs';
import { verifySupabaseToken } from '../lib/supabaseToken.mjs';

export const config = { path: '/api/hive/pass' };

/** Apps that can take a pass: listed, opened in a frame, with an address. */
export const passApps = () => Object.entries(CATALOG).filter(([, a]) => a.url && !a.native).map(([id]) => id);

/** Apps on the shared domain ask for passes from their own address (outside Hive too). */
const SHARED = /^https:\/\/([a-z0-9-]+\.)?flyingdoublemranch\.com$/;
const cors = (req) => {
  const o = req.headers.get('origin');
  return o && SHARED.test(o) ? { 'access-control-allow-origin': o, vary: 'origin' } : {};
};

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors(req), 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '86400' } });
  }
  const res = await handle(req);
  for (const [k, v] of Object.entries(cors(req))) res.headers.set(k, v);
  return res;
};

async function handle(req) {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const signingKey = env('HIVE_SIGNING_KEY');
  if (!signingKey) return json(503, { error: 'Hive sign-in is not set up', missing: ['HIVE_SIGNING_KEY'] });

  let app = '';
  try { ({ app } = await req.json()); } catch { /* fall through */ }
  if (typeof app !== 'string' || !passApps().includes(app)) return json(400, { error: 'Unknown app' });

  const idToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let user;
  try {
    user = await verifySupabaseToken(idToken);
  } catch (e) {
    console.warn('[hive-pass] refused:', e.message);
    return json(401, { error: 'Unauthorized' });
  }
  // Apps match accounts by email, so only a confirmed email gets a pass.
  if (!user.email || !user.email_verified) return json(403, { error: 'Your Hive account needs a verified email' });
  return json(200, { pass: signPass(user, app, signingKey), expiresIn: PASS_SECONDS });
}
