import { OPEN_ACCOUNT } from '@/components/board/bits';
import { GOOGLE_SCOPES } from '@/config/google';
import { idToken, supabase, USER_CHANGED } from './account';
import { judgeReturn, savePending, takePending } from './googleReturn';

/**
 * Connect Google Calendar & Tasks, in Hive, in one tap.
 *
 * connectGoogle() signs in with Google through Supabase, asking for Calendar
 * (read only) and Tasks, offline and with consent, so Google hands over a
 * refresh token. It keeps the same Hive account: someone who already signs in
 * with Google signs in with that identity again; anyone else links Google to
 * their account (linkIdentity). Back here, Supabase's session carries Google's
 * tokens once; finishGoogleConnect() posts them to /api/google/connect, which
 * keeps the refresh token where Our Den keeps every Google link. Then the
 * session is refreshed, so Google's tokens don't linger in the sign-in cookie.
 *
 * Whether it's connected is always the server's answer (googleStatus), never
 * something this browser remembers.
 */
export const GOOGLE_CHANGED = 'hive:google-changed';

let last = null; // the outcome of the latest return from Google, shown once on the account sheet
export const takeGoogleResult = () => { const r = last; last = null; return r; };
const announce = (r) => { last = r; window.dispatchEvent(new CustomEvent(GOOGLE_CHANGED, { detail: r })); };

/** Off to Google. `back`: an address under the shared domain to return to afterwards (Our Den). */
export async function connectGoogle({ back = null } = {}) {
  const sb = await supabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw Object.assign(new Error('Sign in to Hive first.'), { code: 'signed_out' });
  savePending(sessionStorage, { uid: user.id, back });
  const google = user.identities?.find((i) => i.provider === 'google');
  const hint = google?.identity_data?.email;
  const options = {
    redirectTo: `${location.origin}${location.pathname}`,
    scopes: GOOGLE_SCOPES,
    queryParams: { access_type: 'offline', prompt: 'consent', ...(hint ? { login_hint: hint } : {}) },
  };
  if (!google) {
    const r = await sb.auth.linkIdentity({ provider: 'google', options });
    if (!r.error) return;
    // Manual linking off: signing in with Google still lands on this account
    // when the emails match (Supabase links them); finish checks it did.
  }
  const r = await sb.auth.signInWithOAuth({ provider: 'google', options });
  if (r.error) { takePending(sessionStorage); throw r.error; }
}

/** Back from Google (account.js calls this when a connect is pending in this tab). */
export async function finishGoogleConnect(sb) {
  const pending = takePending(sessionStorage);
  if (!pending) return;
  const { data: { session } } = await sb.auth.getSession();
  const judged = judgeReturn(pending, session);
  let result = judged;
  if (judged.ok) {
    try {
      const res = await fetch('/api/google/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ refreshToken: judged.refreshToken, accessToken: judged.accessToken }),
      });
      const body = await res.json().catch(() => ({}));
      result = res.ok ? { ok: true, message: 'Google is connected.' } : { ok: false, message: body.error || 'Couldn’t save the Google connection. Try again.' };
    } catch {
      result = { ok: false, message: 'Can’t reach Hive right now. Try connecting again.' };
    }
  }
  // A fresh session has no Google tokens in it: they're only needed on the server.
  if (session) await sb.auth.refreshSession().catch(() => {});
  if (result.ok && pending.back) { location.replace(pending.back); return; }
  announce({ ok: result.ok, message: result.message });
  if (result.ok) window.dispatchEvent(new Event(USER_CHANGED)); // the board and widgets reload, now with Google
  window.dispatchEvent(new Event(OPEN_ACCOUNT));
}

/**
 * Checked by the server with Google: { connected, working, calendar, tasks, reason }.
 * `calendar` and `tasks` are true, or Google's reason.
 */
export async function googleStatus() {
  const token = await idToken();
  if (!token) return { connected: false, reason: 'Sign in to Hive first' };
  const res = await fetch('/api/google/connect', { headers: { authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Hive answered ${res.status}`);
  return body;
}
