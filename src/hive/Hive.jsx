import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@/components/board/Board';
import { Footer } from '@/components/Footer';
import { PullToRefresh } from '@/components/PullToRefresh';
import { APP_KEY } from '@/config/app';
import { CATALOG, appIds, appUrl } from '@/config/catalog';
import { useTheme } from '@/context/ThemeContext';
import { mergeTodos } from '@/lib/agenda';
import { useIsPhone } from '@/hooks/useMedia';
import { useStored } from '@/hooks/useStored';
import { useTick } from '@/hooks/useTick';
import { accountsOn, USER_CHANGED, useHiveUser } from './account';
import { AccountSheet } from './AccountSheet';
import { announce, startBridge } from './bridge';
import { AppearanceSheet, IconEditor } from './Customize';
import { Home } from './Home';
import { LaunchLayer, reducedMotion } from './Launch';
import { addApp, addWidget, defaultLayout, locate, normalize, rename, takeOut } from './layout';
import { DEFAULT_LOOK, WALLPAPERS } from './look';
import { AddSheet, AppFrame, FolderView, HiveSettings } from './Sheets';
import { Spotlight } from './Spotlight';
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
  const [folder, setFolder] = useState(null); // { key, rect }
  const [sheet, setSheet] = useState(null); // 'add' | 'settings' | 'account' | 'look' | 'search'
  const [iconEdit, setIconEdit] = useState(null);
  const [anim, setAnim] = useState(null); // the zoom between an icon and its app
  const [paths, setPaths] = useState({}); // app id → { path, n } for shortcuts
  const [recentApps, setRecentApps] = useStored('hive.recent', []);

  // How the home screen looks (Settings → Wallpaper & Home Screen).
  const [storedLook, setStoredLook] = useStored('hive.look', DEFAULT_LOOK);
  const look = { ...DEFAULT_LOOK, ...storedLook };
  const setLook = useCallback((f) => setStoredLook((l) => (typeof f === 'function' ? f({ ...DEFAULT_LOOK, ...l }) : f)), [setStoredLook]);
  const [photo, setPhoto] = useStored('hive.wallpaperPhoto', null);
  const { theme } = useTheme();
  const wall = look.wallpaper === 'photo' && photo ? { css: `center / cover no-repeat url(${photo.dataUrl})`, dark: photo.dark } : WALLPAPERS[look.wallpaper] || WALLPAPERS.honey;
  const wallDark = look.dim || (['honey', 'plain'].includes(look.wallpaper) || !WALLPAPERS[look.wallpaper] && look.wallpaper !== 'photo' ? theme === 'dark' : !!wall.dark);

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
    window.dispatchEvent(new Event(USER_CHANGED)); // the board and widgets reload as the new person
  }, [user?.verified, ready]);
  const account = { on: accountsOn, ready, user, open: () => setSheet('account') };

  const data = useBoardData();
  const now = new Date(useTick(30000));

  // Badges: what's waiting in each app, from the same feed as the widgets.
  const badges = useMemo(() => {
    if (!data) return {};
    const due = mergeTodos({ learnleaf: data.tasks, subjects: data.subjects }, now).filter((t) => t.n != null && t.n <= 0).length;
    return {
      board: data.chores.filter((c) => !c.done).length,
      kitchenhub: data.shopping.filter((i) => !i.bought).length,
      learnleaf: due,
    };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (view) { setEditing(false); setFolder(null); setSheet(null); }
    if (view) setRecentApps((r) => [view, ...r.filter((x) => x !== view)].slice(0, 12));
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = useCallback((id) => {
    if (viewFromHash() === id) return;
    pushed.current = !viewFromHash();
    if (pushed.current) window.location.hash = id;
    else { window.history.replaceState(null, '', `#${id}`); setView(id); }
  }, []);

  /**
   * Open an app. `from` is the icon it was tapped on (the zoom grows out of
   * it); `path` opens it at a page, for shortcuts and search results.
   */
  const open = useCallback((id, from, path) => {
    const a = CATALOG[id];
    if (!a) return;
    setFolder(null);
    if (id === 'settings') { setSheet('settings'); return; }
    if (a.frame === false && a.url) { window.open(appUrl(id, path), '_blank', 'noopener'); return; }
    if (path) setPaths((p) => ({ ...p, [id]: { path, n: (p[id]?.n || 0) + 1 } }));
    if (reducedMotion() || viewFromHash() === id) { navigate(id); return; }
    setAnim({ id, dir: 'open', rect: from?.getBoundingClientRect?.() || null, key: Date.now() });
  }, [navigate]);

  const goHome = useCallback(() => {
    const leaving = viewFromHash() || (view === 'board' ? 'board' : null);
    if (pushed.current && viewFromHash()) window.history.back();
    else { window.history.replaceState(null, '', window.location.pathname + window.location.search); setView(null); }
    if (leaving && !reducedMotion()) setAnim({ id: leaving, dir: 'close', rect: null, key: Date.now() });
  }, [view]);

  const onAnimDone = useCallback((a) => {
    if (a.cleared) { setAnim((cur) => (cur?.key === a.key ? null : cur)); return; }
    if (a.dir === 'open') navigate(a.id);
  }, [navigate]);

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

  const folderItem = folder && locate(layout, folder.key)?.item;
  const onBoard = view === 'board';
  const spotAction = (a) => {
    if (a === 'wallpaper') setSheet('look');
    else if (a === 'edit') { setSheet(null); setEditing(true); }
    else if (a === 'account') setSheet(accountsOn ? 'account' : 'settings');
    else setSheet('settings');
  };

  return (
    <div className="hive">
      {boardOpened && (
        <div className="hive-view" hidden={!onBoard}>
          {phone
            ? <><PullToRefresh><Board onHome={goHome} /></PullToRefresh><Footer /></>
            : <Board onHome={goHome} />}
        </div>
      )}

      {recent.map((id) => <AppFrame key={id} id={id} visible={view === id} onHome={goHome} path={paths[id]} />)}

      <div className="hive-view home-view" hidden={!!view} style={{ '--wall': wall.css }}>
        <div className={`wallpaper ${look.dim ? 'dim' : ''}`} aria-hidden="true" />
        <Home layout={layout} setLayout={setLayout} data={data} now={now} look={look} badges={badges} dark={wallDark}
          editing={editing} setEditing={setEditing} onOpen={open}
          onOpenFolder={(key, el) => setFolder({ key, rect: el?.getBoundingClientRect?.() || null })}
          onAdd={() => setSheet('add')} onCustomize={() => setSheet('look')} onSearch={() => setSheet('search')}
          onEditIcon={setIconEdit} onAddToHome={(id) => setLayout(addApp(layout, id))} account={account} />
      </div>

      {!view && folderItem?.k === 'folder' && (
        <FolderView key={folderItem.key} folder={folderItem} origin={folder.rect} custom={layout.custom} badges={look.badges ? badges : {}}
          editing={editing} onOpen={open} onClose={() => setFolder(null)}
          onRename={(n) => setLayout(rename(layout, folderItem.key, n))}
          onTakeOut={(id) => { const next = takeOut(layout, id); setLayout(next); if (!locate(next, folderItem.key)) setFolder(null); }} />
      )}
      {!view && sheet === 'search' && (
        <Spotlight data={data} now={now} custom={layout.custom} recent={recentApps.filter((id) => CATALOG[id])}
          onOpen={open} onAction={spotAction} onClose={() => setSheet(null)} />
      )}
      {!view && sheet === 'look' && (
        <AppearanceSheet look={look} setLook={setLook} photo={photo} setPhoto={setPhoto} onClose={() => setSheet(null)} />
      )}
      {!view && iconEdit && <IconEditor id={iconEdit} layout={layout} setLayout={setLayout} onClose={() => setIconEdit(null)} />}
      {anim && <LaunchLayer key={anim.key} anim={anim} custom={layout.custom} onDone={onAnimDone} />}
      {!view && sheet === 'add' && (
        <AddSheet layout={layout} onClose={() => setSheet(null)}
          onAddApp={(id) => setLayout(addApp(layout, id))} onAddWidget={(w) => setLayout(addWidget(layout, w))} />
      )}
      {!view && sheet === 'account' && accountsOn && <AccountSheet user={user} onClose={() => setSheet(null)} />}
      {!view && sheet === 'settings' && (
        <HiveSettings settings={s} setSettings={(f) => setSettings(f(s))} onClose={() => setSheet(null)} account={account}
          onLook={() => setSheet('look')} onEdit={() => { setSheet(null); setEditing(true); }}
          onResetLayout={() => setStored(defaultLayout())} />
      )}
    </div>
  );
}
