import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CATALOG, GROUPS, appIds, appLook, folderName } from '@/config/catalog';
import { locate, merge, move, pack, placedApps, remove, setWidgetSize } from './layout';
import { Fallback, GLYPHS, UI } from './glyphs';
import { columnsFor, iconPx, rowPx } from './look';
import { ContextMenu } from './Menu';
import { Widget, WIDGETS } from './widgets';

const HOLD_MS = 420; // press and hold: menu (or edit mode on empty space)
const MERGE_MS = 420; // rest on an icon's middle this long to make a folder
const MOVE_MS = 160; // rest beside an icon this long to move there
const PAGE_MS = 520; // rest at the screen edge this long to turn the page
const SLOP = 9; // px of movement that still counts as a tap
const SWIPE = 64; // px down that opens search
const EDGE = 30; // px band at the left and right that turns pages while dragging

const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* not allowed */ } };

/** The coloured tile for one app, with its badge. Also used in folders, menus and the library. */
export function AppIcon({ id, custom, size, badge }) {
  const look = appLook(id, custom);
  const Glyph = GLYPHS[look.glyph] ?? Fallback;
  return (
    <span className="icon" style={{ '--c': look.color, ...(size ? { '--icon': `${size}px` } : {}) }}>
      <Glyph />
      {badge > 0 && <span className="badge" aria-label={`${badge} new`}>{badge > 99 ? '99+' : badge}</span>}
    </span>
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

/**
 * The home screen: pages of icons and widgets that fill the screen exactly
 * (no scrolling; swipe sideways between pages), a dock, page dots with search,
 * and the App Library as the last page.
 *
 * Touch: tap opens (zooming out of the icon). Press and hold an icon for its
 * menu; keep dragging from there and you're rearranging. Press and hold empty
 * space to start editing. Swipe down to search. While editing: drag to move
 * (hold at the edge to change page), rest on an icon to make a folder, minus
 * badges remove. Arrow keys move the focused icon.
 */
export function Home({
  layout, setLayout, data, now, editing, setEditing, look, badges = {}, dark,
  onOpen, onOpenFolder, onAdd, onCustomize, onSearch, onEditIcon, onAddToHome, onSetExternal, account,
}) {
  const custom = layout.custom || {};
  const [drag, setDrag] = useState(null); // { key, x, y, dx, dy, w, h, mergeKey }
  const [menu, setMenu] = useState(null); // { item, zone, rect }
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [pageNo, setPageNo] = useState(0);
  const press = useRef(null);
  const suppress = useRef(false);
  const pager = useRef(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const editingRef = useRef(editing);
  editingRef.current = editing;

  // Fit the grid to the screen: measure the pager, then pick columns and rows.
  useLayoutEffect(() => {
    const el = pager.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const icon = iconPx(box.w, look);
  const padX = box.w >= 760 ? 36 : 18;
  const cols = columnsFor(Math.max(0, box.w - padX * 2), look);
  // Only as many rows as truly fit: squeezing in more makes tiles spill into each other.
  const rows = Math.max(1, Math.floor((box.h - 16) / rowPx(icon, look)));
  const pages = useMemo(() => (box.h ? pack(layout.grid, cols, rows) : [[]]), [layout.grid, cols, rows, box.h]);
  const total = pages.length + (look.library ? 1 : 0);

  const goToPage = (n) => {
    const el = pager.current;
    if (!el) return;
    const p = Math.max(0, Math.min(total - 1, n));
    el.scrollTo({ left: p * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const onScroll = () => {
    const el = pager.current;
    if (el?.clientWidth) setPageNo(Math.round(el.scrollLeft / el.clientWidth));
  };
  // Keep the page in view if pages disappear (an icon moved off the last one).
  useEffect(() => { if (pageNo > total - 1) goToPage(total - 1); }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => press.current?.off(), []);
  useEffect(() => {
    if (!editing) return;
    const esc = (e) => { if (e.key === 'Escape') setEditing(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [editing, setEditing]);

  const end = () => {
    const p = press.current;
    if (p) { clearTimeout(p.hold); clearTimeout(p.mergeTimer); clearTimeout(p.edgeTimer); p.off(); }
    press.current = null;
    setDrag(null);
  };

  /** Where a menu should point: the icon, or the widget card. */
  const rectFor = (el) => (el.querySelector('.icon, .widget') || el).getBoundingClientRect();

  const onPointerDown = (e, item, zone) => {
    if (e.button && e.button !== 0) return;
    if (item) e.stopPropagation();
    if (press.current) end();
    suppress.current = false;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const mv = (ev) => onPointerMove(ev), up = (ev) => onPointerUp(ev), cancel = (ev) => { if (ev.pointerId === e.pointerId) end(); };
    window.addEventListener('pointermove', mv, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    press.current = {
      key: item?.key ?? null, item, zone, el, id: e.pointerId, x0: e.clientX, y0: e.clientY, r,
      dragging: false, armed: false, mergeKey: null, mergeTimer: null, edgeTimer: null, sig: null,
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

  const startDrag = (p, e) => {
    p.dragging = true;
    suppress.current = true;
    clearTimeout(p.hold);
    setMenu(null);
    if (!editingRef.current) setEditing(true);
    setDrag({ key: p.key, x: e.clientX, y: e.clientY, dx: p.x0 - p.r.left, dy: p.y0 - p.r.top, w: p.r.width, h: p.r.height, mergeKey: null });
  };

  const onPointerMove = (e) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
    if (!p.dragging) {
      if (Math.hypot(dx, dy) <= SLOP) return;
      if (p.key && p.zone !== 'library' && (editingRef.current || p.armed)) { startDrag(p, e); return; }
      // Swipe down (not sideways, not while editing) opens search.
      if (!editingRef.current && !p.armed && look.search && dy > 0 && Math.abs(dx) < dy * 0.7) {
        clearTimeout(p.hold);
        if (dy > SWIPE) { suppress.current = true; end(); onSearch(); }
        return;
      }
      end(); // a page swipe; the pager scrolls by itself
      return;
    }
    if (e.cancelable) e.preventDefault();
    setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY });
    edgePage(p, e.clientX);
    hover(p, e.clientX, e.clientY);
  };

  /** Hold an icon at the left or right edge to turn the page. */
  const edgePage = (p, x) => {
    const r = pager.current?.getBoundingClientRect();
    if (!r) return;
    const dir = x < r.left + EDGE ? -1 : x > r.right - EDGE ? 1 : 0;
    if (dir === p.edgeDir) return;
    p.edgeDir = dir;
    clearTimeout(p.edgeTimer);
    if (!dir) return;
    const turn = () => {
      const el = pager.current;
      const cur = el ? Math.round(el.scrollLeft / el.clientWidth) : 0;
      const next = cur + dir;
      if (next < 0 || next > pages.length - 1 + (dir > 0 ? 0 : 0)) return;
      goToPage(next);
      buzz(6);
      p.edgeTimer = setTimeout(turn, PAGE_MS + 300);
    };
    p.edgeTimer = setTimeout(turn, PAGE_MS);
  };

  /**
   * What's under the finger. Nothing happens until it rests there a moment,
   * so passing over an icon doesn't shove it aside: a short rest reorders, a
   * longer rest on an icon's middle makes a folder.
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
      const inMiddle = Math.abs(x - (r.left + r.width / 2)) < r.width * 0.3 && Math.abs(y - (r.top + r.height / 2)) < r.height * 0.32;
      const canMerge = from.item.k === 'app' && target && !target.folder && target.item.k !== 'widget';
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
    if (p.dragging && p.mergeKey) { setLayout(merge(layoutRef.current, p.key, p.mergeKey, folderName)); buzz(12); }
    else if (p.dragging) buzz(4);
    if (!p.dragging && !p.armed) suppress.current = false; // a plain tap
    end();
  };

  const activate = (item, el) => {
    if (suppress.current) { suppress.current = false; return; }
    if (item.k === 'folder') return onOpenFolder(item.key, el?.querySelector('.icon'));
    if (editing) return;
    if (item.k === 'widget') {
      // A widget opens the app that owns what it shows, at the right page.
      const def = WIDGETS[item.w];
      if (def.url) { window.open(def.url, '_blank', 'noopener'); return; }
      return onOpen(def.app, el?.querySelector('.widget'), def.path);
    }
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

  const label = (item) => (item.k === 'app' ? appLook(item.key, custom).name : item.k === 'folder' ? item.name : WIDGETS[item.w].label);
  const badgeOf = (item) => (!look.badges ? 0 : item.k === 'app' ? badges[item.key] || 0 : item.k === 'folder' ? item.apps.reduce((n, a) => n + (badges[a] || 0), 0) : 0);

  const tile = (item, zone, index, place) => {
    const lifted = drag?.key === item.key;
    const merging = drag?.mergeKey === item.key;
    const isWidget = item.k === 'widget';
    return (
      <div
        key={item.key}
        className={`tile ${isWidget ? `tile-widget size-${item.size}` : ''} ${lifted ? 'lifted' : ''} ${merging ? 'merging' : ''} ${menu?.item.key === item.key ? 'menu-source' : ''}`}
        style={place}
        data-key={item.key} data-zone={zone} data-index={index}
        onPointerDown={(e) => onPointerDown(e, item, zone)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isWidget ? (
          <div className="tile-btn widget-wrap" tabIndex={editing ? 0 : -1} onKeyDown={(e) => onKeyDown(e, item, zone, index)}
            onClickCapture={(e) => { if (suppress.current || editing) { e.stopPropagation(); suppress.current = false; } }}>
            <Widget w={item.w} size={item.size} data={data} now={now} color={appLook(WIDGETS[item.w].app, custom).color}
              onOpen={() => activate(item, document.querySelector(`.page-grid [data-key="${CSS.escape(item.key)}"]`))} />
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
    const editHome = { label: 'Edit Home Screen', icon: UI.grid, onSelect: () => { close(); setEditing(true); } };
    if (item.k === 'widget') {
      return [
        { label: 'Small', icon: UI.size, checked: item.size === 's', onSelect: () => { close(); setLayout((l) => setWidgetSize(l, item.key, 's')); } },
        { label: 'Medium', icon: UI.size, checked: item.size === 'm', onSelect: () => { close(); setLayout((l) => setWidgetSize(l, item.key, 'm')); } },
        { label: 'Large', icon: UI.size, checked: item.size === 'l', onSelect: () => { close(); setLayout((l) => setWidgetSize(l, item.key, 'l')); } },
        { divider: true },
        editHome,
        { label: 'Remove Widget', icon: UI.minus, danger: true, onSelect: () => { close(); setLayout(remove(layout, item.key)); } },
      ];
    }
    if (item.k === 'folder') {
      return [
        { label: 'Open', icon: UI.folder, onSelect: () => { close(); onOpenFolder(item.key, null); } },
        editHome,
      ];
    }
    const a = CATALOG[item.key] || {};
    const shortcuts = (a.shortcuts || []).map((s) => ({ label: s.label, icon: UI.arrow, onSelect: () => { close(); onOpen(item.key, null, s.path); } }));
    const onHome = placedApps(layout).has(item.key);
    const canFrame = a.url && !a.native && a.frame !== false;
    const inTab = canFrame && (look.inside === false || look.external?.[item.key]);
    return [
      ...shortcuts,
      ...(shortcuts.length ? [{ divider: true }] : []),
      ...(canFrame && look.inside !== false ? [{
        label: inTab ? 'Open Inside Hive' : 'Open in Its Own Tab', icon: UI.arrow,
        onSelect: () => { close(); onSetExternal(item.key, !inTab); },
      }] : []),
      { label: 'Edit Icon', icon: UI.palette, onSelect: () => { close(); onEditIcon(item.key); } },
      ...(zone === 'library'
        ? (onHome ? [] : [{ label: 'Add to Home Screen', icon: UI.plus, onSelect: () => { close(); onAddToHome(item.key); } }])
        : [editHome, { label: 'Remove from Home Screen', icon: UI.minus, danger: true, onSelect: () => { close(); setLayout(remove(layout, item.key)); } }]),
    ];
  };

  const dragged = drag && locate(layout, drag.key)?.item;
  const wantsSignIn = account?.on && account.ready && !account.user?.verified;

  return (
    <div className={`home ${editing ? 'editing' : ''} ${drag ? 'dragging' : ''} ${dark ? 'on-dark' : ''} ${look.labels ? '' : 'no-labels'}`}
      style={{ '--icon': `${icon}px`, '--pad-x': `${padX}px` }}>
      <div className="home-bar">
        {editing ? (
          <>
            <button className="pill" onClick={onAdd}><UI.plus />Add</button>
            <button className="pill" onClick={onCustomize}><UI.palette />Customize</button>
            <span className="grow" />
            <button className="pill strong" onClick={() => setEditing(false)}>Done</button>
          </>
        ) : wantsSignIn ? (
          <button className="pill ghost signin-pill" onClick={account.open}>{account.user ? 'Confirm your email' : 'Sign in to Hive'}</button>
        ) : null}
      </div>

      <div className="pager" ref={pager} onScroll={onScroll} onPointerDown={(e) => onPointerDown(e, null, null)}>
        {pages.map((pg, p) => (
          <section className="page" key={p} data-zone="grid" data-page={p} data-last={pg.length ? Math.max(...pg.map((c) => c.index)) : -1}
            aria-label={`Page ${p + 1} of ${pages.length}`}>
            <div className="page-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
              {pg.map((c) => tile(c.item, 'grid', c.index, { gridColumn: `${c.col} / span ${c.w}`, gridRow: `${c.row} / span ${c.h}` }))}
            </div>
          </section>
        ))}
        {look.library && (
          <section className="page library-page" aria-label="App Library">
            <Library layout={layout} custom={custom} badges={look.badges ? badges : {}} onOpen={onOpen}
              onPress={(e, id) => onPointerDown(e, { k: 'app', key: id }, 'library')} suppress={suppress} />
          </section>
        )}
      </div>

      <div className="page-indicator">
        <button className="dots-pill" onClick={() => (look.search ? onSearch() : goToPage(pageNo + 1))} aria-label={look.search ? 'Search' : 'Next page'}>
          {look.search && <UI.search />}
          {total > 1
            ? Array.from({ length: total }, (_, i) => <i key={i} className={`${i === pageNo ? 'on' : ''} ${look.library && i === total - 1 ? 'lib' : ''}`} />)
            : look.search && <span>Search</span>}
        </button>
      </div>

      {look.dock && (
        <nav className="dock" data-zone="dock" aria-label="Dock">
          {layout.dock.map((item, i) => tile(item, 'dock', i))}
          {editing && layout.dock.length === 0 && <span className="dock-empty">Drag apps here</span>}
        </nav>
      )}

      {drag && dragged && (
        <div className="drag-ghost" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w, height: drag.h }} aria-hidden="true">
          {dragged.k === 'widget' ? <div className="drag-ghost-card">{WIDGETS[dragged.w].label}</div>
            : dragged.k === 'folder' ? <FolderIcon apps={dragged.apps} custom={custom} /> : <AppIcon id={dragged.key} custom={custom} />}
        </div>
      )}

      {menu && (
        <ContextMenu rect={menu.rect} actions={menuActions(menu)} onClose={() => setMenu(null)}
          title={menu.item.k === 'app' ? appLook(menu.item.key, custom).name : null}
          preview={menu.item.k === 'widget'
            ? <Widget w={menu.item.w} size={menu.item.size} data={data} now={now} color={appLook(WIDGETS[menu.item.w].app, custom).color} onOpen={() => {}} />
            : menu.item.k === 'folder' ? <FolderIcon apps={menu.item.apps} custom={custom} /> : <AppIcon id={menu.item.key} custom={custom} badge={badgeOf(menu.item)} />} />
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
      <label className="lib-search"><UI.search /><input type="search" placeholder="App Library" value={q} onChange={(e) => setQ(e.target.value)} onPointerDown={(e) => e.stopPropagation()} /></label>
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
