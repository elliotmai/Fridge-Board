import { useEffect, useState } from 'react';

/**
 * The Hive account: one sign-in (email and password, or Google), on Hive's own
 * Firebase project, that signs you into every app opened inside Hive (see
 * bridge.js). Apps match you by email, so an email-and-password account counts
 * only once its email is confirmed; until then apps are told nobody is signed in.
 *
 * Off until the four VITE_HIVE_FIREBASE_* values are set in Netlify; until
 * then Hive works exactly as before and each app keeps its own sign-in.
 * Firebase loads only when it's configured, so it costs nothing otherwise.
 */
const cfg = {
  apiKey: import.meta.env.VITE_HIVE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_HIVE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_HIVE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_HIVE_FIREBASE_APP_ID,
};
export const accountsOn = Boolean(cfg.apiKey && cfg.projectId && cfg.authDomain);

let loading = null;
function firebase() {
  loading ??= (async () => {
    const [{ initializeApp }, fa] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    const auth = fa.getAuth(initializeApp(cfg, 'hive'));
    return { auth, fa };
  })();
  return loading;
}

/** { user, ready }. `user` is { uid, email, name, verified } or null. */
export function useHiveUser() {
  const [state, setState] = useState({ user: null, ready: !accountsOn });
  useEffect(() => {
    if (!accountsOn) return;
    let off = () => {};
    let live = true;
    firebase().then(({ auth, fa }) => {
      if (!live) return;
      // onIdTokenChanged, not onAuthStateChanged: it also fires when a refreshed
      // token shows the email has just been confirmed.
      off = fa.onIdTokenChanged(auth, (u) => setState({
        ready: true,
        user: u ? { uid: u.uid, email: u.email, name: u.displayName, verified: u.emailVerified } : null,
      }));
    }).catch(() => live && setState({ user: null, ready: true }));
    return () => { live = false; off(); };
  }, []);
  return state;
}

export async function signInWithEmail(email, password) {
  const { auth, fa } = await firebase();
  await fa.signInWithEmailAndPassword(auth, email.trim(), password);
}

/** New account: sets the name and sends the confirmation email. */
export async function createAccount(name, email, password) {
  const { auth, fa } = await firebase();
  const { user } = await fa.createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name.trim()) await fa.updateProfile(user, { displayName: name.trim() });
  await fa.sendEmailVerification(user);
  await user.getIdToken(true); // so the new name shows straight away
}

export async function resendConfirmation() {
  const { auth, fa } = await firebase();
  if (auth.currentUser) await fa.sendEmailVerification(auth.currentUser);
}

/** After clicking the link in the email: refresh, so Hive sees it's confirmed. Returns true if it is. */
export async function checkConfirmed() {
  const { auth } = await firebase();
  const u = auth.currentUser;
  if (!u) return false;
  await u.reload();
  await u.getIdToken(true);
  return u.emailVerified;
}

export async function resetPassword(email) {
  const { auth, fa } = await firebase();
  await fa.sendPasswordResetEmail(auth, email.trim());
}

/** Plain-English message for a Firebase Auth error. */
export function authMessage(e) {
  const code = e?.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return 'That email and password don’t match.';
  if (/email-already-in-use/.test(code)) return 'There’s already a Hive account with that email. Sign in instead.';
  if (/weak-password/.test(code)) return 'Use a password of at least 6 characters.';
  if (/invalid-email/.test(code)) return 'That doesn’t look like an email address.';
  if (/too-many-requests/.test(code)) return 'Too many tries. Wait a minute, then try again.';
  if (/network-request-failed/.test(code)) return 'Can’t reach the internet right now.';
  if (/popup-closed|cancelled-popup|user-cancelled/.test(code)) return '';
  if (/operation-not-allowed/.test(code)) return 'That way of signing in isn’t turned on for Hive yet.';
  if (/api-key|configuration-not-found|unauthorized-domain|invalid-app/.test(code)) return 'Hive sign-in isn’t set up correctly. Check its Firebase settings in Netlify.';
  return 'Something went wrong. Try again.';
}

export async function signInWithGoogle() {
  const { auth, fa } = await firebase();
  const provider = new fa.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await fa.signInWithPopup(auth, provider);
}

export async function signOut() {
  const { auth, fa } = await firebase();
  await fa.signOut(auth);
}

/**
 * The signed-in Hive user's ID token, for the board's own API to act as them
 * (src/data/api.js). Null when sign-in is off, nobody is signed in, or their
 * email isn't confirmed yet. Waits for a saved sign-in to load first.
 */
export async function idToken() {
  if (!accountsOn) return null;
  try {
    const { auth } = await firebase();
    await auth.authStateReady();
    const u = auth.currentUser;
    return u && u.emailVerified ? await u.getIdToken() : null;
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
  if (!accountsOn) return null;
  const { auth } = await firebase();
  const u = auth.currentUser;
  if (!u) return null;
  const res = await fetch('/api/hive/pass', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await u.getIdToken()}` },
    body: JSON.stringify({ app }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Hive answered ${res.status}`);
  return body.pass;
}
