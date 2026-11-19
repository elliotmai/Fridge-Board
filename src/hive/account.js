import { useEffect, useState } from 'react';

/**
 * The Hive account: one Google sign-in, on Hive's own Firebase project, that
 * signs you into every app opened inside Hive (see bridge.js).
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

/** { user, ready }. `user` is { uid, email, name, photo } or null. */
export function useHiveUser() {
  const [state, setState] = useState({ user: null, ready: !accountsOn });
  useEffect(() => {
    if (!accountsOn) return;
    let off = () => {};
    let live = true;
    firebase().then(({ auth, fa }) => {
      if (!live) return;
      off = fa.onAuthStateChanged(auth, (u) => setState({
        ready: true,
        user: u ? { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL } : null,
      }));
    }).catch(() => live && setState({ user: null, ready: true }));
    return () => { live = false; off(); };
  }, []);
  return state;
}

export async function signIn() {
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
