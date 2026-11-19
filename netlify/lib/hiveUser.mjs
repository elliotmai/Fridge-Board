/*
 * The signed-in Hive user behind a request, if any: the page sends its Hive
 * Firebase ID token as `Authorization: Bearer <token>` (src/data/api.js).
 * Null when Hive sign-in isn't set up, nobody is signed in, or the token is bad.
 */
import { verifyFirebaseIdToken } from './firebaseIdToken.mjs';
import { signPass } from './hiveAssertion.mjs';
import { env } from './shared.mjs';

export async function hiveUser(req, { verify = verifyFirebaseIdToken } = {}) {
  const projectId = env('VITE_HIVE_FIREBASE_PROJECT_ID');
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!projectId || !token) return null;
  try { return await verify(token, { projectId }); } catch (e) {
    console.warn('[hive] ignored a bad sign-in token:', e.message);
    return null;
  }
}

/**
 * `Authorization` header carrying a pass for `app`, for calling that app as
 * this person. Throws a readable reason when that can't be done.
 */
export function passHeader(user, app) {
  if (!user) throw Object.assign(new Error('Sign in to Hive to see this'), { unconfigured: true });
  if (!user.email || !user.email_verified) throw Object.assign(new Error('Confirm your Hive email to see this'), { unconfigured: true });
  const key = env('HIVE_SIGNING_KEY');
  if (!key) throw Object.assign(new Error('Hive sign-in is not set up'), { unconfigured: true });
  return { authorization: `Hive ${signPass(user, app, key)}` };
}
