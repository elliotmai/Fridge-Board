import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@/components/board/Board';
import { Footer } from '@/components/Footer';
import { PullToRefresh } from '@/components/PullToRefresh';
import { APP_KEY } from '@/config/app';
import { CATALOG, appIds } from '@/config/catalog';
import { useIsPhone } from '@/hooks/useMedia';
import { useStored } from '@/hooks/useStored';
import { useTick } from '@/hooks/useTick';
import { accountsOn, useHiveUser } from './account';
import { AccountSheet } from './AccountSheet';
import { announce, startBridge } from './bridge';
import { Home } from './Home';
import { addApp, addWidget, defaultLayout, locate, normalize, rename, takeOut } from './layout';
import { AddSheet, AppFrame, FolderView, HiveSettings } from './Sheets';
import { useBoardData, widgetIds } from './widgets';

const KEEP_FRAMES = 3; // recently used apps stay loaded, so switching back is instant
const IDLE_HOME_MS = 2 * 60 * 1000;
const IDLE_APP_MS = 15 * 60 * 1000;

/**
 * A device that already used Fridge Board (it has the board key) and isn't a
 * phone is the fridge tablet: it keeps opening straight to the board.
 */
function firstSettings() {
  let hadBoard = false;
  try { hadBoard = !!localStorage.getItem(`${APP_KEY}.boardKey`); } catch { /* ignore */ }
  const wide = window.matchMedia?.('(min-width: 760px)').matches;
  return { start: hadBoard && wide ? 'board' : 'home', idleToBoard: hadBoard && wide };
}

const viewFromHash = () => {
  const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  return CATALOG[h] ? h : null;
};

/**
 * Hive: a home screen of every app. Fridge Board runs natively inside it; the
 * other apps open full screen in a frame. The address bar holds the open app
 * (#kitchenhub), so the phone's back gesture goes home.
 */
export function Hive() {
  const phone = useIsPhone();
  const [s, setSettings] = useStored('hive.settings', firstSettings());

  const [stored, setStored] = useStored('hive.layout', null);
  const layout = useMemo(() => normalize(stored ?? defaultLayout(), appIds, widgetIds), [stored]);
  const setLayout = useCallback((next) => setStored(typeof next === 'function' ? next(layout) : next), [layout, setStored]);

  const [view, setView] = useState(() => viewFromHash() ?? (s.start === 'board' ? 'board' : null));
  const [recent, setRecent] = useState(() => (view && view !== 'board' ? [view] : []));
  const [boardOpened, setBoardOpened] = useState(view === 'board');
  const [editing, setEditing] = useState(false);
  const [folderKey, setFolderKey] = useState(null);
  const [sheet, setSheet] = useState(null); // 'add' | 'settings' | 'account'

  // One Hive sign-in, handed to apps in frames as short passes (bridge.js).
  const { user, ready } = useHiveUser();
  const signedIn = useRef(false);
  // Apps match people by email, so only a confirmed email counts as signed in.
  signedIn.current = !!user?.verified;
  useEffect(() => startBridge(() => signedIn.current), []);
  const firstAnnounce = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstAnnounce.current) { firstAnnounce.current = false; return; } // frames say hello themselves
    announce(!!user?.verified);
  }, [user?.verified, ready]);
  const account = { on: accountsOn, ready, user, open: () => setSheet('account') };

  const data = useBoardData();
  const now = new Date(useTick(30000));

  // The hash is the source of truth for which app is open. `pushed` means Hive
  // itself opened the app, so going home is just "back".
  const pushed = useRef(false);
  useEffect(() => {
    const on = () => { const v = viewFromHash(); if (!v) pushed.current = false; setView(v); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // Each view keeps its own scroll position (the board scrolls the page on phones).
  const scrolls = useRef({});
  const lastView = useRef(view);
  useEffect(() => {
    scrolls.current[lastView.current ?? 'home'] = window.scrollY;
    lastView.current = view;
    window.scrollTo(0, scrolls.current[view ?? 'home'] ?? 0);
    if (view === 'board') setBoardOpened(true);
    else if (view) setRecent((r) => [view, ...r.filter((x) => x !== view)].slice(0, KEEP_FRAMES));
    if (view) { setEditing(false); setFolderKey(null); setSheet(null); }
  }, [view]);

  const open = useCallback((id) => {
    const a = CATALOG[id];
    if (!a) return;
    setFolderKey(null);
    if (a.frame === false && a.url) { window.open(a.url, '_blank', 'noopener'); return; }
    if (viewFromHash() === id) return;
    pushed.current = !viewFromHash();
    if (pushed.current) window.location.hash = id;
    else { window.history.replaceState(null, '', `#${id}`); setView(id); }
  }, []);
  const goHome = useCallback(() => {
    if (pushed.current && viewFromHash()) { window.history.back(); return; }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setView(null);
  }, []);

  // On the fridge: drift back to the board when nobody is using the screen.
  const touched = useRef(Date.now());
  useEffect(() => {
    if (!s.idleToBoard) return;
    const touch = () => (touched.current = Date.now());
    ['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, touch, true));
    const id = setInterval(() => {
      if (view === 'board') return;
      const limit = view ? IDLE_APP_MS : IDLE_HOME_MS;
      if (Date.now() - touched.current > limit) { touched.current = Date.now(); open('board'); }
    }, 15000);
    return () => { clearInterval(id); ['pointerdown', 'keydown'].forEach((e) => document.removeEventListener(e, touch, true)); };
  }, [s.idleToBoard, view, open]);

  const folder = folderKey && locate(layout, folderKey)?.item;
  const onBoard = view === 'board';

  return (
    <div className="hive">
      {boardOpened && (
        <div className="hive-view" hidden={!onBoard}>
          {phone
            ? <><PullToRefresh><Board onHome={goHome} /></PullToRefresh><Footer /></>
            : <Board onHome={goHome} />}
        </div>
      )}

      {recent.map((id) => <AppFrame key={id} id={id} visible={view === id} onHome={goHome} />)}

      <div className="hive-view" hidden={!!view}>
        <Home layout={layout} setLayout={setLayout} data={data} now={now}
          editing={editing} setEditing={setEditing} onOpen={open} onOpenFolder={setFolderKey}
          onAdd={() => setSheet('add')} onSettings={() => setSheet('settings')} account={account} />
      </div>

      {!view && folder?.k === 'folder' && (
        <FolderView key={folder.key} folder={folder} editing={editing} onOpen={open} onClose={() => setFolderKey(null)}
          onRename={(n) => setLayout(rename(layout, folder.key, n))}
          onTakeOut={(id) => { const next = takeOut(layout, id); setLayout(next); if (!locate(next, folder.key)) setFolderKey(null); }} />
      )}
      {!view && sheet === 'add' && (
        <AddSheet layout={layout} onClose={() => setSheet(null)}
          onAddApp={(id) => setLayout(addApp(layout, id))} onAddWidget={(w) => setLayout(addWidget(layout, w))} />
      )}
      {!view && sheet === 'account' && accountsOn && <AccountSheet user={user} onClose={() => setSheet(null)} />}
      {!view && sheet === 'settings' && (
        <HiveSettings settings={s} setSettings={(f) => setSettings(f(s))} onClose={() => setSheet(null)} account={account}
          onResetLayout={() => setStored(defaultLayout())} />
      )}
    </div>
  );
}
