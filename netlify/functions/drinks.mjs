/*
 * /api/drinks: Drink Tracker quick-add on the fridge board, for anyone in the
 * household (rules and checks in netlify/lib/drinks.mjs).
 *
 * Needs the caller signed in to Hive (the board key alone isn't enough: the
 * drink has to be added by a known member of the household) and
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. RLS on drinks.tree is unchanged.
 */
import { env, json, SourceError } from '../lib/shared.mjs';
import { hiveSession } from '../lib/hiveUser.mjs';
import { admin, adminRead, householdMembers, householdOf } from '../lib/household.mjs';
import { handleDrinks } from '../lib/drinks.mjs';

/** Insert one row; never an upsert, so an existing record can't be replaced. */
async function insert(row) {
  const a = admin();
  const res = await fetch(`${a.url}/rest/v1/tree`, {
    method: 'POST',
    headers: { ...a.headers, 'content-profile': 'drinks', 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new SourceError(`Drink Tracker answered ${res.status}`, res.status);
}

export default async (req, context) => {
  if (!admin()) return json(503, { error: 'Supabase is not set up for the board' });
  try {
    return await handleDrinks(req, context.params?.member || null, {
      session: hiveSession, household: (uid) => householdOf(uid), members: (hid) => householdMembers(hid),
      read: (path, schema) => adminRead(path, schema), insert, now: () => new Date(), tz: env('HOME_TZ', 'America/Chicago'),
    });
  } catch (e) {
    console.error('drinks failed:', e);
    return json(502, { error: 'Couldn’t reach Drink Tracker' });
  }
};

export const config = { path: ['/api/drinks', '/api/drinks/:member'] };
