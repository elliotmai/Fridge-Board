import { useEffect, useState } from 'react';
import { CATALOG, appLook, opensInTab } from '@/config/catalog';
import { AppDirectory, AppIcon, PinnedBar } from './Apps';
import { PIN_MAX, hide, pin, sectionOn, show, unpin } from './arrange';
import { ComingUp, DayHeader, DayLine, Needs, Tonight } from './Day';
import { UI } from './glyphs';
import { ContextMenu } from './Menu';

/**
 * Hive's home screen, built around the household's day rather than a grid
 * of icons: the time and what's next, the day line, what needs someone,
 * tonight's dinner, what's coming up, and every app one tap away.
 *
 * The same page fits a phone (one column, pinned apps under the thumb), a
 * tablet (two columns) and a wall display (three columns, or two in
 * portrait, that never scroll as a page). The layout is CSS only (hive.css).
 *
 * Apps: tap opens (inside Hive, or in its own tab). Press and hold, right-click
 * or Shift+F10 for an app's menu: its shortcuts, open in a tab, pin, hide,
 * edit icon. Typing anywhere starts a search.
 */
export function Home({
  arrangement, setArrangement, data, now, look, counts, dark,
  onOpen, onSearch, onEditIcon, onEditHome, onSettings, onSetExternal, account,
}) {
  const [menu, setMenu] = useState(null); // { id, rect }
  const on = (k) => sectionOn(arrangement, k);
  const custom = arrangement.custom;

  // Type to search: a letter typed anywhere on the home screen opens search with it.
  useEffect(() => {
    const key = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || menu) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"], .hive-layer')) return;
      if (e.key === '/') { e.preventDefault(); onSearch(''); return; }
      if (e.key.length === 1 && /\S/.test(e.key)) { e.preventDefault(); onSearch(e.key); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onSearch, menu]);

  const openMenu = (id, el) => setMenu({ id, rect: (el.querySelector('.icon') || el).getBoundingClientRect() });

  const menuActions = (id) => {
    const a = CATALOG[id] || {};
    const close = () => setMenu(null);
    const run = (f) => () => { close(); f(); };
    const shortcuts = (a.shortcuts || []).map((s) => ({ label: s.label, icon: UI.arrow, onSelect: run(() => onOpen(id, null, s.path)) }));
    const canFrame = a.url && !a.native && a.frame !== false;
    const inTab = canFrame && opensInTab(id, look);
    const pinned = arrangement.pinned.includes(id);
    const hidden = arrangement.hidden.includes(id);
    return [
      ...shortcuts,
      ...(shortcuts.length ? [{ divider: true }] : []),
      ...(canFrame && look.inside !== false ? [{ label: inTab ? 'Open inside Hive' : 'Open in its own tab', icon: UI.arrow, onSelect: run(() => onSetExternal(id, !inTab)) }] : []),
      pinned
        ? { label: 'Unpin', icon: UI.minus, onSelect: run(() => setArrangement((x) => unpin(x, id))) }
        : arrangement.pinned.length < PIN_MAX && { label: 'Pin to the top', icon: UI.plus, onSelect: run(() => setArrangement((x) => pin(x, id))) },
      hidden
        ? { label: 'Show in the app list', icon: UI.plus, onSelect: run(() => setArrangement((x) => show(x, id))) }
        : id !== 'settings' && { label: 'Hide from the app list', icon: UI.minus, onSelect: run(() => setArrangement((x) => hide(x, id))) },
      { label: 'Edit icon', icon: UI.palette, onSelect: run(() => onEditIcon(id)) },
      { divider: true },
      { label: 'Edit home screen', icon: UI.grid, onSelect: run(onEditHome) },
    ].filter(Boolean);
  };

  const ready = !!data;
  return (
    <div className={`home ${dark ? 'on-dark' : ''} ${on('line') ? '' : 'no-line'}`}>
      <DayHeader data={data} now={now} onOpen={onOpen} onSearch={onSearch} account={account} onSettings={onSettings} />
      {ready && on('line') && <DayLine data={data} now={now} onOpen={onOpen} />}

      <main className="day-grid" aria-busy={!ready}>
        {ready ? (
          <>
            <Needs data={data} now={now} on={on} onOpen={onOpen} />
            {on('tonight') && <Tonight data={data} onOpen={onOpen} />}
            {on('ahead') && <ComingUp data={data} now={now} onOpen={onOpen} />}
          </>
        ) : (
          <section className="panel p-needs is-loading"><h2 className="panel-title">Needs someone</h2><p className="h-note">Getting today from the household’s apps</p></section>
        )}
      </main>

      <AppDirectory arrangement={arrangement} counts={look.badges ? counts : {}} onOpen={onOpen} onMenu={openMenu} />
      {arrangement.pinned.length > 0 && (
        <PinnedBar arrangement={arrangement} counts={look.badges ? counts : {}} onOpen={onOpen} onMenu={openMenu} onSearch={() => onSearch('')} />
      )}

      {menu && (
        <ContextMenu rect={menu.rect} actions={menuActions(menu.id)} onClose={() => setMenu(null)}
          title={appLook(menu.id, custom).name} preview={<AppIcon id={menu.id} custom={custom} size={Math.round(menu.rect.width)} />} />
      )}
    </div>
  );
}
