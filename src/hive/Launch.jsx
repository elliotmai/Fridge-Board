import { useLayoutEffect, useRef } from 'react';

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const OPEN_MS = 240; // home fades out, then the app fades in
const CLOSE_MS = 200;
const REDUCED_MS = 100;

/**
 * Opening and closing an app: a fade through the paper colour. Opening, the
 * home screen fades out, then the app fades in; closing is the reverse.
 *
 * One plain, full-screen veil does the fading (a single layer's opacity, on
 * the compositor). Fading the app or the home screen themselves would make
 * the compositor redraw their whole contents every frame (a framed app, all
 * of Fridge Board), which is what stuttered on the wall display; the veil
 * costs the same whatever is under it. Underneath, at the veil's darkest
 * point, the app is switched on (or off) in one step.
 *
 * The veil runs as one animation from home (0) to app (end): opening plays it
 * forward, closing backward, so turning around mid-way is just a change of
 * direction. The app stays mounted until its fade-out ends.
 *
 *   fade: { id, dir: 'open' | 'close', key }
 *   onSettled(fade)   the fade has finished
 */
export function AppFade({ fade, onSettled }) {
  const veil = useRef(null);
  const st = useRef(null);
  const latest = useRef({ fade, onSettled });
  latest.current = { fade, onSettled };

  useLayoutEffect(() => {
    const app = document.querySelector(`[data-app-view="${CSS.escape(fade.id)}"]`);
    const total = reducedMotion() ? REDUCED_MS : OPEN_MS;
    const s = { app, total, raf: 0, shown: null, anim: null };
    st.current = s;
    app?.classList.add('app-fading');
    // App on (true) once the veil is past its middle, going toward the app.
    const show = (on) => {
      if (s.shown === on || !s.app) return;
      s.shown = on;
      s.app.style.opacity = on ? '' : '0';
    };
    s.show = show;
    s.watch = () => {
      cancelAnimationFrame(s.raf);
      const tick = () => {
        const a = s.anim;
        if (!a) return;
        show(Number(a.currentTime) >= total / 2);
        if (a.playState === 'running') s.raf = requestAnimationFrame(tick);
      };
      tick();
    };
    s.anim = veil.current?.animate(
      [{ opacity: 0, easing: 'cubic-bezier(.4, 0, 1, 1)' }, { opacity: 1, offset: 0.5, easing: 'cubic-bezier(0, 0, .2, 1)' }, { opacity: 0 }],
      { duration: total, fill: 'both' },
    ) || null;
    if (s.anim) {
      s.anim.pause();
      s.anim.onfinish = () => {
        const { fade: f, onSettled: done } = latest.current;
        show(f.dir === 'open');
        done?.(f);
      };
    }
    return () => {
      cancelAnimationFrame(s.raf);
      s.anim?.cancel();
      if (s.app) { s.app.classList.remove('app-fading'); s.app.style.opacity = ''; }
    };
  }, [fade.id]);

  // Each time it's sent one way or the other: play the veil that way from wherever it is.
  useLayoutEffect(() => {
    const s = st.current;
    const a = s?.anim;
    const opening = fade.dir === 'open';
    if (!a) { s?.show(opening); latest.current.onSettled?.(fade); return; }
    const rate = opening ? 1 : -(s.total / (reducedMotion() ? REDUCED_MS : CLOSE_MS));
    // A fresh close starts at the app end; a turnaround carries on from here.
    if (a.playState === 'paused' && Number(a.currentTime) === 0 && !opening) a.currentTime = s.total;
    s.show(Number(a.currentTime) >= s.total / 2);
    a.playbackRate = rate;
    a.play();
    s.watch();
  }, [fade.dir, fade.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="app-veil" ref={veil} aria-hidden="true" />;
}
