/*
 * Verifying a Supabase access token with node:crypto: ES256, signed by one of
 * the project's published keys (its JWKS, matched by `kid`), issued by the
 * project, audience "authenticated", not expired.
 *
 * Supabase only gives an email-and-password account a session once its email
 * is confirmed (confirmations are on), so a valid token's email is a confirmed
 * one; Google accounts carry user_metadata.email_verified.
 */
import { createPublicKey, verify } from 'node:crypto';
import { SUPABASE_URL } from '../../src/config/supabase.js';

let jwksCache = { at: 0, keys: null };
const JWKS_TTL = 10 * 60 * 1000;

async function projectKeys(url = SUPABASE_URL) {
  if (jwksCache.keys && Date.now() - jwksCache.at < JWKS_TTL) return jwksCache.keys;
  const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Supabase signing keys answered ${res.status}`);
  jwksCache = { at: Date.now(), keys: (await res.json()).keys || [] };
  return jwksCache.keys;
}

const b64url = (part) => Buffer.from(part, 'base64url');

/**
 * Returns { uid, email, email_verified, name, screen } for a valid token;
 * throws otherwise. `screen` is the household id when the account is a
 * household screen (app_metadata, which only the server can set), else null.
 */
export async function verifySupabaseToken(token, { url = SUPABASE_URL, keys = () => projectKeys(url), now = Date.now() } = {}) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  let header, claims;
  try { header = JSON.parse(b64url(parts[0]).toString('utf8')); claims = JSON.parse(b64url(parts[1]).toString('utf8')); } catch { throw new Error('malformed token'); }
  if (header.alg !== 'ES256' || typeof header.kid !== 'string') throw new Error('wrong algorithm');
  const jwk = (await keys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  const ok = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, b64url(parts[2]));
  if (!ok) throw new Error('bad signature');
  const secs = Math.floor(now / 1000);
  if (claims.iss !== `${url}/auth/v1`) throw new Error('wrong issuer');
  if (claims.aud !== 'authenticated' && !(Array.isArray(claims.aud) && claims.aud.includes('authenticated'))) throw new Error('wrong audience');
  if (!(claims.exp > secs)) throw new Error('expired');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('no subject');
  if (claims.is_anonymous) throw new Error('anonymous');
  const meta = claims.user_metadata || {};
  return {
    uid: claims.sub,
    email: claims.email || null,
    email_verified: Boolean(claims.email) && meta.email_verified !== false,
    name: meta.display_name || meta.full_name || meta.name || null,
    screen: typeof claims.app_metadata?.hive_screen === 'string' ? claims.app_metadata.hive_screen : null,
  };
}
