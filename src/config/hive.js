/**
 * Hive's public setup, shared by the page and the Netlify functions. None of
 * it is secret: the Firebase web config is meant to be in the page (Firebase's
 * security comes from its rules and authorized domains), and the public key
 * only checks passes, it can't make them. Keeping it here means none of it has
 * to be set in Netlify.
 *
 * The one secret, HIVE_SIGNING_KEY (the private half of HIVE_PUBLIC_KEY), is
 * set in Netlify only. Make a new pair with `node scripts/hive-keys.mjs`, put
 * the private half in Netlify and the public half here and in each app.
 */
export const HIVE_FIREBASE = {
  apiKey: 'AIzaSyBi5xLBJVPpGQj2qoNc7tPHB-HE3AIDBAE',
  authDomain: 'hive-aa9c0.firebaseapp.com',
  projectId: 'hive-aa9c0',
  appId: '1:636066329408:web:8b0dc748daab5d1f86c0a5',
};

/** Where Hive lives. Apps only trust messages from here. */
export const HIVE_ORIGIN = 'https://hive.flyingdoublemranch.com';

/** Checks Hive passes (netlify/lib/hiveAssertion.mjs). Apps keep a copy. */
export const HIVE_PUBLIC_KEY = 'MCowBQYDK2VwAyEAD+9fPYhGN9ftY8MGu8oQZdgfSMZL7coC6pZ812weWVE=';
