import { useEffect, useRef, useState } from 'react';
import { CATALOG, folderName } from '@/config/catalog';
import { locate, merge, move, remove } from './layout';
import { Fallback, GLYPHS } from './glyphs';
import { Widget, WIDGETS } from './widgets';

const HOLD_MS = 450; // long press to start editing
const MERGE_MS = 420; // rest on an icon's middle this long to make a folder
const MOVE_MS = 160; // rest beside an icon this long to move there
const SLOP = 9; // px of movement that still counts as a tap
const EDGE = 28; // px band at the top and bottom of the grid that scrolls while dragging

/** The coloured tile for one app. Also used inside folders and the Add sheet. */
export function AppIcon({ id, size }) {
  const a = CATALOG[id];
  const Glyph = GLYPHS[a?.glyph] ?? Fallback;
  return <span className="icon" style={{ '--c': a?.color ?? '#777', ...(size ? { '--icon': `${size}px` } : {}) }}><Glyph /></span>;
}

function FolderIcon({ apps }) {
  return (
    <span className="icon folder-icon">
      {apps.slice(0, 4).map((id) => <AppIcon key={id} id={id} />)}
    </span>
  );
}

/**
 * Grid + dock. Tap opens; press and hold anywhere turns on editing, where icons
 * can be dragged to reorder, dropped on each other to make a folder, or taken
 * off with the minus badge. Arrow keys move the focused icon while editing.
 */
export function Home({ layout, setLayout, data, now, editing, setEditing, onOpen, onOpenFolder, onAdd, onSettings }) {
  const [drag, setDrag] = useState(null); // { key, x, y, dx, dy, w, h, mergeKey }
  const press = useRef(null);
  const suppress = useRef(false);
  const scroller = useRef(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => () => press.current?.off(), []);

  // Leave editing with Escape.
  useEffect(() => {
    if (!editing) return;
    const esc = (e) => { if (e.key === 'Escape') setEditing(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [editing, setEditing]);

  const editingRef = useRef(editing);
  editingRef.current = editing;

  const end = () => {
    const p = press.current;
    if (p) { clearTimeout(p.hold); clearTimeout(p.mergeTimer); cancelAnimationFrame(p.raf); p.off(); }
    press.current = null;
    setDrag(null);
  };

  const onPointerDown = (e, item) => {
    if (e.button && e.button !== 0) return;
    if (press.current) end();
    suppress.current = false;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    // Listen on the window: the icon can remount mid-drag when it changes zone.
    const mv = (ev) => onPointerMove(ev), up = (ev) => onPointerUp(ev), cancel = (ev) => { if (ev.pointerId === e.pointerId) end(); };
    window.addEventListener('pointermove', mv, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    press.current = {
      key: item.key, id: e.pointerId, x0: e.clientX, y0: e.clientY, r,
      dragging: false, mergeKey: null, mergeTimer: null, sig: null, armed: false,
      off: () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); },
      hold: setTimeout(() => {
        if (!press.current) return;
        suppress.current = true;
        if (!editingRef.current) { setEditing(true); navigator.vibrate?.(10); }
        press.current.armed = true;
      }, HOLD_MS),
    };
  };

  const startDrag = (p, e) => {
    p.dragging = true;
    suppress.current = true;
    clearTimeout(p.hold);
    setDrag({ key: p.key, x: e.clientX, y: e.clientY, dx: p.x0 - p.r.left, dy: p.y0 - p.r.top, w: p.r.width, h: p.r.height, mergeKey: null });
  };

  const onPointerMove = (e) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    const moved = Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > SLOP;
    if (!p.dragging) {
      if (!moved) return;
      if (editingRef.current || p.armed) startDrag(p, e);
      else end(); // it's a scroll
      return;
    }
    if (e.cancelable) e.preventDefault();
    setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY });
    autoScroll(p, e.clientX, e.clientY);
    hover(p, e.clientX, e.clientY);
  };

  /** Near the top or bottom edge, scroll steadily while the finger stays there. */
  const autoScroll = (p, x, y) => {
    p.x = x; p.y = y;
    if (p.raf) return;
    const step = () => {
      const sc = scroller.current;
      if (!press.current || press.current !== p || !p.dragging || !sc) { p.raf = null; return; }
      const r = sc.getBoundingClientRect();
      const v = p.y < r.top + EDGE ? -1 : p.y > r.bottom - EDGE ? 1 : 0;
      if (!v) { p.raf = null; return; }
      const before = sc.scrollTop;
      sc.scrollTop += v * 7;
      if (sc.scrollTop !== before) hover(p, p.x, p.y);
      p.raf = requestAnimationFrame(step);
    };
    const sc = scroller.current?.getBoundingClientRect();
    if (sc && (y < sc.top + EDGE || y > sc.bottom - EDGE)) p.raf = requestAnimationFrame(step);
  };

  /**
   * Work out what's under the finger. Nothing happens until it rests there a
   * moment, so passing over an icon doesn't shove it aside: a short rest
   * reorders, a longer rest on an icon's middle makes a folder.
   */
  const hover = (p, x, y) => {
    const under = document.elementFromPoint(x, y);
    const tile = under?.closest?.('[data-key]');
    const zoneEl = under?.closest?.('[data-zone]');
    const l = layoutRef.current;
    const from = locate(l, p.key);
    if (!from) return;

    let intent = null;
    if (tile && tile.dataset.key !== p.key) {
      const tk = tile.dataset.key;
      const target = locate(l, tk);
      const r = tile.getBoundingClientRect();
      const iconH = Math.min(r.height, r.width);
      const inMiddle = Math.abs(x - (r.left + r.width / 2)) < r.width * 0.28 && y > r.top + iconH * 0.15 && y < r.top + iconH * 0.85;
      const canMerge = from.item.k === 'app' && target && !target.folder && target.item.k !== 'widget';
      if (canMerge && inMiddle) intent = { type: 'merge', key: tk, sig: `m:${tk}` };
      else {
        const zone = tile.dataset.zone, i = +tile.dataset.index;
        const index = from.zone === zone && !from.folder ? i : i + (x > r.left + r.width / 2 ? 1 : 0);
        intent = { type: 'move', zone, index, sig: `v:${zone}:${index}` };
      }
    } else if (!tile && zoneEl) {
      const zone = zoneEl.dataset.zone;
      intent = { type: 'move', zone, index: l[zone].length - (from.zone === zone ? 1 : 0), sig: `v:${zone}:end` };
    }

    if (intent?.sig === p.sig) return;
    p.sig = intent?.sig;
    clearTimeout(p.mergeTimer);
    if (p.mergeKey && intent?.type !== 'merge') { p.mergeKey = null; setDrag((d) => d && { ...d, mergeKey: null }); }
    if (!intent) return;
    p.mergeTimer = setTimeout(() => {
      if (intent.type === 'merge') { p.mergeKey = intent.key; setDrag((d) => d && { ...d, mergeKey: intent.key }); return; }
      const now = locate(layoutRef.current, p.key);
      if (!(now.zone === intent.zone && now.index === intent.index && !now.folder)) setLayout(move(layoutRef.current, p.key, intent.zone, intent.index));
      p.sig = null; // after the shuffle, whatever is under the finger is a fresh target
    }, intent.type === 'merge' ? MERGE_MS : MOVE_MS);
  };

  const onPointerUp = (e) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    if (p.dragging && p.mergeKey) setLayout(merge(layoutRef.current, p.key, p.mergeKey, folderName));
    if (!p.dragging && !p.armed) suppress.current = false; // a plain tap
    end();
  };

  const activate = (item) => {
    if (suppress.current) { suppress.current = false; return; }
    if (item.k === 'folder') return onOpenFolder(item.key);
    if (editing) return;
    onOpen(item.k === 'widget' ? WIDGETS[item.w].app : item.key);
  };

  const onKeyDown = (e, item, zone, index) => {
    if (!editing) return;
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    setLayout(move(layout, item.key, zone, index + step));
    requestAnimationFrame(() => document.querySelector(`[data-key="${CSS.escape(item.key)}"] .tile-btn`)?.focus());
  };

  const label = (item) => (item.k === 'app' ? CATALOG[item.key]?.name : item.k === 'folder' ? item.name : WIDGETS[item.w].label);

  const tile = (item, zone, index) => {
    const lifted = drag?.key === item.key;
    const merging = drag?.mergeKey === item.key;
    const isWidget = item.k === 'widget';
    return (
      <div
        key={item.key}
        className={`tile ${isWidget ? `tile-widget ${WIDGETS[item.w].size}` : ''} ${lifted ? 'lifted' : ''} ${merging ? 'merging' : ''}`}
        data-key={item.key} data-zone={zone} data-index={index}
        onPointerDown={(e) => onPointerDown(e, item)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isWidget ? (
          <div className="tile-btn widget-wrap" tabIndex={editing ? 0 : -1} onKeyDown={(e) => onKeyDown(e, item, zone, index)} onClickCapture={(e) => { if (suppress.current || editing) { e.stopPropagation(); suppress.current = false; } }}>
            <Widget w={item.w} data={data} now={now} color={CATALOG[WIDGETS[item.w].app]?.color} onOpen={(app) => activate({ k: 'app', key: app })} />
          </div>
        ) : (
          <button className="tile-btn" onClick={() => activate(item)} onKeyDown={(e) => onKeyDown(e, item, zone, index)}
            aria-label={item.k === 'folder' ? `${item.name} folder, ${item.apps.length} apps` : label(item)}>
            {item.k === 'folder' ? <FolderIcon apps={item.apps} /> : <AppIcon id={item.key} />}
            {zone === 'grid' && <span className="tile-name">{label(item)}</span>}
          </button>
        )}
        {editing && item.k !== 'folder' && (
          <button className="badge-remove" aria-label={`Remove ${label(item)} from the home screen`}
            onPointerDown={(e) => e.stopPropagation()} onClick={() => setLayout(remove(layout, item.key))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12h10" /></svg>
          </button>
        )}
      </div>
    );
  };

  const dragged = drag && locate(layout, drag.key)?.item;

  return (
    <div className={`home ${editing ? 'editing' : ''} ${drag ? 'dragging' : ''}`}>
      <div className="home-bar">
        {editing ? (
          <>
            <button className="pill" onClick={onAdd}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add</button>
            <span className="home-hint">Drag to move. Drop one app on another to make a folder.</span>
            <button className="pill strong" onClick={() => setEditing(false)}>Done</button>
          </>
        ) : (
          <>
            <button className="pill ghost" onClick={() => setEditing(true)}>Edit</button>
            <button className="pill ghost round-pill" aria-label="Hive settings" onClick={onSettings}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
            </button>
          </>
        )}
      </div>
      <div className="home-scroll" ref={scroller}>
        <div className="grid" data-zone="grid">{layout.grid.map((item, i) => tile(item, 'grid', i))}</div>
      </div>
      <nav className="dock" data-zone="dock" aria-label="Dock">
        {layout.dock.map((item, i) => tile(item, 'dock', i))}
        {editing && layout.dock.length === 0 && <span className="dock-empty">Drag apps here</span>}
      </nav>
      {drag && dragged && (
        <div className="drag-ghost" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w, height: drag.h }} aria-hidden="true">
          {dragged.k === 'widget' ? <div className="drag-ghost-card">{WIDGETS[dragged.w].label}</div>
            : dragged.k === 'folder' ? <FolderIcon apps={dragged.apps} /> : <AppIcon id={dragged.key} />}
        </div>
      )}
    </div>
  );
}
