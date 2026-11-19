/*
 * POST /api/hive/pass  { app }   Authorization: Bearer <Hive Firebase ID token>
 *   → { pass, expiresIn }
 *
 * Hive's half of "sign in once". The signed-in Hive user asks for a pass for
 * one app; the app's own /api/hive/exchange turns it into a sign-in there.
 * See netlify/lib/hiveAssertion.mjs for what a pass is.
 *
 * Environment (Netlify → Project configuration → Environment variables):
 *   VITE_HIVE_FIREBASE_PROJECT_ID  Hive's Firebase project (also used by the page)
 *   HIVE_SIGNING_KEY               from `node scripts/hive-keys.mjs`. Secret.
 */
import { CATALOG } from '../../src/config/catalog.js';
import { verifyFirebaseIdToken } from '../lib/firebaseIdToken.mjs';
import { PASS_SECONDS, signPass } from '../lib/hiveAssertion.mjs';
import { env, json } from '../lib/shared.mjs';

export const config = { path: '/api/hive/pass' };

/** Apps that can take a pass: listed, opened in a frame, with an address. */
export const passApps = () => Object.entries(CATALOG).filter(([, a]) => a.url && !a.native).map(([id]) => id);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const projectId = env('VITE_HIVE_FIREBASE_PROJECT_ID');
  const signingKey = env('HIVE_SIGNING_KEY');
  if (!projectId || !signingKey) return json(503, { error: 'Hive sign-in is not set up', missing: [!projectId && 'VITE_HIVE_FIREBASE_PROJECT_ID', !signingKey && 'HIVE_SIGNING_KEY'].filter(Boolean) });

  let app = '';
  try { ({ app } = await req.json()); } catch { /* fall through */ }
  if (typeof app !== 'string' || !passApps().includes(app)) return json(400, { error: 'Unknown app' });

  const idToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let user;
  try {
    user = await verifyFirebaseIdToken(idToken, { projectId });
  } catch (e) {
    console.warn('[hive-pass] refused:', e.message);
    return json(401, { error: 'Unauthorized' });
  }
  // Apps match accounts by email, so only a Google-verified email gets a pass.
  if (!user.email || !user.email_verified) return json(403, { error: 'Your Hive account needs a verified email' });
  return json(200, { pass: signPass(user, app, signingKey), expiresIn: PASS_SECONDS });
};
