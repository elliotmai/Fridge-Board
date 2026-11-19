/*
 * Verifying a Firebase ID token with node:crypto, per Google's documented checks
 * (firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library):
 * RS256, signed by one of Google's published securetoken keys (by `kid`),
 * aud = project id, iss = https://securetoken.google.com/<project id>,
 * exp in the future, iat and auth_time in the past, non-empty sub.
 *
 * Same approach as app-template's netlify/lib/apiTokens.mjs, which avoids
 * firebase-admin/auth because it breaks Netlify's function runtime. This one
 * also returns the email claims Hive passes on to apps.
 */
import { createPublicKey, verify } from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certCache = { at: 0, maxAge: 0, certs: null };

async function googleCerts() {
  if (certCache.certs && Date.now() - certCache.at < certCache.maxAge) return certCache.certs;
  const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Google signing keys answered ${res.status}`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600) * 1000;
  certCache = { at: Date.now(), maxAge, certs: await res.json() };
  return certCache.certs;
}

const b64url = (part) => Buffer.from(part, 'base64url');

/** Returns { uid, email, email_verified, name } for a valid ID token; throws otherwise. */
export async function verifyFirebaseIdToken(idToken, { projectId, keys = googleCerts, now = Date.now() } = {}) {
  if (!projectId) throw new Error('no project id');
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  let header, claims;
  try { header = JSON.parse(b64url(parts[0]).toString('utf8')); claims = JSON.parse(b64url(parts[1]).toString('utf8')); } catch { throw new Error('malformed token'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('wrong algorithm');
  const pem = (await keys())[header.kid];
  if (!pem) throw new Error('unknown signing key');
  const ok = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey(pem), b64url(parts[2]));
  if (!ok) throw new Error('bad signature');
  const secs = Math.floor(now / 1000);
  if (claims.aud !== projectId) throw new Error('wrong audience');
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('wrong issuer');
  if (!(claims.exp > secs)) throw new Error('expired');
  if (!(claims.iat <= secs + 300)) throw new Error('issued in the future');
  if (claims.auth_time !== undefined && !(claims.auth_time <= secs + 300)) throw new Error('auth_time in the future');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw new Error('no subject');
  return { uid: claims.sub, email: claims.email || null, email_verified: claims.email_verified === true, name: claims.name || null };
}
