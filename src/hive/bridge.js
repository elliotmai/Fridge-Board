import { markFrameReady } from './frameReady';
import { CATALOG } from '@/config/catalog';
import { passFor } from './account';

/*
 * The conversation between Hive and an app in one of its frames. Messages are
 * plain objects with `type` and `v: 1`.
 *
 *   app → Hive   { type: 'hive:hello' }           "I'm loaded; who's signed in?"
 *   Hive → app   { type: 'hive:pass', pass }      a pass made for that app only
 *   Hive → app   { type: 'hive:signed-out' }      nobody is signed in to Hive
 *   app → Hive   { type: 'hive:close' }           "I'm finished; take me away"
 *                                                  (GalaxyFarm's egg count, once logged)
 *   app → Hive   { type: 'hive:busy', busy }      "someone is using me; don't go back to the
 *                                                  board" (KitchenHub's cook mode; repeated
 *                                                  every minute, busy: false when it ends)
 *
 * Hive answers only a frame it opened, only from that app's own address, and
 * sends the pass only to that address, so another page can't ask for one or
 * read it. The app's server checks the pass before it signs anyone in.
 */
const frameFor = (source) => [...document.querySelectorAll('iframe[data-app]')].find((f) => f.contentWindow === source);
const originOf = (id) => { try { return new URL(CATALOG[id].url).origin; } catch { return null; } };

async function answer(frame, signedIn) {
  const id = frame.dataset.app;
  const origin = originOf(id);
  if (!origin || !frame.contentWindow) return;
  let msg = { type: 'hive:signed-out', v: 1 };
  if (signedIn) {
    try {
      const pass = await passFor(id);
      if (pass) msg = { type: 'hive:pass', v: 1, pass };
    } catch (e) {
      console.warn(`[hive] no pass for ${id}:`, e.message);
      return;
    }
  }
  frame.contentWindow.postMessage(msg, origin);
}

/**
 * Listen for apps saying hello. `isSignedIn()` is true, false, or null while
 * Hive is still loading its session. Returns a function that stops listening.
 */
export function startBridge(isSignedIn) {
  const onMessage = (e) => {
    if (e.data?.type !== 'hive:hello') return;
    const frame = frameFor(e.source);
    if (frame?.dataset.app) markFrameReady(frame.dataset.app); // it's up: the open can reveal it
    if (!frame || e.origin !== originOf(frame.dataset.app)) return;
    const signedIn = isSignedIn();
    if (signedIn === null) return; // still loading: announce() answers every frame once it knows
    answer(frame, signedIn);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/** Tell every open app the Hive sign-in changed. */
export function announce(signedIn) {
  document.querySelectorAll('iframe[data-app]').forEach((f) => answer(f, signedIn));
}

/**
 * Listen for an app asking to be closed. Only a frame Hive opened, only from
 * that app's own address: another page can't close what you're looking at.
 * `onClose(id)` gets the app's id. Returns a function that stops listening.
 */
export function listenForClose(onClose) {
  const onMessage = (e) => {
    if (e.data?.type !== 'hive:close') return;
    const frame = frameFor(e.source);
    if (!frame || e.origin !== originOf(frame.dataset.app)) return;
    onClose(frame.dataset.app);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/**
 * Listen for an app saying it is in use, or no longer. Only a frame Hive
 * opened, only from that app's own address. `onBusy(id, busy)`. Returns a
 * function that stops listening.
 */
export function listenForBusy(onBusy) {
  const onMessage = (e) => {
    if (e.data?.type !== 'hive:busy') return;
    const frame = frameFor(e.source);
    if (!frame || e.origin !== originOf(frame.dataset.app)) return;
    onBusy(frame.dataset.app, e.data.busy !== false);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
