#!/usr/bin/env node
/**
 * One Hive account per email, made ahead of time (the owner's call, 2026-11-25).
 *
 * Reads every old Firebase project's accounts, records each old account in
 * core.waiting_accounts (so its data attaches to that email), and creates one
 * confirmed Hive account, with no password and no email sent, for every email
 * that doesn't have one yet (app_metadata.legacy = true). The database then
 * moves each person's old data in at once. The first old password they type
 * becomes their only Hive password (netlify/lib/carryOver.mjs).
 *
 *   GOOGLE_TOKEN=... SUPABASE_SECRET_KEY_FILE=path node scripts/bringover/combine-accounts.mjs
 *
 * Safe to run again: records upsert and existing accounts are left alone.
 * Talks through curl (Node's fetch skips the HTTPS proxy for some hosts).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PROJECTS = {
  hive: 'hive-aa9c0', learnleaf: 'learnleaf-organizer', stimultrack: 'caffeine-tracker-bcd4a', journal: 'journal-together-9234f',
  alcohol: 'alctracker-b6c8a', aerologger: 'aerologger-ec6a6', wander: 'wander-f10b1', ourden: 'ourden',
  kitchenhub: 'mykitchenhub-db665', sidequest: 'sidequest-42196',
};
const REF = process.env.SUPABASE_PROJECT || 'fcjiummxpacwriwopcho';
const BASE = `https://${REF}.supabase.co`;

function curl(args, input) {
  const out = execFileSync('curl', ['-sS', '-w', '\n%{http_code}', ...args], { input, maxBuffer: 1 << 28 }).toString();
  const cut = out.lastIndexOf('\n');
  const text = out.slice(0, cut);
  return { status: Number(out.slice(cut + 1)), body: text ? JSON.parse(text) : null };
}

function oldAccounts(token) {
  const all = [];
  for (const [app, project] of Object.entries(PROJECTS)) {
    let page = '';
    do {
      const r = curl(['-H', `authorization: Bearer ${token}`, '-H', `x-goog-user-project: ${project}`,
        `https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=1000${page ? `&nextPageToken=${page}` : ''}`]);
      if (r.status !== 200) throw new Error(`${app}: ${r.status}`);
      for (const u of r.body.users || []) {
        if (!u.email) continue;
        const google = (u.providerUserInfo || []).some((p) => p.providerId === 'google.com');
        all.push({
          app, legacy_id: u.localId, email: u.email.toLowerCase(), email_verified: Boolean(u.emailVerified || google),
          name: u.displayName || null, last: Number(u.lastLoginAt || u.createdAt || 0),
        });
      }
      page = r.body.nextPageToken || '';
    } while (page);
  }
  return all;
}

function main() {
  const token = process.env.GOOGLE_TOKEN;
  const key = readFileSync(process.env.SUPABASE_SECRET_KEY_FILE, 'utf8').trim();
  if (!token || !key) throw new Error('GOOGLE_TOKEN and SUPABASE_SECRET_KEY_FILE are required');
  const accts = oldAccounts(token);

  const rows = accts.map(({ app, legacy_id, email, email_verified }) => ({ app, legacy_id, email, email_verified }));
  const q = `insert into core.waiting_accounts (app, legacy_id, email, email_verified)
    select r->>'app', r->>'legacy_id', r->>'email', (r->>'email_verified')::boolean from jsonb_array_elements($j$${JSON.stringify(rows)}$j$::jsonb) r
    on conflict (app, legacy_id) do update set email = excluded.email, email_verified = excluded.email_verified`;
  const w = curl(['-X', 'POST', '-H', 'content-type: application/json', '--data-binary', '@-',
    `https://api.supabase.com/v1/projects/${REF}/database/query`], JSON.stringify({ query: q }));
  if (w.status >= 300) throw new Error(`recording old accounts: ${w.status}`);

  const existing = new Set();
  for (let page = 1; ; page++) {
    const r = curl(['-H', `apikey: ${key}`, `${BASE}/auth/v1/admin/users?page=${page}&per_page=200`]);
    const users = r.body?.users || [];
    users.forEach((u) => existing.add((u.email || '').toLowerCase()));
    if (users.length < 200) break;
  }
  const byEmail = new Map();
  for (const a of accts) byEmail.set(a.email, [...(byEmail.get(a.email) || []), a]);
  let made = 0;
  for (const [email, list] of byEmail) {
    if (existing.has(email)) continue;
    list.sort((x, y) => y.last - x.last);
    const name = list.find((x) => x.name)?.name;
    const r = curl(['-X', 'POST', '-H', `apikey: ${key}`, '-H', 'content-type: application/json', '--data-binary', '@-', `${BASE}/auth/v1/admin/users`],
      JSON.stringify({
        email, email_confirm: true,
        app_metadata: { legacy: true, combined_from: [...new Set(list.map((x) => x.app))].sort() },
        user_metadata: name ? { display_name: name } : {},
      }));
    if (r.status < 300) made++;
    else console.error(`could not create an account for one email: ${r.status}`);
  }
  console.log(`${accts.length} old accounts, ${byEmail.size} emails; ${existing.size} had Hive accounts, ${made} created`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
