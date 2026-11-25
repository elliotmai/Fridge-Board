import { useLayoutEffect, useRef } from 'react';
import { appLook } from '@/config/catalog';
import { Fallback, GLYPHS } from './glyphs';

export const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Opening rides a critically damped spring (no bounce), ~450ms. Closing is a
// 500ms decelerating curve: a spring from rest does most of its travel in the
// first 150ms, which read as the app blinking into a tile; this keeps the app
// big and visible early and lands slowly into the icon.
const OPEN_RESPONSE = 0.46;
const CLOSE_MS = 500;
const CLOSE_EASE = [0.33, 0.05, 0.1, 1];
const FADE_MS = 160; // reduced motion: a cross-fade instead
const HOME_SCALE = 0.07; // the home screen sinks back this much while an app grows
// On a wall-sized screen (the fridge: 1920×1080 either way) the home screen
// holds still: sinking and dimming it under the growing app halved the frame
// rate there in testing (Playwright, CPU compositing); the grow alone holds
// 60fps. The app growing out of its icon is the same on every screen.
const SCALE_MAX_PX = 1.4e6;
const HOME_DIM = 0.45;
const GLYPH = 120; // px: the glyph is drawn at this size and scaled

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };

/** CSS cubic-bezier timing, solved for x (Newton, then bisection). */
function bezier([x1, y1, x2, y2]) {
  const f = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  const d = (a, b, t) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const dx = f(x1, x2, t) - x, dd = d(x1, x2, t); if (Math.abs(dx) < 1e-5 || !dd) break; t -= dx / dd; }
    if (t < 0 || t > 1 || Math.abs(f(x1, x2, t) - x) > 1e-3) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { if (f(x1, x2, t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return f(y1, y2, t);
  };
}
const closeCurve = bezier(CLOSE_EASE);

/** An element's box if it's showing on screen right now. */
function onScreen(el, vw, vh) {
  if (!el?.isConnected) return null;
  const r = el.getBoundingClientRect();
  return r.width > 4 && r.left >= -2 && r.right <= vw + 2 && r.top >= -2 && r.bottom <= vh + 2 ? r : null;
}

/** The app's icon on the home screen, wherever it is now: a page, the dock, or its folder's icon. */
function findIcon(keys, vw, vh) {
  for (const key of keys) {
    for (const el of document.querySelectorAll(`.home-view .page-grid > [data-key="${CSS.escape(key)}"] .icon, .home-view .dock > [data-key="${CSS.escape(key)}"] .icon`)) {
      if (onScreen(el, vw, vh)) return el;
    }
  }
  return null;
}

/**
 * The zoom between an icon and its app. The app itself grows out of the
 * icon: from the icon's exact box and corner radius to the full screen, its
 * content scaling up as the box opens, while a copy of the icon (its colour
 * and symbol) on top fades into it. The home screen sinks back and dims
 * behind. Closing runs the same thing backwards, into wherever the icon is
 * now; if it isn't on screen, the app shrinks toward the middle and fades.
 *
 * With an app view, the icon copy goes inside it (one clipped layer, not two
 * stacked: two full-screen clips cost a slow tablet its frame rate). A tab
 * app has no view, so the copy flies on its own.
 *
 * It's one spring on a progress value (0 = icon, 1 = app), so it can be
 * turned around mid-flight: going home while it opens reverses it from where
 * it is. Each frame writes transform, clip-path and opacity straight to the
 * elements; React doesn't re-render while it runs.
 *
 *   zoom: { id, dir: 'open' | 'close', from?: Element, keys: [appKey, folderKey?], tab?: url,
 *           startAt?: 0..1 }   where a close starts (the home bar already shrank the app part way)
 *   onTab(url)    a tab app: called once the grow has filled the screen
 *   onSettled(z)  the zoom has come to rest at its end
 */
export function LaunchLayer({ zoom, custom, onSettled, onTab }) {
  const layer = useRef(null);
  const glyph = useRef(null);
  const scrim = useRef(null);
  const st = useRef(null);
  const latest = useRef({ zoom, onSettled, onTab });
  latest.current = { zoom, onSettled, onTab };

  // Set up once per app: where the icon is, which elements move.
  useLayoutEffect(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const appEl = zoom.tab ? null : document.querySelector(`[data-app-view="${CSS.escape(zoom.id)}"]`);
    const home = document.querySelector('.home-view');
    st.current = { p: zoom.dir === 'open' ? 0 : clamp01(zoom.startAt ?? 1), v: 0, co: zoom.dir === 'open' ? 1 : 0, raf: 0, last: 0, vw, vh, appEl, home, icon: null, r0: null, fade: false, tabbed: false, fadeMode: reducedMotion(), cover: null, coverGlyph: null };
    // Phones and tablets: the home screen sinks back and dims behind the app.
    st.current.behind = vw * vh <= SCALE_MAX_PX;
    if (home && st.current.behind) home.style.willChange = 'transform'; // its own layer while it sinks back, so it isn't repainted each frame
    if (appEl) {
      appEl.classList.add('zooming');
      const cover = document.createElement('div');
      cover.className = 'launch-cover';
      cover.setAttribute('aria-hidden', 'true');
      cover.style.setProperty('--c', appLook(zoom.id, custom).color);
      const g = glyph.current?.cloneNode(true);
      if (g) cover.appendChild(g);
      appEl.appendChild(cover);
      st.current.cover = cover;
      st.current.coverGlyph = g;
    }
    return () => {
      const s = st.current;
      cancelAnimationFrame(s.raf);
      reset(s);
    };
  }, [zoom.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each time it's sent the other way (or first starts): find the icon, and run the spring toward the end.
  useLayoutEffect(() => {
    const s = st.current;
    if (!s) return;
    const target = zoom.dir === 'open' ? 1 : 0;
    // The icon to grow from or shrink into. Measured with the home screen at
    // rest (not sunk back), since that's where it will be when this ends.
    if (s.home) s.home.style.transform = '';
    if (s.icon) s.icon.style.visibility = '';
    const el = zoom.dir === 'open' && onScreen(zoom.from, s.vw, s.vh) ? zoom.from : findIcon(zoom.keys || [zoom.id], s.vw, s.vh) || (onScreen(zoom.from, s.vw, s.vh) ? zoom.from : null);
    s.icon = el;
    const r = el?.getBoundingClientRect();
    const side = Math.min(s.vw, s.vh) * 0.28;
    s.r0 = r ? { x: r.left, y: r.top, w: r.width, h: r.height, rad: Math.min(r.width, r.height) * (el.classList.contains('icon') ? 0.26 : 0.1) }
      : { x: s.vw / 2 - side / 2, y: s.vh / 2 - side / 2, w: side, h: side, rad: side * 0.26 };
    s.fade = !r; // nowhere to go: shrink toward the middle and fade
    // The flying copy looks like the icon it left: its colours, whatever the icon style.
    const tile = el?.classList.contains('icon') ? el : null;
    const cs = tile && getComputedStyle(tile);
    for (const c of [layer.current, s.cover]) {
      if (!c) continue;
      c.style.background = cs?.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '';
      c.style.color = cs?.color || '';
    }
    if (el) el.style.visibility = 'hidden'; // no double while its zoom is in flight
    run(target);
  }, [zoom.dir, zoom.key]); // eslint-disable-line react-hooks/exhaustive-deps

  function paint(p) {
    const s = st.current;
    const q = clamp01(p);
    const { vw, vh, r0 } = s;
    const tab = !!latest.current.zoom.tab;
    if (s.fadeMode) {
      if (s.cover) s.cover.style.opacity = '0';
      if (s.appEl) s.appEl.style.opacity = String(q);
      if (layer.current) layer.current.style.opacity = tab ? String(q) : '0';
      return;
    }
    // The visible box: from the icon to the screen.
    const R = { x: lerp(r0.x, 0, q), y: lerp(r0.y, 0, q), w: lerp(r0.w, vw, q), h: lerp(r0.h, vh, q) };
    const rad = lerp(r0.rad, 0, smooth(0.6, 1, q));
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    if (s.appEl) {
      // The app's content scales up as the box opens (it fits the icon's width at the start).
      const k = lerp(Math.max(r0.w / vw, r0.h / vh), 1, q);
      const tx = cx - (k * vw) / 2, ty = cy - (k * vh) / 2;
      const l = (R.x - tx) / k, t = (R.y - ty) / k;
      s.appEl.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${k})`;
      s.appEl.style.clipPath = `inset(${t}px ${vw - l - R.w / k}px ${vh - t - R.h / k}px ${l}px round ${rad / k}px)`;
      s.appEl.style.opacity = s.fade ? String(smooth(0, 0.5, q)) : '';
      // The icon copy, inside the app: its colour fades into the content as it
      // fills, and back over it only in the last stretch of a close, so the
      // app itself is what you see shrinking. (s.co follows; set in step.)
      if (s.cover) s.cover.style.opacity = String(s.co);
      if (s.coverGlyph) {
        const g = lerp((Math.min(r0.w, r0.h) * 0.52) / GLYPH, Math.min(vw, vh) * 0.3 / GLYPH, q) / k;
        s.coverGlyph.style.transform = `translate3d(${vw / 2 - GLYPH / 2}px, ${vh / 2 - GLYPH / 2}px, 0) scale(${g})`;
      }
    }
    if (layer.current && tab) {
      layer.current.style.clipPath = `inset(${R.y}px ${vw - R.x - R.w}px ${vh - R.y - R.h}px ${R.x}px round ${rad}px)`;
      // The icon's colour and symbol fade into the app as it fills (a tab app has nothing under it: it stays).
      layer.current.style.opacity = s.fade ? String(smooth(0, 0.4, q)) : '1';
    }
    if (glyph.current && tab) {
      const g = lerp((Math.min(r0.w, r0.h) * 0.52) / GLYPH, Math.min(vw, vh) * 0.3 / GLYPH, q);
      glyph.current.style.transform = `translate3d(${cx - GLYPH / 2}px, ${cy - GLYPH / 2}px, 0) scale(${g})`;
    }
    if (scrim.current && s.behind) scrim.current.style.opacity = String(HOME_DIM * q);
  }

  /** How much of the icon's colour covers the app at progress q, going this way. */
  const coverFor = (q, opening) => (opening ? 1 - smooth(0.25, 0.7, q) : 1 - smooth(0.02, 0.36, q));

  function reset(s) {
    s.cover?.remove();
    if (s.appEl) {
      s.appEl.classList.remove('zooming');
      Object.assign(s.appEl.style, { transform: '', clipPath: '', opacity: '' });
    }
    s.homeAnim?.cancel();
    if (s.home) Object.assign(s.home.style, { transform: '', willChange: '' });
    if (s.icon) s.icon.style.visibility = '';
  }

  function run(target) {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    const opening = target === 1;
    // The home screen sinks back on the compositor (a transform animation), from wherever it is now.
    if (s.home && !s.fadeMode && s.behind) {
      const from = s.homeAnim ? getComputedStyle(s.home).transform : 'none';
      s.homeAnim?.cancel();
      s.homeAnim = s.home.animate([{ transform: from === 'none' ? `scale(${1 - HOME_SCALE * clamp01(s.p)})` : from }, { transform: `scale(${1 - HOME_SCALE * target})` }],
        { duration: opening ? OPEN_RESPONSE * 1000 : CLOSE_MS, easing: opening ? 'cubic-bezier(.25, .8, .25, 1)' : `cubic-bezier(${CLOSE_EASE.join(', ')})`, fill: 'forwards' });
    }
    // Closing: a timed curve from wherever it is now (all the way from the app: 500ms).
    const t0 = performance.now(), p0 = s.p, dur = Math.max(220, CLOSE_MS * p0);
    const k = (2 * Math.PI / OPEN_RESPONSE) ** 2;
    const c = 2 * Math.sqrt(k); // critically damped
    s.last = performance.now();
    const step = (now) => {
      let dt = Math.min(0.05, (now - s.last) / 1000);
      const dts = dt;
      s.last = now;
      if (s.fadeMode) {
        s.p += Math.sign(target - s.p) * (dt * 1000) / FADE_MS;
        if ((target === 1 && s.p >= 1) || (target === 0 && s.p <= 0)) s.p = target;
      } else if (!opening) {
        const u = Math.min(1, (now - t0) / dur);
        const next = p0 * (1 - closeCurve(u));
        s.v = dts ? (next - s.p) / dts : 0; // kept, so an open that interrupts carries on smoothly
        s.p = next;
        if (u >= 1) { s.p = 0; s.v = 0; }
      } else {
        while (dt > 0) {
          const h = Math.min(dt, 1 / 240);
          s.v += (-k * (s.p - target) - c * s.v) * h;
          s.p += s.v * h;
          dt -= h;
        }
      }
      // The colour follows its target with a short lag, so turning around mid-way never jumps.
      s.co += (coverFor(clamp01(s.p), opening) - s.co) * (1 - Math.exp(-dts / 0.05));
      const { zoom: z, onTab: tab } = latest.current;
      // A tab app opens once the grow has (nearly) filled the screen, then the tile shrinks home behind it.
      if (z.tab && opening && !s.tabbed && s.p > 0.94) { s.tabbed = true; tab?.(z); }
      if (Math.abs(s.p - target) < 0.002 && Math.abs(s.v) < 0.02) {
        s.p = target; s.v = 0; s.co = opening ? 0 : 1; // lands exactly as the icon (or the app)
        paint(target);
        s.raf = 0;
        latest.current.onSettled?.({ ...z, dir: opening ? 'open' : 'close' });
        return;
      }
      paint(s.p);
      s.raf = requestAnimationFrame(step);
    };
    paint(s.p);
    s.raf = requestAnimationFrame(step);
  }

  const look = appLook(zoom.id, custom);
  const Glyph = GLYPHS[look.glyph] ?? Fallback;
  return (
    <>
      <div className="launch-scrim" ref={scrim} aria-hidden="true" />
      <div className={`launch ${zoom.tab ? '' : 'launch-template'}`} ref={layer} style={{ '--c': look.color }} aria-hidden="true">
        <span className="launch-glyph" ref={glyph}><Glyph /></span>
      </div>
    </>
  );
}
