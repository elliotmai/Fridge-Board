import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Pages that move like a phone's: the track follows the finger, a flick is
 * projected forward to pick the page it lands on, and a spring settles it.
 * Only `transform` changes, written straight to the element each frame, so
 * React doesn't re-render while it moves and a slow wall tablet keeps 60fps.
 *
 * The spring is critically damped (no bounce) when you let go slowly; a hard
 * flick is allowed a few pixels of overshoot, which reads as momentum rather
 * than wobble (Apple, "Designing Fluid Interfaces", WWDC 2018).
 *
 *   const pager = usePager(count);
 *   <div ref={pager.view}><div ref={pager.track}>…pages…</div></div>
 *   pager.begin(); pager.drag(dx); pager.release(vx)   // from your own pointer handling
 *   pager.goTo(n)
 */
const RESPONSE = 0.42; // seconds: how quickly the spring settles
const PROJECT = 0.22; // seconds of flick velocity to project when choosing the page
const RUBBER = 0.32; // how far past the first or last page the track follows the finger
const DRIFT = 0.05; // the wallpaper moves this much of the page movement

export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function usePager(count, { onSettle, wallpaper } = {}) {
  const view = useRef(null);
  const track = useRef(null);
  const st = useRef({ x: 0, v: 0, page: 0, from: 0, raf: 0, w: 0, last: 0 });
  const [page, setPage] = useState(0);
  const countRef = useRef(count);
  countRef.current = count;

  const paint = useCallback((x) => {
    st.current.x = x;
    if (track.current) track.current.style.transform = `translate3d(${x}px, 0, 0)`;
    const wall = wallpaper?.();
    if (wall) wall.style.transform = `translate3d(${x * DRIFT}px, 0, 0)`;
  }, [wallpaper]);

  const stop = () => { cancelAnimationFrame(st.current.raf); st.current.raf = 0; };

  const settle = useCallback((n, v0 = 0) => {
    const s = st.current;
    const p = Math.max(0, Math.min(countRef.current - 1, n));
    const target = -p * s.w;
    stop();
    if (p !== s.page) { s.page = p; setPage(p); }
    if (prefersReducedMotion() || !s.w) { paint(target); s.v = 0; onSettle?.(p); return; }
    const k = (2 * Math.PI / RESPONSE) ** 2;
    const zeta = Math.abs(v0) > 1.4 ? 0.86 : 1;
    const c = 2 * zeta * Math.sqrt(k);
    s.v = v0 * 1000; // px/ms to px/s
    s.last = performance.now();
    const step = (t) => {
      let dt = Math.min(0.064, (t - s.last) / 1000);
      s.last = t;
      let x = s.x;
      // Small fixed steps keep the spring stable whatever the frame rate.
      while (dt > 0) {
        const h = Math.min(dt, 1 / 240);
        const a = -k * (x - target) - c * s.v;
        s.v += a * h; x += s.v * h; dt -= h;
      }
      if (Math.abs(x - target) < 0.4 && Math.abs(s.v) < 8) { paint(target); s.v = 0; s.raf = 0; onSettle?.(p); return; }
      paint(x);
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }, [paint, onSettle]);

  // Keep the page in place when the screen size or the number of pages changes.
  useLayoutEffect(() => {
    const el = view.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const s = st.current;
      s.w = el.clientWidth;
      stop();
      paint(-Math.min(s.page, countRef.current - 1) * s.w);
    });
    ro.observe(el);
    return () => { ro.disconnect(); stop(); };
  }, [paint]);
  useEffect(() => { if (st.current.page > count - 1) settle(count - 1); }, [count, settle]);

  /** A finger starts moving the pages: catch the track wherever it is (interruptible). */
  const begin = useCallback(() => { stop(); st.current.from = st.current.x; }, []);
  const drag = useCallback((dx) => {
    const s = st.current;
    let x = s.from + dx;
    const min = -(countRef.current - 1) * s.w;
    if (x > 0) x *= RUBBER; else if (x < min) x = min + (x - min) * RUBBER;
    paint(x);
  }, [paint]);
  /** Let go with velocity `vx` (px/ms): project it, land on the nearest page, at most one away. */
  const release = useCallback((vx = 0) => {
    const s = st.current;
    if (!s.w) return;
    const projected = s.x + vx * 1000 * PROJECT;
    const n = Math.round(-projected / s.w);
    settle(Math.max(s.page - 1, Math.min(s.page + 1, n)), vx);
  }, [settle]);
  const goTo = useCallback((n) => settle(n), [settle]);
  const current = useCallback(() => st.current.page, []);

  return { view, track, page, begin, drag, release, goTo, current };
}

/** Pointer velocity from the last ~80ms of samples, in px/ms. */
export function velocity(samples) {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let i = samples.length - 2;
  while (i > 0 && last.t - samples[i].t < 80) i--;
  const first = samples[i];
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}
