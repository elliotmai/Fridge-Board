#!/usr/bin/env node
/**
 * Load an export (export.mjs) into the waiting tables, through Supabase's
 * management API (database/query). Data first, then accounts, so that people
 * who already have an account get their data straight away.
 *
 *   SUPABASE_PROJECT=<ref> node scripts/bringover/load.mjs <dir>/<app>.json [--household <uuid>]
 *
 * Needs an access token for api.supabase.com in SUPABASE_ACCESS_TOKEN, or a
 * proxy that adds one. Safe to run again: everything upserts.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REF = process.env.SUPABASE_PROJECT;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

// Through curl (stdin for the body): it follows the HTTPS proxy settings, which Node's fetch doesn't for every host.
async function sql(query) {
  const args = ['-sS', '-w', '\n%{http_code}', '-X', 'POST', '-H', 'content-type: application/json',
    ...(TOKEN ? ['-H', `authorization: Bearer ${TOKEN}`] : []), '--data-binary', '@-', `https://api.supabase.com/v1/projects/${REF}/database/query`];
  const out = execFileSync('curl', args, { input: JSON.stringify({ query }), maxBuffer: 1 << 28 }).toString();
  const cut = out.lastIndexOf('\n');
  const body = out.slice(0, cut), status = Number(out.slice(cut + 1));
  if (status < 200 || status >= 300) throw new Error(`database/query → ${status} ${body.slice(0, 400)}`);
  return JSON.parse(body || '[]');
}

/** A JSON value as a SQL jsonb literal, with a dollar quote no data can close. */
export function jsonb(value) {
  const text = JSON.stringify(value);
  let tag = 'j';
  while (text.includes(`$${tag}$`)) tag += 'j';
  return `$${tag}$${text}$${tag}$::jsonb`;
}

/** Batches whose JSON stays under ~1 MB, the API's comfortable size. */
export function batches(items, size = (x) => JSON.stringify(x).length, limit = 900_000) {
  const out = [];
  let cur = [], n = 0;
  for (const it of items) {
    const s = size(it);
    if (cur.length && n + s > limit) { out.push(cur); cur = []; n = 0; }
    cur.push(it); n += s;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args[0];
  const hh = args.includes('--household') ? args[args.indexOf('--household') + 1] : null;
  if (!REF || !file) throw new Error('usage: SUPABASE_PROJECT=<ref> load.mjs <export.json> [--household <uuid>]');
  const ex = JSON.parse(readFileSync(file, 'utf8'));
  const app = ex.app;
  if (!/^[a-z]+$/.test(app)) throw new Error(`odd app name: ${app}`);
  const uuid = hh && /^[0-9a-f-]{36}$/i.test(hh) ? hh : null;

  const data = Object.entries(ex.data || {});
  for (const b of batches(data)) {
    await sql(`insert into core.waiting_data (app, legacy_id, payload)
      select '${app}', e.key, e.value from jsonb_each(${jsonb(Object.fromEntries(b))}) e
      on conflict (app, legacy_id) do update set payload = excluded.payload`);
  }
  for (const b of batches(ex.accounts || [])) {
    await sql(`insert into core.waiting_accounts (app, legacy_id, email, email_verified)
      select '${app}', a ->> 'legacy_id', a ->> 'email', coalesce((a ->> 'email_verified')::boolean, false)
      from jsonb_array_elements(${jsonb(b)}) a
      on conflict (app, legacy_id) do update set email = excluded.email, email_verified = excluded.email_verified`);
  }
  if (ex.household?.length) {
    if (!uuid) throw new Error('this export goes to a household: pass --household <uuid>');
    for (const b of batches(ex.household)) {
      await sql(`insert into ${app}.docs (household_id, collection, id, data)
        select '${uuid}'::uuid, r ->> 'collection', r ->> 'id', r -> 'data' from jsonb_array_elements(${jsonb(b)}) r
        on conflict do nothing`);
    }
    await sql(`insert into ${app}.imports (household_id, rows) values ('${uuid}'::uuid, ${ex.household.length}) on conflict do nothing`);
  }
  const [left] = await sql(`select count(*)::int as waiting from core.waiting_data where app = '${app}'`);
  console.log(`${app}: loaded ${data.length} payloads, ${(ex.accounts || []).length} accounts${ex.household ? `, ${ex.household.length} household records` : ''}; still waiting for someone to arrive: ${left.waiting}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
