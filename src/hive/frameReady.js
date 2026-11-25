/**
 * Which app frames have finished loading this session, so opening an app can
 * wait (behind its cover) until it's ready, and skip the wait next time.
 * A frame is ready when its iframe fires `load`, or when the app says hello
 * (bridge.js, `hive:hello`), whichever comes first.
 */
const ready = new Set();
const EVENT = 'hive:frame-ready';

export function markFrameReady(id) {
  ready.add(id);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/** A frame was reloaded or replaced: it isn't ready until it loads again. */
export const forgetFrame = (id) => ready.delete(id);

export const isFrameReady = (id) => ready.has(id);

/** Resolves when `id` is ready, or after `cap` ms, whichever is first. */
export function whenFrameReady(id, cap = 1500) {
  if (ready.has(id)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok) => { clearTimeout(timer); window.removeEventListener(EVENT, on); resolve(ok); };
    const on = (e) => { if (e.detail === id) done(true); };
    const timer = setTimeout(() => done(false), cap);
    window.addEventListener(EVENT, on);
  });
}
