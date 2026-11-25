import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CATALOG, GROUPS, appIds, appLook, folderName, opensInTab } from '@/config/catalog';
import { isWidgetLike, locate, merge, move, pack, placedApps, remove, setPageBreak, setStack, setWidgetSize } from './layout';
import { Fallback, GLYPHS, UI } from './glyphs';
import { columnsFor, iconPx, rowPx } from './look';
import { ContextMenu } from './Menu';
import { prefersReducedMotion, usePager, velocity } from './pager';
import { glance, smartPick } from './smart';
import { StackView } from './Stack';
import { Widget, WIDGETS } from './widgets';

const HOLD_MS = 420; // press and hold: menu (or edit mode on empty space)
const MERGE_MS = 420; // rest on an icon's middle this long to make a folder (or a stack)
const MOVE_MS = 160; // rest beside an icon this long to move there
const PAGE_MS = 520; // rest at the screen edge this long to turn the page
const SLOP = 9; // px of movement that still counts as a tap
const SWIPE = 64; // px down that opens search (or up, the App Library)
const EDGE = 30; // px band at the left and right that turns pages while dragging
const MANUAL_MS = 30 * 60 * 1000; // a stack you turned by hand stays put this long
const SETTLE = { duration: 300, easing: 'cubic-bezier(.2, 0, 0, 1)' }; // things sliding into their new place

const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* not allowed */ } };

/** The coloured tile for one app, with its badge. Also used in folders, menus and the library. */
export function AppIcon({ id, custom, size, badge }) {
  const look = appLook(id, custom);
  const Glyph = GLYPHS[look.glyph] ?? Fallback;
  return (
    <span className="icon" style={{ '--c': look.color, ...(size ? { '--icon': `${size}px` } : {}) }}>
      <Glyph />
      {badge > 0 && <span className="badge" aria-label={`${badge} waiting`}>{badge > 99 ? '99+' : badge}</span>}
    </span>
  );
}

/** "10:42" and "am": the clock's own face (an open zero, read across the kitchen). */
export function clockParts(now) {
  const [, t, ap] = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).match(/^(.*?)\s?([AP]M)?$/i) || [];
  return { t, ap: ap?.toLowerCase() };
}

/**
 * The time and date, large: the first thing read from across the kitchen. On
 * a wall display, tap it for the clock screen. Beside it, the line that says
 * what's next (`line`); on a phone it sits under the date.
 */
function DayClock({ now, onClock, wide, line, lineColor, onLine }) {
  const { t, ap } = clockParts(now);
  const date = now.toLocaleDateString(undefined, wide ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
  const digits = <b className="clock-digits">{t}{ap && <small>{ap}</small>}</b>;
  return (
    <div className="day">
      {onClock
        ? <button className="day-clock" onClick={onClock} aria-label={`${t} ${ap || ''}. Show the clock screen`}>{digits}</button>
        : <div className="day-clock">{digits}</div>}
      <div className="day-sub">
        <span className="day-date">{date}</span>
        {line && (
          <button className="glance" onClick={onLine} aria-label={`${line.text}. Open ${WIDGETS[line.w].label}`}>
            <i aria-hidden="true" style={{ background: lineColor }} />{line.text}
          </button>
        )}
      </div>
    </div>
  );
}

function FolderIcon({ apps, custom, badge }) {
  return (
    <span className="icon folder-icon">
      {apps.slice(0, 9).map((id) => <AppIcon key={id} id={id} custom={custom} />)}
      {badge > 0 && <span className="badge">{badge > 99 ? '99+' : badge}</span>}
    </span>
  );
}

/** Which widget a stack shows: the one you turned to (for a while), else the one that matters now. */
export function stackIndex(item, sel, sig) {
  const m = sel?.[item.key];
  const n = item.widgets.length;
  if (m && (!item.rotate || Date.now() - m.at < MANUAL_MS)) return Math.min(m.i, n - 1);
  return item.rotate ? smartPick(item.widgets, sig) : 0;
}

/**
 * The home screen: pages of icons and widgets that fill the screen exactly
 * (no scrolling; swipe sideways between pages), a dock, page dots with search,
 * and the App Library as the last page.
 *
 * Touch: tap opens (zooming out of the icon). Pages follow the finger and a
 * flick carries to the next one. Press and hold an icon for its menu; keep
 * dragging from there and you're rearranging. Press and hold empty space to
 * start editing. Swipe down to search, up for the App Library. Swipe up or
 * down on a stack to turn it. While editing: drag to move (neighbours slide
 * aside; hold at the edge to change page), rest on an icon to make a folder,
 * rest a widget on a widget to make a stack, minus badges remove.
 * Keyboard: Tab reaches every tile (its page comes into view), Page Up and
 * Page Down turn pages, arrow keys move the focused tile while editing.
 */
export function Home({
  layout, setLayout, data, now, sig, editing, setEditing, look, badges = {}, dark,
  onOpen, onOpenFolder, onAdd, onCustomize, onSearch, onEditIcon, onEditStack, onAddToHome, onSetExternal, onClock, account,
}) {
  const custom = layout.custom || {};
  const [drag, setDrag] = useState(null); // { key, w, h, mergeKey }
  const [menu, setMenu] = useState(null); // { item, zone, rect }
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [stackSel, setStackSel] = useState({}); // stack key → { i, at, dir }
  const press = useRef(null);
  const suppress = useRef(false);
  const homeRef = useRef(null);
  const ghost = useRef(null);
  const dropFrom = useRef(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const icon = iconPx(box.w, look);
  const padX = box.w >= 760 ? 36 : 18;
  const cols = columnsFor(Math.max(0, box.w - padX * 2), look);
  const row = rowPx(icon, look);
  // Only as many rows as truly fit: squeezing in more makes tiles spill into each other.
  const rows = Math.max(1, Math.floor((box.h - 16) / row));
  const pages = useMemo(() => (box.h ? pack(layout.grid, cols, rows) : [[]]), [layout.grid, cols, rows, box.h]);
  const total = pages.length + (look.library ? 1 : 0);
  const pager = usePager(total, { wallpaper: () => homeRef.current?.parentElement?.querySelector('.wallpaper') });
  const pageNo = pager.page;
  // A page that isn't full shares out the spare height (rows up to 1.7x), so a
  // wall display isn't half empty: widgets grow and show more.
  const rowsShown = (pg) => {
    const used = pg.length ? Math.max(...pg.map((c) => c.row + c.h - 1)) : rows;
    return Math.min(rows, Math.max(used, Math.ceil((box.h - 16) / (row * 1.7))));
  };

  // Fit the grid to the screen: measure the pager, then pick columns and rows.
  useLayoutEffect(() => {
    const el = pager.view.current;
    if (!el) return;
    // While an app is open the home screen is hidden (size 0): keep the last
    // size, so its icons are already in place when the app shrinks back into one.
    const ro = new ResizeObserver(([e]) => { if (e.contentRect.width && e.contentRect.height) setBox({ w: e.contentRect.width, h: e.contentRect.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => press.current?.off(), []);
  useEffect(() => {
    const key = (e) => {
      if (!homeRef.current || homeRef.current.closest('.behind, [hidden]')) return; // the home screen isn't showing
      if (document.querySelector('.hive-layer')) return; // a sheet, menu or search is open: Escape is theirs
      if (e.key === 'Escape' && editingRef.current) setEditing(false);
      const inField = e.target.closest?.('input, textarea, select, .hive-layer');
      if (inField) return;
      if (e.key === 'PageDown') { e.preventDefault(); pager.goTo(pager.current() + 1); }
      if (e.key === 'PageUp') { e.preventDefault(); pager.goTo(pager.current() - 1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [setEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------ things sliding into place
  // Neighbours slide aside when an icon moves (FLIP: measure, move, animate the
  // difference with a transform), and a dropped icon settles from where the
  // finger let go.
  const rects = useRef(new Map());
  const measure = () => {
    const out = new Map();
    homeRef.current?.querySelectorAll('.page-grid > [data-key], .dock > [data-key]').forEach((el) => {
      const c = el.closest('.page, .dock');
      const b = c.getBoundingClientRect(), r = el.getBoundingClientRect();
      out.set(el.dataset.key, { x: r.left - b.left, y: r.top - b.top, c: c.dataset.page ?? 'dock', el });
    });
    return out;
  };
  useLayoutEffect(() => {
    const prev = rects.current;
    const next = measure();
    rects.current = next;
    if (!prev.size || prefersReducedMotion()) return;
    next.forEach((n, key) => {
      const o = prev.get(key);
      if (!o || o.c !== n.c || key === drag?.key) return;
      const dx = o.x - n.x, dy = o.y - n.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      n.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], SETTLE);
    });
  }, [layout.grid, layout.dock]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { rects.current = measure(); }, [cols, rows, box.w, box.h, look.labels, look.dock]);
  useLayoutEffect(() => {
    const d = dropFrom.current;
    if (drag || !d) return;
    dropFrom.current = null;
    const el = homeRef.current?.querySelector(`.page-grid > [data-key="${CSS.escape(d.key)}"], .dock > [data-key="${CSS.escape(d.key)}"]`);
    if (!el || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    el.animate([{ transform: `translate(${d.x - r.left}px, ${d.y - r.top}px) scale(1.08)`, zIndex: 5 }, { transform: 'none', zIndex: 5 }], { ...SETTLE, duration: 340 });
  }, [drag]);

  // ------------------------------------------------------------- stacks ----
  const turnStack = (item, dir) => {
    const cur = stackIndex(item, stackSel, sig);
    const n = item.widgets.length;
    setStackSel((s) => ({ ...s, [item.key]: { i: (cur + dir + n) % n, at: Date.now(), dir } }));
    buzz(5);
  };

  // ----------------------------------------------------------- touches ----
  const end = () => {
    const p = press.current;
    if (p) {
      clearTimeout(p.hold); clearTimeout(p.mergeTimer); clearTimeout(p.edgeTimer); p.off();
      if (p.face) p.face.style.transform = '';
    }
    press.current = null;
    setDrag(null);
  };

  /** Where a menu should point: the icon, or the widget card. */
  const rectFor = (el) => (el.querySelector('.icon, .widget') || el).getBoundingClientRect();

  /** Which way a scroller under the finger scrolls, so the page doesn't steal its swipe. */
  const scrollAxis = (t) => (t.closest?.('.w-scroll-x') ? 'x' : t.closest?.('.w-add, input') ? 'both' : t.closest?.('.w-scroll, .w-today, .library-page') ? 'y' : null);

  const onPointerDown = (e, item, zone) => {
    if (e.button && e.button !== 0) return;
    if (item) e.stopPropagation();
    if (press.current) end();
    suppress.current = false;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const mv = (ev) => onPointerMove(ev), up = (ev) => onPointerUp(ev), cancel = (ev) => { if (ev.pointerId === e.pointerId) { if (press.current?.paging) pager.release(0); end(); } };
    window.addEventListener('pointermove', mv, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    press.current = {
      key: item?.key ?? null, item, zone, el, id: e.pointerId, x0: e.clientX, y0: e.clientY, r,
      axis: scrollAxis(e.target), inPager: !!e.target.closest?.('.pager'),
      dragging: false, paging: false, stacking: false, armed: false, mergeKey: null, mergeTimer: null, edgeTimer: null, sig: null, samples: [],
      off: () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); },
      hold: setTimeout(() => {
        const p = press.current;
        if (!p) return;
        suppress.current = true;
        p.armed = true;
        buzz(10);
        if (!item) { setEditing(true); return; }
        if (!editingRef.current) setMenu({ item, zone, rect: rectFor(el) });
      }, HOLD_MS),
    };
  };

  const placeGhost = (p, x, y) => {
    if (ghost.current) ghost.current.style.transform = `translate3d(${x - (p.x0 - p.r.left)}px, ${y - (p.y0 - p.r.top)}px, 0) scale(1.08)`;
  };

  const startDrag = (p, e) => {
    p.dragging = true;
    suppress.current = true;
    clearTimeout(p.hold);
    setMenu(null);
    if (!editingRef.current) setEditing(true);
    setDrag({ key: p.key, w: p.r.width, h: p.r.height, mergeKey: null });
    requestAnimationFrame(() => placeGhost(p, e.clientX, e.clientY));
  };

  const onPointerMove = (e) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
    if (p.paging) {
      if (e.cancelable) e.preventDefault();
      p.samples.push({ x: e.clientX, t: e.timeStamp });
      if (p.samples.length > 8) p.samples.shift();
      pager.drag(dx);
      return;
    }
    if (p.stacking) {
      p.samples.push({ x: e.clientY, t: e.timeStamp });
      if (p.face) p.face.style.transform = `translate3d(0, ${dy * 0.45}px, 0)`;
      return;
    }
    if (!p.dragging) {
      if (Math.hypot(dx, dy) <= SLOP) return;
      if (p.key && p.zone !== 'library' && (editingRef.current || p.armed)) { startDrag(p, e); return; }
      const across = Math.abs(dx) > Math.abs(dy);
      // Inside a list or forecast: moving along it scrolls that, not the page.
      if (p.axis === 'both' || (p.axis === 'x' && across) || (p.axis === 'y' && !across)) { suppress.current = true; end(); return; }
      if (across && p.inPager && !p.armed) {
        clearTimeout(p.hold);
        suppress.current = true;
        p.paging = true;
        pager.begin();
        p.samples = [{ x: e.clientX, t: e.timeStamp }];
        pager.drag(dx);
        return;
      }
      if (!across && p.item?.k === 'stack' && !editingRef.current && !p.armed) {
        clearTimeout(p.hold);
        suppress.current = true;
        p.stacking = true;
        p.face = p.el.querySelector('.stack-face');
        p.samples = [{ x: e.clientY, t: e.timeStamp }];
        return;
      }
      if (!editingRef.current && !p.armed && !across) {
        clearTimeout(p.hold);
        if (dy > SWIPE && look.search) { suppress.current = true; end(); onSearch(); }
        else if (dy < -SWIPE && look.library && p.inPager) { suppress.current = true; end(); pager.goTo(total - 1); }
        return;
      }
      end();
      return;
    }
    if (e.cancelable) e.preventDefault();
    placeGhost(p, e.clientX, e.clientY);
    edgePage(p, e.clientX);
    hover(p, e.clientX, e.clientY);
  };

  /** Hold an icon at the left or right edge to turn the page. */
  const edgePage = (p, x) => {
    const r = pager.view.current?.getBoundingClientRect();
    if (!r) return;
    const dir = x < r.left + EDGE ? -1 : x > r.right - EDGE ? 1 : 0;
    if (dir === p.edgeDir) return;
    p.edgeDir = dir;
    clearTimeout(p.edgeTimer);
    if (!dir) return;
    const turn = () => {
      const next = pager.current() + dir;
      if (next < 0 || next > pages.length - 1) return; // the App Library isn't a place to drop
      pager.goTo(next);
      buzz(6);
      p.edgeTimer = setTimeout(turn, PAGE_MS + 300);
    };
    p.edgeTimer = setTimeout(turn, PAGE_MS);
  };

  /**
   * What's under the finger. Nothing happens until it rests there a moment,
   * so passing over an icon doesn't shove it aside: a short rest reorders, a
   * longer rest on an icon's middle makes a folder (a widget's: a stack).
   */
  const hover = (p, x, y) => {
    const under = document.elementFromPoint(x, y);
    const tile = under?.closest?.('[data-key]');
    const zoneEl = under?.closest?.('[data-zone]');
    const l = layoutRef.current;
    const from = locate(l, p.key);
    if (!from) return;

    let intent = null;
    if (tile && tile.dataset.key !== p.key && tile.dataset.zone) {
      const tk = tile.dataset.key;
      const target = locate(l, tk);
      const r = (tile.querySelector('.icon, .widget') || tile).getBoundingClientRect();
      const widgetish = isWidgetLike(from.item) && target && isWidgetLike(target.item);
      const mx = widgetish ? 0.22 : 0.3, my = widgetish ? 0.24 : 0.32;
      const inMiddle = Math.abs(x - (r.left + r.width / 2)) < r.width * mx && Math.abs(y - (r.top + r.height / 2)) < r.height * my;
      const canMerge = widgetish || (from.item.k === 'app' && target && !target.folder && !isWidgetLike(target.item));
      if (canMerge && inMiddle) intent = { type: 'merge', key: tk, sig: `m:${tk}` };
      else {
        const zone = tile.dataset.zone, i = +tile.dataset.index;
        const index = from.zone === zone && !from.folder ? i : i + (x > r.left + r.width / 2 ? 1 : 0);
        intent = { type: 'move', zone, index, sig: `v:${zone}:${index}` };
      }
    } else if (!tile && zoneEl) {
      const zone = zoneEl.dataset.zone;
      let index;
      if (zone === 'grid') {
        // Empty space on a page: just after that page's last item.
        const last = Number(zoneEl.dataset.last ?? l.grid.length - 1);
        index = from.zone === 'grid' && !from.folder && from.index <= last ? last : last + 1;
      } else index = l[zone].length - (from.zone === zone ? 1 : 0);
      intent = { type: 'move', zone, index, sig: `v:${zone}:end:${index}` };
    }

    if (intent?.sig === p.sig) return;
    p.sig = intent?.sig;
    clearTimeout(p.mergeTimer);
    if (p.mergeKey && intent?.type !== 'merge') { p.mergeKey = null; setDrag((d) => d && { ...d, mergeKey: null }); }
    if (!intent) return;
    p.mergeTimer = setTimeout(() => {
      if (intent.type === 'merge') { p.mergeKey = intent.key; buzz(6); setDrag((d) => d && { ...d, mergeKey: intent.key }); return; }
      const cur = locate(layoutRef.current, p.key);
      if (!(cur.zone === intent.zone && cur.index === intent.index && !cur.folder)) setLayout(move(layoutRef.current, p.key, intent.zone, intent.index));
      p.sig = null;
    }, intent.type === 'merge' ? MERGE_MS : MOVE_MS);
  };

  const onPointerUp = (e) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    if (p.paging) { p.samples.push({ x: e.clientX, t: e.timeStamp }); pager.release(velocity(p.samples)); end(); return; }
    if (p.stacking) {
      const dy = e.clientY - p.y0, v = velocity([...p.samples, { x: e.clientY, t: e.timeStamp }]);
      const item = p.item;
      end();
      if (dy < -32 || v < -0.4) turnStack(item, 1);
      else if (dy > 32 || v > 0.4) turnStack(item, -1);
      return;
    }
    if (p.dragging && p.mergeKey) { setLayout(merge(layoutRef.current, p.key, p.mergeKey, folderName)); buzz(12); }
    else if (p.dragging) {
      buzz(4);
      dropFrom.current = { key: p.key, x: e.clientX - (p.x0 - p.r.left), y: e.clientY - (p.y0 - p.r.top) };
    }
    if (!p.dragging && !p.armed) suppress.current = false; // a plain tap
    end();
  };

  const wheel = useRef({ acc: 0, t: -1e9 });
  const onWheel = (e) => {
    if (drag || menu) return;
    const t = e.target;
    const vertical = Math.abs(e.deltaY) > Math.abs(e.deltaX);
    if (vertical && t.closest?.('.w-scroll, .w-today, .library-page')) return; // it scrolls that list
    if (!vertical && t.closest?.('.w-scroll-x')) return;
    const w = wheel.current;
    const stackEl = vertical && t.closest?.('.tile-stack');
    w.acc += vertical ? e.deltaY : e.deltaX;
    if (Math.abs(w.acc) < 40 || e.timeStamp - w.t < 450) return;
    const dir = Math.sign(w.acc);
    w.acc = 0; w.t = e.timeStamp;
    if (stackEl) {
      const item = locate(layoutRef.current, stackEl.dataset.key)?.item;
      if (item?.k === 'stack') { turnStack(item, dir); return; }
    }
    pager.goTo(pager.current() + dir);
  };
  // Tab onto a tile on another page: bring that page into view.
  const onFocus = (e) => {
    const pg = e.target.closest?.('.page');
    if (pg && Number(pg.dataset.page) !== pager.current()) pager.goTo(Number(pg.dataset.page));
  };

  const openWidget = (w, el, to) => {
    const def = WIDGETS[w];
    const url = to?.url || (!to?.path && def.url);
    if (url) { window.open(url, '_blank', 'noopener'); return; }
    onOpen(def.app, el, to?.path || def.path);
  };

  const activate = (item, el, to) => {
    if (suppress.current) { suppress.current = false; return; }
    if (item.k === 'folder') return onOpenFolder(item.key, el?.querySelector('.icon'));
    if (editing) return;
    // A widget opens the app that owns what it shows, at the right page.
    // `to` is one thing in it: a recipe, a trip, a calendar day.
    if (item.k === 'widget') return openWidget(item.w, el?.querySelector('.widget'), to);
    if (item.k === 'stack') return openWidget(item.widgets[stackIndex(item, stackSel, sig)], el?.querySelector('.widget'), to);
    onOpen(item.key, el?.querySelector('.icon'));
  };

  const onKeyDown = (e, item, zone, index) => {
    if (!editing) return;
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    setLayout(move(layout, item.key, zone, index + step));
    requestAnimationFrame(() => document.querySelector(`[data-key="${CSS.escape(item.key)}"] .tile-btn`)?.focus());
  };

  const label = (item) => (item.k === 'app' ? appLook(item.key, custom).name : item.k === 'folder' ? item.name : item.k === 'stack' ? `${item.widgets.map((w) => WIDGETS[w].label).join(', ')} stack` : WIDGETS[item.w].label);
  const badgeOf = (item) => (!look.badges ? 0 : item.k === 'app' ? badges[item.key] || 0 : item.k === 'folder' ? item.apps.reduce((n, a) => n + (badges[a] || 0), 0) : 0);

  const tile = (item, zone, index, place) => {
    const lifted = drag?.key === item.key;
    const merging = drag?.mergeKey === item.key;
    const isWidget = isWidgetLike(item);
    const onBody = (to) => activate(item, document.querySelector(`.page-grid [data-key="${CSS.escape(item.key)}"]`), to);
    return (
      <div
        key={item.key}
        className={`tile ${isWidget ? `tile-widget size-${item.size}` : ''} ${item.k === 'stack' ? 'tile-stack' : ''} ${lifted ? 'lifted' : ''} ${merging ? 'merging' : ''} ${menu?.item.key === item.key ? 'menu-source' : ''}`}
        style={place}
        data-key={item.key} data-zone={zone} data-index={index}
        onPointerDown={(e) => onPointerDown(e, item, zone)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isWidget ? (
          <div className="tile-btn widget-wrap" tabIndex={editing ? 0 : -1} onKeyDown={(e) => onKeyDown(e, item, zone, index)} aria-label={editing ? label(item) : undefined}
            onClickCapture={(e) => { if (suppress.current || editing) { e.stopPropagation(); suppress.current = false; } }}>
            {item.k === 'stack'
              ? <StackView widgets={item.widgets} index={stackIndex(item, stackSel, sig)} dir={stackSel[item.key]?.dir} size={item.size}
                  data={data} now={now} custom={custom} onOpen={onBody} onTurn={(d) => turnStack(item, d)} />
              : <Widget w={item.w} size={item.size} data={data} now={now} color={appLook(WIDGETS[item.w].app, custom).color} onOpen={onBody} />}
          </div>
        ) : (
          <button className="tile-btn" onClick={(e) => activate(item, e.currentTarget)} onKeyDown={(e) => onKeyDown(e, item, zone, index)}
            aria-label={item.k === 'folder' ? `${item.name} folder, ${item.apps.length} apps` : label(item)}>
            {item.k === 'folder' ? <FolderIcon apps={item.apps} custom={custom} badge={badgeOf(item)} /> : <AppIcon id={item.key} custom={custom} badge={badgeOf(item)} />}
            {zone === 'grid' && look.labels && <span className="tile-name">{label(item)}</span>}
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

  // ------------------------------------------------------------ menus ----
  const menuActions = (m) => {
    const { item, zone } = m;
    const close = () => setMenu(null);
    const editHome = { label: 'Edit home screen', icon: UI.grid, onSelect: () => { close(); setEditing(true); } };
    const at = layout.grid.findIndex((i) => i.key === item.key);
    const pageStart = zone === 'grid' && at > 0 && (layout.grid[at - 1].k === 'break'
      ? [{ label: 'Join the page before', icon: UI.grid, onSelect: () => { close(); setLayout((l) => setPageBreak(l, item.key, false)); } }]
      : [{ label: 'Start a new page here', icon: UI.grid, onSelect: () => { close(); setLayout((l) => setPageBreak(l, item.key, true)); } }]);
    const sizes = isWidgetLike(item) ? [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([s, name]) => ({
      label: name, icon: UI.size, checked: item.size === s, onSelect: () => { close(); setLayout((l) => setWidgetSize(l, item.key, s)); },
    })) : [];
    if (item.k === 'stack') {
      return [
        ...sizes,
        { label: 'Turn by itself', icon: UI.size, checked: item.rotate, onSelect: () => { close(); setLayout((l) => setStack(l, item.key, { rotate: !item.rotate })); } },
        { label: 'Edit stack', icon: UI.palette, onSelect: () => { close(); onEditStack(item.key); } },
        { divider: true },
        editHome, ...pageStart,
        { label: 'Remove stack', icon: UI.minus, danger: true, onSelect: () => { close(); setLayout(remove(layout, item.key)); } },
      ];
    }
    if (item.k === 'widget') {
      return [
        ...sizes,
        { divider: true },
        editHome, ...pageStart,
        { label: 'Remove widget', icon: UI.minus, danger: true, onSelect: () => { close(); setLayout(remove(layout, item.key)); } },
      ];
    }
    if (item.k === 'folder') {
      return [
        { label: 'Open', icon: UI.folder, onSelect: () => { close(); onOpenFolder(item.key, null); } },
        editHome, ...pageStart,
      ];
    }
    const a = CATALOG[item.key] || {};
    const shortcuts = (a.shortcuts || []).map((s) => ({ label: s.label, icon: UI.arrow, onSelect: () => { close(); onOpen(item.key, null, s.path); } }));
    const onHome = placedApps(layout).has(item.key);
    const canFrame = a.url && !a.native && a.frame !== false;
    const inTab = canFrame && opensInTab(item.key, look);
    return [
      ...shortcuts,
      ...(shortcuts.length ? [{ divider: true }] : []),
      ...(canFrame && look.inside !== false ? [{
        label: inTab ? 'Open inside Hive' : 'Open in its own tab', icon: UI.arrow,
        onSelect: () => { close(); onSetExternal(item.key, !inTab); },
      }] : []),
      { label: 'Edit icon', icon: UI.palette, onSelect: () => { close(); onEditIcon(item.key); } },
      ...(zone === 'library'
        ? (onHome ? [] : [{ label: 'Add to home screen', icon: UI.plus, onSelect: () => { close(); onAddToHome(item.key); } }])
        : [editHome, ...pageStart, { label: 'Remove from home screen', icon: UI.minus, danger: true, onSelect: () => { close(); setLayout(remove(layout, item.key)); } }]),
    ];
  };

  const previewOf = (item) => {
    if (item.k === 'stack') {
      const w = item.widgets[stackIndex(item, stackSel, sig)];
      return <Widget w={w} size={item.size} data={data} now={now} color={appLook(WIDGETS[w].app, custom).color} onOpen={() => {}} still />;
    }
    if (item.k === 'widget') return <Widget w={item.w} size={item.size} data={data} now={now} color={appLook(WIDGETS[item.w].app, custom).color} onOpen={() => {}} still />;
    if (item.k === 'folder') return <FolderIcon apps={item.apps} custom={custom} />;
    return <AppIcon id={item.key} custom={custom} badge={badgeOf(item)} />;
  };

  const dragged = drag && locate(layout, drag.key)?.item;
  const wantsSignIn = account?.on && account.ready && !account.user?.verified;
  const line = look.glance !== false && !editing ? glance(sig) : null;
  const wide = box.w >= 600;

  return (
    <div ref={homeRef} className={`home ${editing ? 'editing' : ''} ${drag ? 'dragging' : ''} ${dark ? 'on-dark' : ''} ${look.labels ? '' : 'no-labels'}`}
      style={{ '--icon': `${icon}px`, '--pad-x': `${padX}px` }}>
      <div className="home-bar">
        {editing ? (
          <>
            <button className="pill" onClick={onAdd}><UI.plus />Add</button>
            <button className="pill" onClick={onCustomize}><UI.palette />Customize</button>
            <span className="grow" />
            <button className="pill strong" onClick={() => setEditing(false)}>Done</button>
          </>
        ) : (
          <>
            <DayClock now={now} wide={wide} onClock={box.w >= 760 ? onClock : null}
              line={line} lineColor={line && appLook(WIDGETS[line.w].app, custom).color} onLine={() => openWidget(line.w, null)} />
            <span className="grow" />
            {wantsSignIn && (
              <button className="signin-link signin-pill" onClick={account.open}><i aria-hidden="true" />{account.user ? 'Confirm your email' : 'Sign in'}</button>
            )}
          </>
        )}
      </div>

      <div className="pager" ref={pager.view} onPointerDown={(e) => onPointerDown(e, null, null)} onWheel={onWheel} onFocus={onFocus}>
        <div className="pager-track" ref={pager.track}>
          {pages.map((pg, p) => (
            <section className="page" key={p} data-zone="grid" data-page={p} data-last={pg.length ? Math.max(...pg.map((c) => c.index)) : -1}
              aria-label={`Page ${p + 1} of ${pages.length}`}>
              <div className="page-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rowsShown(pg)}, minmax(0, 1fr))` }}>
                {pg.map((c) => tile(c.item, 'grid', c.index, { gridColumn: `${c.col} / span ${c.w}`, gridRow: `${c.row} / span ${c.h}` }))}
              </div>
            </section>
          ))}
          {look.library && (
            <section className="page library-page" data-page={pages.length} aria-label="App Library">
              <Library layout={layout} custom={custom} badges={look.badges ? badges : {}} onOpen={onOpen}
                onPress={(e, id) => onPointerDown(e, { k: 'app', key: id }, 'library')} suppress={suppress} />
            </section>
          )}
        </div>
      </div>

      <div className="page-indicator">
        <button className="dots-pill" onClick={() => (look.search ? onSearch() : pager.goTo(pageNo + 1))} aria-label={look.search ? 'Search' : 'Next page'}>
          {look.search && <UI.search />}
          {total > 1
            ? Array.from({ length: total }, (_, i) => <i key={i} className={`${i === pageNo ? 'on' : ''} ${look.library && i === total - 1 ? 'lib' : ''}`} />)
            : look.search && <span>Search</span>}
        </button>
      </div>

      {look.dock && (
        <nav className="dock" data-zone="dock" data-page="dock" aria-label="Dock">
          {layout.dock.map((item, i) => tile(item, 'dock', i))}
          {editing && layout.dock.length === 0 && <span className="dock-empty">Drag apps here</span>}
        </nav>
      )}

      {drag && dragged && (
        <div className="drag-ghost" ref={ghost} style={{ width: drag.w, height: drag.h }} aria-hidden="true">
          {isWidgetLike(dragged) ? <div className="drag-ghost-card">{dragged.k === 'stack' ? 'Stack' : WIDGETS[dragged.w].label}</div>
            : dragged.k === 'folder' ? <FolderIcon apps={dragged.apps} custom={custom} /> : <AppIcon id={dragged.key} custom={custom} />}
        </div>
      )}

      {menu && (
        <ContextMenu rect={menu.rect} actions={menuActions(menu)} onClose={() => setMenu(null)}
          title={menu.item.k === 'app' ? appLook(menu.item.key, custom).name : null} preview={previewOf(menu.item)} />
      )}
    </div>
  );
}

/** The last page: every app, grouped, with search. Hold one to add it to the home screen. */
function Library({ layout, custom, badges, onOpen, onPress, suppress }) {
  const [q, setQ] = useState('');
  const onHome = placedApps(layout);
  const name = (id) => appLook(id, custom).name;
  const found = q.trim() ? appIds.filter((id) => name(id).toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => name(a).localeCompare(name(b))) : null;
  const tap = (id, e) => { if (suppress.current) { suppress.current = false; return; } onOpen(id, e.currentTarget.querySelector('.icon')); };
  const cell = (id) => (
    <div className="lib-app" key={id} data-key={id} onPointerDown={(e) => onPress(e, id)} onContextMenu={(e) => e.preventDefault()}>
      <button className="tile-btn" onClick={(e) => tap(id, e)} aria-label={`${name(id)}${onHome.has(id) ? '' : ', not on your home screen'}`}>
        <AppIcon id={id} custom={custom} badge={badges[id]} />
        <span className="tile-name">{name(id)}</span>
      </button>
    </div>
  );
  return (
    <div className="library">
      <label className="lib-search"><UI.search /><input type="search" placeholder="App Library" aria-label="Search the App Library" value={q} onChange={(e) => setQ(e.target.value)} onPointerDown={(e) => e.stopPropagation()} /></label>
      {found ? (
        <div className="lib-list">{found.length ? found.map(cell) : <p className="sheet-note">No app called that.</p>}</div>
      ) : (
        <div className="lib-groups">
          {Object.entries(GROUPS).map(([g, ids]) => {
            const list = ids.filter((id) => CATALOG[id]);
            return list.length ? (
              <div className="lib-group" key={g}>
                <div className="lib-cells">{list.map(cell)}</div>
                <span className="lib-name">{g}</span>
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
