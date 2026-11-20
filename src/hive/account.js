import { useEffect, useState } from 'react';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/config/supabase';

/**
 * The Hive account: one sign-in (email and password, or Google) on Hive's
 * Supabase project, the same account every app uses once it has moved there
 * (docs/supabase-migration-plan.md). Apps not yet moved get a pass instead
 * (bridge.js), matched by email, so only a confirmed email counts.
 *
 * Accounts from before the move (Hive's old Firebase project, and the apps'
 * own) keep their passwords: if Supabase doesn't know the password yet,
 * /api/auth/carry-over checks it against the old project and moves it.
 *
 * Supabase loads only when it's first needed.
 */
export const accountsOn = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let loading = null;
export function supabase() {
  loading ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'hive-auth' },
    }));
  return loading;
}

const confirmed = (u) => Boolean(u?.email_confirmed_at || u?.confirmed_at);
const shape = (u) => (u ? {
  uid: u.id, email: u.email,
  name: u.user_metadata?.display_name || u.user_metadata?.full_name || u.user_metadata?.name || null,
  verified: confirmed(u),
} : null);

/**
 * { user, ready, recovering }. `user` is { uid, email, name, verified } or null.
 * `recovering` is true after following a reset-password link, until a new
 * password is set.
 */
export function useHiveUser() {
  const [state, setState] = useState({ user: null, ready: !accountsOn, recovering: false });
  useEffect(() => {
    if (!accountsOn) return;
    let off = () => {};
    let live = true;
    supabase().then((sb) => {
      if (!live) return;
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        setState((s) => ({
          ready: true,
          user: shape(session?.user),
          recovering: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : s.recovering,
        }));
      });
      off = () => data.subscription.unsubscribe();
    }).catch(() => live && setState({ user: null, ready: true, recovering: false }));
    return () => { live = false; off(); };
  }, []);
  return state;
}

/** Throws Supabase's error, so authMessage can explain it. */
const must = ({ data, error }) => { if (error) throw error; return data; };

export async function signInWithEmail(email, password) {
  const sb = await supabase();
  email = email.trim();
  const first = await sb.auth.signInWithPassword({ email, password });
  if (!first.error) return;
  if (first.error.code !== 'invalid_credentials') throw first.error;
  // Maybe an account from before the move: let the server bring its password over.
  const r = await fetch('/api/auth/carry-over', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  }).catch(() => null);
  if (!r?.ok) throw first.error;
  const d = await r.json().catch(() => ({}));
  if (d.how === 'token') return void must(await sb.auth.verifyOtp({ token_hash: d.token, type: 'magiclink' }));
  if (d.how === 'email') throw Object.assign(new Error('emailed'), { code: 'carry_over_emailed' });
  must(await sb.auth.signInWithPassword({ email, password }));
}

/** New account: Supabase sends the confirmation email. */
export async function createAccount(name, email, password) {
  const sb = await supabase();
  const data = must(await sb.auth.signUp({
    email: email.trim(), password,
    options: { data: { display_name: name.trim() || undefined }, emailRedirectTo: `${location.origin}/` },
  }));
  // With confirmation on, Supabase returns no session and, for an email that
  // already has an account, a user with no identities.
  if (data.user && !data.user.identities?.length) throw Object.assign(new Error('exists'), { code: 'user_already_exists' });
  return { needsConfirm: !data.session };
}

export async function resendConfirmation(email) {
  const sb = await supabase();
  must(await sb.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${location.origin}/` } }));
}

/** After clicking the link in the email: true if this browser now has a confirmed sign-in. */
export async function checkConfirmed() {
  const sb = await supabase();
  const { data } = await sb.auth.refreshSession();
  return confirmed(data?.user);
}

export async function resetPassword(email) {
  const sb = await supabase();
  must(await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/` }));
}

/** From the reset link: the new password. */
export async function setNewPassword(password) {
  const sb = await supabase();
  must(await sb.auth.updateUser({ password }));
}

/** Plain-English message for a Supabase Auth error. */
export function authMessage(e) {
  const code = e?.code || '';
  const text = String(e?.message || '');
  if (code === 'invalid_credentials') return 'That email and password don’t match.';
  if (code === 'carry_over_emailed') return 'Almost there: we emailed you a link to finish signing in. Open it on this device.';
  if (code === 'email_not_confirmed') return 'Confirm your email first: open the link we sent you.';
  if (code === 'user_already_exists' || code === 'email_exists') return 'There’s already a Hive account with that email. Sign in instead.';
  if (code === 'weak_password') return 'Use a longer password: at least 6 characters.';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'That doesn’t look like an email address.';
  if (/rate_limit|over_.*limit/.test(code)) return 'Too many tries. Wait a minute, then try again.';
  if (code === 'same_password') return 'That’s your current password. Choose a new one.';
  if (code === 'signup_disabled' || code === 'provider_disabled') return 'That way of signing in isn’t turned on for Hive yet.';
  if (/fetch|network/i.test(text)) return 'Can’t reach the internet right now.';
  return 'Something went wrong. Try again.';
}

/** Google: leaves the page and comes back signed in. */
export async function signInWithGoogle() {
  const sb = await supabase();
  must(await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}${location.pathname}`, queryParams: { prompt: 'select_account' } },
  }));
}

export async function signOut() {
  const sb = await supabase();
  await sb.auth.signOut();
}

/**
 * The signed-in Hive user's access token, for the board's own API to act as
 * them (src/data/api.js). Null when nobody is signed in or their email isn't
 * confirmed. Waits for a saved sign-in to load first.
 */
export async function idToken() {
  if (!accountsOn) return null;
  try {
    const sb = await supabase();
    const { data } = await sb.auth.getSession();
    return data.session && confirmed(data.session.user) ? data.session.access_token : null;
  } catch {
    return null;
  }
}

/** Fired on window when the Hive user signs in, out, or confirms their email. */
export const USER_CHANGED = 'hive:user-changed';

/**
 * A two-minute pass for one app, from /api/hive/pass. Null when signed out.
 * Throws with a readable message when the server says no.
 */
export async function passFor(app) {
  const token = await idToken();
  if (!token) return null;
  const res = await fetch('/api/hive/pass', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ app }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Hive answered ${res.status}`);
  return body.pass;
}

/* ------------------------------------------------------------ households -- */

/** My household and its people: { id, name, role, members: [{ id, name, email, role }] } or null. */
export async function myHousehold() {
  const sb = await supabase();
  const core = sb.schema('core');
  const { data: hid } = await core.rpc('my_household');
  if (!hid) return null;
  const [h, m] = await Promise.all([
    core.from('households').select('id, name').eq('id', hid).single(),
    core.from('household_members').select('user_id, role').eq('household_id', hid),
  ]);
  if (h.error) throw h.error;
  const ids = (m.data || []).map((x) => x.user_id);
  const { data: people } = ids.length ? await core.from('profiles').select('id, email, display_name').in('id', ids) : { data: [] };
  const me = (await sb.auth.getUser()).data.user?.id;
  const members = (m.data || []).map((x) => {
    const p = people?.find((y) => y.id === x.user_id) || {};
    return { id: x.user_id, role: x.role, email: p.email || '', name: p.display_name || p.email || 'Someone', me: x.user_id === me };
  });
  return { id: h.data.id, name: h.data.name, role: members.find((x) => x.me)?.role || 'member', members };
}

export async function createHousehold(name) {
  const sb = await supabase();
  return must(await sb.schema('core').rpc('create_household', { name: name.trim() }));
}

export async function inviteCode(householdId) {
  const sb = await supabase();
  return must(await sb.schema('core').rpc('create_invite', { hid: householdId }));
}

export async function joinHousehold(code) {
  const sb = await supabase();
  const r = await sb.schema('core').rpc('join_household', { invite: code.trim() });
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code === 'P0002' ? 'bad_invite' : r.error.code });
  return r.data;
}

/** Plain-English message for a household error. */
export function householdMessage(e) {
  if (e?.code === 'bad_invite') return 'That code doesn’t work. It may be used up or more than a week old.';
  return authMessage(e);
}
