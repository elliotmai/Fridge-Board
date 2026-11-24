/**
 * Every sign-in email (a carry-over link, a confirmation) comes here:
 * Supabase's templates send `/?token_hash=…&type=…&next=<the app that asked>`.
 * A token hash works whatever browser or flow asked for the email, unlike the
 * default links, which PKCE clients refuse. The session is the shared-domain
 * cookie, so once signed in here the person goes straight back to their app,
 * already signed in there too.
 */
export async function followEmailLink(sb, loc = window.location, go = (u) => window.location.replace(u)) {
  const q = new URLSearchParams(loc.search);
  const tokenHash = q.get('token_hash');
  if (!tokenHash) return;
  const type = q.get('type') || 'email';
  const next = q.get('next');
  for (const k of ['token_hash', 'type', 'next']) q.delete(k);
  const here = `${loc.pathname}${q.toString() ? `?${q}` : ''}${loc.hash}`;
  window.history.replaceState(null, '', here);
  const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) { console.warn('[hive] that sign-in link did not work:', error.message); return; }
  const back = safeNext(next, loc.origin);
  if (back) go(back);
}

/** Only back to Hive or an app under the shared domain, where the session cookie reaches. */
export function safeNext(next, origin) {
  if (!next) return null;
  let u;
  try { u = new URL(next, origin); } catch { return null; }
  if (u.protocol !== 'https:' && u.origin !== origin) return null;
  const shared = u.hostname === 'flyingdoublemranch.com' || u.hostname.endsWith('.flyingdoublemranch.com');
  if (u.origin === origin) return u.pathname === '/' && !u.search && !u.hash ? null : u.href;
  return shared ? u.href : null;
}
