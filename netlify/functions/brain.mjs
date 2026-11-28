/*
 * POST /api/brain/report   Authorization: Bearer hb_…   { node, event?, knowledge?, ... }
 *
 * Where every session, agent and app reports what it is doing to Hive Brain.
 * The shape is documented on brain.report in
 * supabase/migrations/20261128000000_brain.sql; netlify/lib/brain.mjs checks
 * the request.
 *
 * Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. The `brain` schema
 * must be in the Supabase project's exposed schemas (API settings).
 */
import { json } from '../lib/shared.mjs';
import { admin } from '../lib/household.mjs';
import { handleReport } from '../lib/brain.mjs';

export default async (req) => {
  const a = admin();
  if (!a) return json(503, { error: 'Supabase is not set up on this site' });
  const call = (path, init) => fetch(`${a.url}${path}`, {
    ...init, headers: { ...a.headers, ...init.headers }, signal: AbortSignal.timeout(8000),
  });
  const { status, body } = await handleReport(req, call);
  return json(status, body);
};

export const config = { path: '/api/brain/report' };
