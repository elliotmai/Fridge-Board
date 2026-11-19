import { useLayoutEffect, useRef } from 'react';
import { appLook } from '@/config/catalog';
import { Fallback, GLYPHS } from './glyphs';

/** Where the app's icon is on screen right now, if it's showing (on this page, or in the dock). */
function iconRect(id, vw, vh) {
  // The app can show in several places (a page, the dock, the App Library):
  // take the copy that's actually on screen.
  for (const el of document.querySelectorAll(`.home-view [data-key="${CSS.escape(id)}"] .icon`)) {
    const r = el.getBoundingClientRect();
    if (r.width && r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh) return r;
  }
  return null;
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The zoom between an icon and its app. Opening grows the icon's tile to fill
 * the screen; closing shrinks the screen back into the icon. `rect` is the
 * icon's box; with none (an app opened from search) it grows from the middle.
 *
 *   anim: { id, rect, dir: 'open' | 'close', key }
 */
export function LaunchLayer({ anim, custom, onDone }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const r = anim.rect || iconRect(anim.id, vw, vh) || { left: vw / 2 - 30, top: vh / 2 - 30, width: 60, height: 60 };
    const sx = r.width / vw, sy = r.height / vh;
    const small = {
      transform: `translate(${r.left}px, ${r.top}px) scale(${sx}, ${sy})`,
      borderRadius: `${(r.width * 0.27) / sx}px / ${(r.height * 0.27) / sy}px`,
    };
    const full = { transform: 'translate(0, 0) scale(1, 1)', borderRadius: '0px / 0px' };
    const glyph = el.firstElementChild;
    const opening = anim.dir === 'open';
    const ease = 'cubic-bezier(.2, .9, .22, 1)';
    const grow = el.animate(opening ? [small, full] : [full, small], { duration: opening ? 380 : 340, easing: ease, fill: 'forwards' });
    glyph?.animate(opening
      ? [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.6)' }]
      : [{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: opening ? 220 : 340, easing: ease, fill: 'forwards' });
    grow.onfinish = () => {
      if (opening) {
        onDone(anim);
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, delay: 60, fill: 'forwards' }).onfinish = () => onDone({ ...anim, cleared: true });
      } else {
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).onfinish = () => onDone({ ...anim, cleared: true });
      }
    };
    return () => grow.cancel();
  }, [anim]); // eslint-disable-line react-hooks/exhaustive-deps

  const look = appLook(anim.id, custom);
  const Glyph = GLYPHS[look.glyph] ?? Fallback;
  return (
    <div className="launch" ref={ref} style={{ '--c': look.color }} aria-hidden="true">
      <span className="launch-glyph"><Glyph /></span>
    </div>
  );
}
