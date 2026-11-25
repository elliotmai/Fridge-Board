import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@/components/board/Board';
import { Footer } from '@/components/Footer';
import { PullToRefresh } from '@/components/PullToRefresh';
import { APP_KEY } from '@/config/app';
import { CATALOG, appIds, appUrl, opensInTab } from '@/config/catalog';
import { useTheme } from '@/context/ThemeContext';
import { mergeTodos } from '@/lib/agenda';
import { useIsPhone } from '@/hooks/useMedia';
import { useStored } from '@/hooks/useStored';
import { useTick } from '@/hooks/useTick';
import { accountsOn, USER_CHANGED, useHiveUser } from './account';
import { AccountSheet } from './AccountSheet';
import { announce, startBridge } from './bridge';
import { defaultArrangement, normalize } from './arrange';
import { AppearanceSheet, IconEditor } from './Customize';
import { Home } from './Home';
import { LaunchLayer, reducedMotion } from './Launch';
import { DEFAULT_LOOK, WALLPAPERS } from './look';
import { AppFrame, EditHome, HiveSettings } from './Sheets';
import { Spotlight } from './Spotlight';
import { WidgetActions, useLiveBoard } from './live';

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
  return CATALOG[h] && CATALOG[h].frame !== false ? h : null; // apps that can't be framed open in a tab, never here
};

/**
 * Hive: a home screen of every app. Fridge Board runs natively inside it; the
 * other apps open full screen in a frame. The address bar holds the open app
 * (#kitchenhub), so the phone's back gesture goes home.
 */
export function Hive() {
  const phone = useIsPhone();
  const [s, setSettings] = useStored('hive.settings', firstSettings());

  // How this device's home screen is arranged (arrange.js). The first time,
  // it's worked out from the old icon grid's layout, if there was one.
  const [stored, setStored] = useStored('hive.home', null);
  const [oldLayout] = useStored('hive.layout', null);
  const arrangement = useMemo(() => normalize(stored, appIds, oldLayout), [stored, oldLayout]);
  const setArrangement = useCallback((next) => setStored(typeof next === 'function' ? next(arrangement) : next), [arrangement, setStored]);

  const [view, setView] = useState(() => viewFromHash() ?? (s.start === 'board' ? 'board' : null));
  const [recent, setRecent] = useState(() => (view && view !== 'board' ? [view] : []));
  const [boardOpened, setBoardOpened] = useState(view === 'board');
  const [sheet, setSheet] = useState(null); // 'edit' | 'settings' | 'account' | 'look' | 'search'
  const [query, setQuery] = useState(''); // what was typed to open search
  const [iconEdit, setIconEdit] = useState(null);
  const [anim, setAnim] = useState(null); // the zoom between an icon and its app
  const [paths, setPaths] = useState({}); // app id → { path, n } for shortcuts
  const [recentApps, setRecentApps] = useStored('hive.recent', []);

  // How the home screen looks (Settings → Wallpaper & home screen).
  const [storedLook, setStoredLook] = useStored('hive.look', DEFAULT_LOOK);
  const look = { ...DEFAULT_LOOK, ...storedLook };
  const setLook = useCallback((f) => setStoredLook((l) => (typeof f === 'function' ? f({ ...DEFAULT_LOOK, ...l }) : f)), [setStoredLook]);
  const [photo, setPhoto] = useStored('hive.wallpaperPhoto', null);
  const { theme } = useTheme();
  const wall = look.wallpaper === 'photo' && photo ? { css: `center / cover no-repeat url(${photo.dataUrl})`, dark: photo.dark } : WALLPAPERS[look.wallpaper] || WALLPAPERS.honey;
  const wallDark = look.dim || (['honey', 'plain'].includes(look.wallpaper) || !WALLPAPERS[look.wallpaper] && look.wallpaper !== 'photo' ? theme === 'dark' : !!wall.dark);

  // One Hive sign-in, handed to apps in frames as short passes (bridge.js).
  const { user, ready, recovering } = useHiveUser();
  // Back from a reset-password link: go home and ask for the new password.
  useEffect(() => { if (recovering) { setView(null); setSheet('account'); } }, [recovering]); // eslint-disable-line react-hooks/exhaustive-deps
  const signedIn = useRef(null);
  // Apps match people by email, so only a confirmed email counts as signed in.
  // null until the saved session has loaded: an app that says hello sooner
  // (Hive reopened on #learnleaf) is answered once it has, not told "signed out".
  signedIn.current = ready ? !!user?.verified : null;
  useEffect(() => startBridge(() => signedIn.current), []);
  const firstAnnounce = useRef(true);
  useEffect(() => {
    if (!ready) return;
    announce(!!user?.verified);
    if (firstAnnounce.current) { firstAnnounce.current = false; return; }
    window.dispatchEvent(new Event(USER_CHANGED)); // the board and widgets reload as the new person
  }, [user?.verified, ready]);
  const account = { on: accountsOn, ready, user, open: () => setSheet('account') };

  const { data, act } = useLiveBoard();
  const now = new Date(useTick(30000));

  // Badges: what's waiting in each app, from the same feed as the widgets.
  const badges = useMemo(() => {
    if (!data) return {};
    const due = mergeTodos({ learnleaf: data.tasks, subjects: data.subjects }, now).filter((t) => t.n != null && t.n <= 0 && !data.todosDone?.includes(t.key)).length;
    const chores = data.chores.filter((c) => !c.done).length;
    return {
      board: chores,
      galaxyfarm: chores,
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
    if (view) setSheet(null);
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
    if (id === 'settings') { setSheet('settings'); return; }
    // In its own tab: apps that can't be framed, and any the person chose (in a
    // frame, a browser gives the app separate storage, so its own sign-in
    // doesn't carry over unless the app supports Sign in with Hive).
    if (opensInTab(id, look)) {
      window.open(appUrl(id, path), '_blank', 'noopener'); return;
    }
    if (path) setPaths((p) => ({ ...p, [id]: { path, n: (p[id]?.n || 0) + 1 } }));
    if (reducedMotion() || viewFromHash() === id) { navigate(id); return; }
    setAnim({ id, dir: 'open', rect: from?.getBoundingClientRect?.() || null, key: Date.now() });
  }, [navigate, look.inside, look.external]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const onBoard = view === 'board';
  const search = useCallback((q) => { setQuery(q || ''); setSheet('search'); }, []);
  const spotAction = (a) => {
    if (a === 'wallpaper') setSheet('look');
    else if (a === 'edit') setSheet('edit');
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
        <WidgetActions.Provider value={act}>
          <Home arrangement={arrangement} setArrangement={setArrangement} data={data} now={now} look={look} counts={badges} dark={wallDark}
            onOpen={open} onSearch={search} onEditIcon={setIconEdit} onEditHome={() => setSheet('edit')} onSettings={() => setSheet('settings')}
            onSetExternal={(id, on) => setLook((l) => ({ ...l, external: { ...(l.external || {}), [id]: !!on } }))} account={account} />
        </WidgetActions.Provider>
      </div>

      {!view && sheet === 'search' && (
        <Spotlight data={data} now={now} custom={arrangement.custom} recent={recentApps.filter((id) => CATALOG[id])} initial={query}
          onOpen={open} onAction={spotAction} onClose={() => setSheet(null)} />
      )}
      {!view && sheet === 'look' && (
        <AppearanceSheet look={look} setLook={setLook} photo={photo} setPhoto={setPhoto} onClose={() => setSheet(null)} />
      )}
      {!view && sheet === 'edit' && (
        <EditHome arrangement={arrangement} setArrangement={setArrangement} onClose={() => setSheet(null)}
          onLook={() => setSheet('look')} onReset={() => setStored(defaultArrangement())} />
      )}
      {!view && iconEdit && <IconEditor id={iconEdit} arrangement={arrangement} setArrangement={setArrangement} onClose={() => setIconEdit(null)} />}
      {anim && <LaunchLayer key={anim.key} anim={anim} custom={arrangement.custom} onDone={onAnimDone} />}
      {!view && sheet === 'account' && accountsOn && <AccountSheet user={user} recovering={recovering} onClose={() => setSheet(null)} />}
      {!view && sheet === 'settings' && (
        <HiveSettings settings={s} setSettings={(f) => setSettings(f(s))} onClose={() => setSheet(null)} account={account}
          onLook={() => setSheet('look')} onEdit={() => setSheet('edit')} />
      )}
    </div>
  );
}
