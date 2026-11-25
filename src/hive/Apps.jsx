import { useEffect, useRef, useState } from 'react';
import { CATALOG, GROUPS, appIds, appLook } from '@/config/catalog';
import { useMedia } from '@/hooks/useMedia';
import { Fallback, GLYPHS, UI } from './glyphs';

/** Must match the wall display queries in hive.css (landscape, then portrait). */
const WALL = '(min-width: 1280px) and (min-height: 760px) and (min-aspect-ratio: 4/3), (min-width: 1000px) and (min-height: 1600px) and (orientation: portrait)';

const HOLD_MS = 420; // press and hold: the app's menu
const SLOP = 9; // px of movement that still counts as a press

/** What an app's count means, said out loud. */
const COUNT_WORDS = { board: 'chores left', galaxyfarm: 'chores left', kitchenhub: 'to buy', learnleaf: 'due' };
const countLabel = (id, n) => (n > 0 ? `${n} ${COUNT_WORDS[id] || 'waiting'}` : '');

/** The painted tile for one app: its colour and symbol. Used in the app list, menus, search and sheets. */
export function AppIcon({ id, custom, size }) {
  const look = appLook(id, custom);
  const Glyph = GLYPHS[look.glyph] ?? Fallback;
  return (
    <span className="icon" style={{ '--c': look.color, ...(size ? { '--icon': `${size}px` } : {}) }} aria-hidden="true">
      <Glyph />
    </span>
  );
}

/**
 * Tap opens; press and hold, right-click, Shift+F10 or the menu key opens the
 * app's menu. A hold that turns into a scroll is just a scroll.
 */
function usePress(onOpen, onMenu) {
  const p = useRef(null);
  const fired = useRef(false);
  useEffect(() => () => clearTimeout(p.current?.t), []);
  const cancel = () => { clearTimeout(p.current?.t); p.current = null; };
  return {
    onPointerDown: (e) => {
      if (e.button) return;
      fired.current = false;
      const el = e.currentTarget;
      p.current = { x: e.clientX, y: e.clientY, t: setTimeout(() => { fired.current = true; try { navigator.vibrate?.(10); } catch { /* not allowed */ } onMenu(el); }, HOLD_MS) };
    },
    onPointerMove: (e) => { if (p.current && Math.hypot(e.clientX - p.current.x, e.clientY - p.current.y) > SLOP) cancel(); },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => { e.preventDefault(); cancel(); fired.current = true; onMenu(e.currentTarget); },
    onKeyDown: (e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); onMenu(e.currentTarget); } },
    onClick: (e) => { if (fired.current) { fired.current = false; return; } onOpen(e.currentTarget); },
  };
}

/** One app in the list: its tile, its name, and what's waiting in it. */
export function AppButton({ id, custom, count, onOpen, onMenu, compact }) {
  const name = appLook(id, custom).name;
  const press = usePress((el) => onOpen(id, el.querySelector('.icon')), (el) => onMenu(id, el));
  const missing = !CATALOG[id]?.url && !CATALOG[id]?.native;
  const said = [name, countLabel(id, count), missing && 'not online yet'].filter(Boolean).join(', ');
  return (
    <button className={`app ${compact ? 'compact' : ''}`} data-key={id} aria-label={said} aria-haspopup="menu" {...press}>
      <AppIcon id={id} custom={custom} />
      <span className="app-name">{name}</span>
      {count > 0 && <span className="app-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}

/**
 * Every app, grouped the way the household thinks of them (Farm, Kitchen,
 * Home…), with the pinned ones first. Hidden apps fold away at the end;
 * search still finds them.
 */
export function AppDirectory({ arrangement, counts, onOpen, onMenu }) {
  const { hidden, custom } = arrangement;
  const [showHidden, setShowHidden] = useState(false);
  // A wall display shows every app at once; there,
  // pinned apps stay in their own groups (first in each) instead of a group of their own.
  const wall = useMedia(WALL);
  const pinned = wall ? [] : arrangement.pinned;
  const first = (ids) => (wall ? [...ids].sort((a, b) => Number(arrangement.pinned.includes(b)) - Number(arrangement.pinned.includes(a))) : ids);
  const skip = new Set([...pinned, ...hidden]);
  const grouped = new Set(Object.values(GROUPS).flat());
  const groups = [
    ...(pinned.length ? [['Pinned', pinned]] : []),
    ...Object.entries(GROUPS).map(([g, ids]) => [g, first(ids.filter((id) => CATALOG[id] && !skip.has(id)))]),
    ['Other', appIds.filter((id) => !grouped.has(id) && !skip.has(id))],
  ].filter(([, ids]) => ids.length);
  const hiddenIds = hidden.filter((id) => CATALOG[id]);
  const button = (id) => <li key={id}><AppButton id={id} custom={custom} count={counts[id]} onOpen={onOpen} onMenu={onMenu} /></li>;
  return (
    <nav className="h-apps" aria-label="Apps" id="apps">
      <div className="apps-groups">
        {groups.map(([g, ids]) => (
          <section className={`apps-group ${g === 'Pinned' ? 'is-pinned' : ''}`} key={g} aria-labelledby={`g-${g}`} style={{ '--cols': Math.ceil(ids.length / 3) }}>
            <h2 className="apps-name" id={`g-${g}`}>{g}</h2>
            <ul>{ids.map(button)}</ul>
          </section>
        ))}
        {hiddenIds.length > 0 && (
          <section className="apps-group is-hidden">
            <h2 className="apps-name">
              <button className="apps-more" aria-expanded={showHidden} onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? 'Hidden apps' : `${hiddenIds.length} hidden ${hiddenIds.length === 1 ? 'app' : 'apps'}`}
                <UI.chevron />
              </button>
            </h2>
            {showHidden && <ul>{hiddenIds.map(button)}</ul>}
          </section>
        )}
      </div>
    </nav>
  );
}

/**
 * On a phone: the pinned apps and search, under the thumb, whatever you've
 * scrolled to.
 */
export function PinnedBar({ arrangement, counts, onOpen, onMenu, onSearch }) {
  return (
    <div className="pinbar" role="toolbar" aria-label="Pinned apps and search">
      {arrangement.pinned.map((id) => (
        <AppButton key={id} id={id} custom={arrangement.custom} count={counts[id]} onOpen={onOpen} onMenu={onMenu} compact />
      ))}
      <button className="app compact pinbar-search" onClick={onSearch} aria-label="Search">
        <span className="icon search-tile" aria-hidden="true"><UI.search /></span>
        <span className="app-name">Search</span>
      </button>
    </div>
  );
}
