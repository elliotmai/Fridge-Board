import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { appLook } from '@/config/catalog';
import { AppIcon } from './Home';
import { whenFrameReady } from './frameReady';

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const COVER_MS = 170; // the home screen fades into the cover
const REVEAL_MS = 200; // the cover fades off the app
const CLOSE_IN_MS = 110; // closing: the cover over the app
const CLOSE_OUT_MS = 170; // then off the home screen
const REDUCED_MS = 60; // each step, with reduced motion
const WAIT_CAP_MS = 1500; // the longest the cover waits for an app to load

/** Marks in the performance timeline, so traces can find each fade. */
const mark = (name) => { try { performance.mark(`hive-fade:${name}`); } catch { /* old browsers */ } };
const settle = () => new Promise((r) => setTimeout(r, 0)).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/**
 * Opening and closing apps, as fades through a plain cover in the paper
 * colour. Nothing heavy happens while anything moves:
 *
 *   open   1. the home screen fades into the cover (opacity only; nothing
 *             else changes, so nothing re-renders)
 *          2. under the opaque cover the app goes on screen (onShow: Hive
 *             makes it the view; a framed app's page starts loading), with
 *             the app's tile and name, still, on the cover
 *          3. once the frame has loaded or said hello (at most 1.5s), and two
 *             more frames have drawn, the cover fades off the app. An app
 *             already loaded this session goes straight to 3.
 *   close  the cover fades over the app; under it Hive goes home (onHide);
 *          two frames later the cover fades off the home screen.
 *   reveal the app already went (the back gesture changed the address):
 *          the cover is put up at once and fades off the home screen.
 *
 * The cover is one plain full-screen layer, so its fade costs the compositor
 * the same whatever is under it. Its state lives here, not in Hive, so
 * starting a fade re-renders nothing but this.
 *
 *   ref: { open(id, path), close(id), reveal(), busy() }
 */
export const AppFades = forwardRef(function AppFades({ custom, onShow, onHide }, ref) {
  const [fade, setFade] = useState(null);
  const busy = useRef(false);
  useImperativeHandle(ref, () => ({
    open: (id, path) => { busy.current = true; setFade({ id, dir: 'open', path, key: Date.now() }); },
    close: (id) => { busy.current = true; setFade((f) => (f?.id === id ? { ...f, dir: 'close', key: Date.now() } : { id, dir: 'close', key: Date.now() })); },
    reveal: () => { busy.current = true; setFade({ id: '', dir: 'reveal', key: Date.now() }); },
    busy: () => busy.current,
  }), []);
  if (!fade) return null;
  return (
    <AppFade key={fade.id || 'reveal'} fade={fade} custom={custom}
      onCovered={(f) => (f.dir === 'open' ? onShow(f.id, f.path) : onHide(f.id))}
      onSettled={(f) => { busy.current = false; setFade((cur) => (cur?.key === f.key ? null : cur)); }} />
  );
});

function AppFade({ fade, custom, onCovered, onSettled }) {
  const veil = useRef(null);
  const st = useRef({ phase: 'idle', anim: null, run: 0, shown: false });
  const latest = useRef({ fade, onCovered, onSettled });
  latest.current = { fade, onCovered, onSettled };

  const ms = (n) => (reducedMotion() ? REDUCED_MS : n);
  const opacityNow = () => (veil.current ? Number(getComputedStyle(veil.current).opacity) : 0);

  /** Fade the cover to `to` from where it is now; false if something newer took over. */
  const veilTo = (to, duration, easing) => {
    const s = st.current;
    const run = ++s.run;
    const from = opacityNow();
    s.anim?.cancel();
    if (!veil.current) return Promise.resolve(true);
    s.anim = veil.current.animate([{ opacity: from }, { opacity: to }], { duration: Math.max(1, duration * Math.abs(to - from)), easing, fill: 'forwards' });
    return s.anim.finished.then(() => run === s.run, () => false);
  };

  useLayoutEffect(() => () => { st.current.run++; st.current.anim?.cancel(); }, []);

  useLayoutEffect(() => {
    const s = st.current;
    const v = veil.current;
    const { fade: f } = latest.current;
    const done = () => latest.current.onSettled?.(latest.current.fade);
    const cover = (on) => {
      const L = latest.current;
      if (on) { s.shown = true; L.onCovered?.({ ...L.fade, dir: 'open' }); } else if (s.shown) { s.shown = false; L.onCovered?.({ ...L.fade, dir: 'close' }); }
    };

    (async () => {
      if (f.dir === 'open') {
        s.phase = 'covering';
        v?.classList.add('with-tile');
        mark('cover');
        if (!(await veilTo(1, ms(COVER_MS), 'cubic-bezier(.4, 0, .2, 1)'))) return;
        s.phase = 'loading';
        const run = s.run;
        cover(true);
        await new Promise((r) => setTimeout(r, 0)); // React puts the app on screen
        if (f.id !== 'board') await whenFrameReady(f.id, WAIT_CAP_MS);
        await settle(); // its first frames draw before the cover moves
        if (run !== s.run) return;
        s.phase = 'revealing';
        mark('reveal');
        if (await veilTo(0, ms(REVEAL_MS), 'cubic-bezier(0, 0, .2, 1)')) { s.phase = 'open'; done(); }
        return;
      }
      if (f.dir === 'reveal') {
        // The app already went: put the cover up before this frame paints, then fade it off the home screen.
        s.anim?.cancel();
        if (v) v.style.opacity = '1';
        mark('close');
        const run = ++s.run;
        await settle();
        if (run !== s.run) return;
        mark('close-out');
      if (await veilTo(0, ms(CLOSE_OUT_MS), 'cubic-bezier(0, 0, .2, 1)')) done();
        return;
      }
      // Closing.
      if (s.phase === 'covering') {
        // Still covering the home screen: the app never went on screen, so just fade back.
        mark('close-out');
      if (await veilTo(0, ms(CLOSE_OUT_MS), 'cubic-bezier(0, 0, .2, 1)')) done();
        return;
      }
      if (s.phase !== 'loading') v?.classList.remove('with-tile'); // still loading: the tile stays
      s.phase = 'closing';
      mark('close');
      if (!(await veilTo(1, ms(CLOSE_IN_MS), 'cubic-bezier(.4, 0, 1, 1)'))) return;
      const run = s.run;
      s.shown = true; // closing an app that was on screen before this fade began
      cover(false);
      await settle(); // Hive has gone home under the cover
      if (run !== s.run) return;
      mark('close-out');
      if (await veilTo(0, ms(CLOSE_OUT_MS), 'cubic-bezier(0, 0, .2, 1)')) done();
    })();
  }, [fade.dir, fade.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const look = fade.id ? appLook(fade.id, custom) : null;
  return (
    <div className="app-veil" ref={veil} aria-hidden="true">
      {look && (
        <div className="app-veil-tile">
          <AppIcon id={fade.id} custom={custom} size={88} />
          <b>{look.name}</b>
        </div>
      )}
    </div>
  );
}
