/*
 * Hive Brain reporting: the one door every reporter uses (Claude Code hooks,
 * Muster, chats through the brain connector).
 *
 * A reporter sends its brain key (made in Hive, brain.create_key) as a bearer
 * token. Only the key's SHA-256 travels on to the database, where
 * brain.report decides everything else: whose it is, whether it is revoked,
 * what may be stored, and what gets stripped. This file only checks the
 * request's shape and maps the database's answer to HTTP.
 *
 * See supabase/migrations/20261128000000_brain.sql.
 */
import { createHash } from 'node:crypto';

export const MAX_BODY_BYTES = 64 * 1024;
const KEY = /^hb_[0-9a-f]{48}$/;

/** The key from `Authorization: Bearer hb_…`, or null. */
export function brainKey(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '');
  return m && KEY.test(m[1]) ? m[1] : null;
}

export const hashKey = (k) => createHash('sha256').update(k).digest('hex');

/**
 * Handle one report. `call(path, init)` posts to Supabase as the service role
 * and returns the fetch Response. Returns { status, body }.
 */
export async function handleReport(req, call) {
  if (req.method !== 'POST') return { status: 405, body: { error: 'POST a report' } };
  const key = brainKey(req);
  if (!key) return { status: 401, body: { error: 'Send your brain key as Authorization: Bearer hb_…' } };

  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return { status: 413, body: { error: 'A report is at most 64 KB' } };
  let p;
  try { p = JSON.parse(text); } catch { return { status: 400, body: { error: 'Body is not JSON' } }; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { status: 400, body: { error: 'Body must be a JSON object' } };

  let res;
  try {
    res = await call('/rest/v1/rpc/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-profile': 'brain', 'accept-profile': 'brain' },
      body: JSON.stringify({ key_hash: hashKey(key), p }),
    });
  } catch (e) {
    console.error('[brain] report failed:', e.message);
    return { status: 502, body: { error: 'The brain could not be reached' } };
  }
  const out = await res.json().catch(() => null);
  if (res.ok) return { status: 200, body: out };
  // PostgREST passes the SQLSTATE through as `code`.
  if (out?.code === '42501') return { status: 401, body: { error: 'Unknown or revoked brain key' } };
  if (out?.code === '22023') return { status: 400, body: { error: out.message } };
  console.error('[brain] report answered', res.status, out?.message);
  return { status: 502, body: { error: 'The brain refused the report' } };
}
