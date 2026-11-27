import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@/components/board/Board';
import { OPEN_ACCOUNT } from '@/components/board/bits';
import { EGG_COUNT_PATH, OPEN_EGG_COUNT } from '@/lib/eggs';
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
import { connectGoogle } from './googleConnect';
import { connectRequest } from './googleReturn';
import { AccountSheet } from './AccountSheet';
import { rememberJoinCode } from './joinCode';
import { announce, listenForBusy, listenForClose, startBridge } from './bridge';
import { isBusy, markBusy } from './busy';
import { AppearanceSheet, IconEditor } from './Customize';
import { ClockScreen } from './ClockScreen';
import { Home } from './Home';
import { AppFades } from './Launch';
import { addApp, addStack, addWidget, defaultLayout, locate, normalize, rename, stackWith, takeOut } from './layout';
import { DEFAULT_LOOK, WALLPAPERS, accentFor } from './look';
import { AddSheet, AppFrame, FolderView, HiveSettings, StackSheet, StackWithSheet } from './Sheets';
import { Spotlight } from './Spotlight';
import { WidgetActions } from './live';
import { WIDGETS, signals, useLiveBoard, widgetIds } from './widgets';
import { homeView, showView, viewIn } from './nav';

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
  return { start: hadBoard && wide ? 'board' : 'home', idle: hadBoard && wide ? 'board' : 'off' };
}

/**
 * What a screen does when left alone: 'board' (back to Fridge Board), 'clock'
 * (the clock screen) or 'off'. Settings saved before the clock screen existed
 * had a yes/no `idleToBoard`; that still means what it meant.
 */
const idleOf = (s) => s.idle ?? (s.idleToBoard ? 'board' : 'off');

// Apps that can't be framed open in a tab, never here.
const isView = (h) => !!CATALOG[h] && CATALOG[h].frame !== false;
const viewFromHash = () => viewIn(window.location, isView);

/**
 * Hive: a home screen of every app. Fridge Board runs natively inside it; the
 * other apps open full screen in a frame. The address bar holds the open app
 * (#kitchenhub), so the phone's back gesture goes home.
 */
export function Hive() {
  const phone = useIsPhone();
  const [s, setSettings] = useStored('hive.settings', firstSettings());
  const idle = idleOf(s);
  const [resting, setResting] = useState(() => s.start === 'clock' && !viewFromHash());

  const [stored, setStored] = useStored('hive.layout', null);
  const layout = useMemo(() => normalize(stored ?? defaultLayout(), appIds, widgetIds), [stored]);
  const setLayout = useCallback((next) => setStored(typeof next === 'function' ? next(layout) : next), [layout, setStored]);

  const [view, setView] = useState(() => viewFromHash() ?? (s.start === 'board' ? 'board' : null));
  const [stackEdit, setStackEdit] = useState(null);
  const [stackOn, setStackOn] = useState(null); // "Stack with…": the widget or stack to stack onto
  const [recent, setRecent] = useState(() => (view && view !== 'board' ? [view] : []));
  const [boardOpened, setBoardOpened] = useState(view === 'board');
  const [editing, setEditing] = useState(false);
  const [folder, setFolder] = useState(null); // { key, rect }
  const [sheet, setSheet] = useState(null); // 'add' | 'settings' | 'account' | 'look' | 'search'
  const [iconEdit, setIconEdit] = useState(null);
  const fades = useRef(null); // opening and closing apps (Launch.jsx); its own state, so a fade re-renders nothing here
  const viewRef = useRef(view);
  viewRef.current = view;
  const [paths, setPaths] = useState({}); // app id → { path, n } for shortcuts
  const [recentApps, setRecentApps] = useStored('hive.recent', []);

  // How the home screen looks (Settings → Wallpaper & home screen).
  const [storedLook, setStoredLook] = useStored('hive.look', DEFAULT_LOOK);
  const look = { ...DEFAULT_LOOK, ...storedLook };
  const setLook = useCallback((f) => setStoredLook((l) => (typeof f === 'function' ? f({ ...DEFAULT_LOOK, ...l }) : f)), [setStoredLook]);
  const [photo, setPhoto] = useStored('hive.wallpaperPhoto', null);
  const { theme } = useTheme();
  const wall = look.wallpaper === 'photo' && photo ? { css: `center / cover no-repeat url(${photo.dataUrl})`, dark: photo.dark } : WALLPAPERS[look.wallpaper] || WALLPAPERS.honey;
  const accent = accentFor(look, photo);
  const wallDark = look.dim || (['honey', 'plain'].includes(look.wallpaper) || !WALLPAPERS[look.wallpaper] && look.wallpaper !== 'photo' ? theme === 'dark' : !!wall.dark);

  // One Hive sign-in, handed to apps in frames as short passes (bridge.js).
  const { user, ready, recovering } = useHiveUser();
  // Back from a reset-password link: go home and ask for the new password.
  useEffect(() => { if (recovering) { setView(null); setSheet('account'); } }, [recovering]);
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

  // `?connect=google&back=…`: another app (Our Den) sent someone to connect
  // Google. Signed in, straight to Google; otherwise sign in first.
  useEffect(() => {
    if (!ready) return;
    const asked = connectRequest(location.search, location.origin);
    if (!asked) return;
    const url = new URL(location.href);
    url.searchParams.delete('connect'); url.searchParams.delete('back');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    if (!user?.verified) { setSheet('account'); return; }
    connectGoogle({ back: asked.back }).catch(() => setSheet('account'));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // `?join=CODE`: a household invite link. Keep the code for the Account
  // sheet (it survives signing in or creating an account) and open it.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('join');
    if (!code) return;
    rememberJoinCode(code);
    const url = new URL(location.href);
    url.searchParams.delete('join');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    setSheet('account');
  }, []);

  const { data, act } = useLiveBoard();
  const now = new Date(useTick(30000));
  const minute = Math.floor(now.getTime() / 60000);
  const sig = useMemo(() => signals(data, now), [data, minute]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // The address is the source of truth for which app is open (nav.js); the
  // back gesture changes it, and Hive follows.
  useEffect(() => {
    const on = () => setView(viewFromHash());
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

  // Leaving an app, however it happens (Home, the home bar, the back gesture,
  // Escape): it fades out over the home screen. Before paint, so the home
  // screen never flashes without it.
  const shown = useRef(view);
  useLayoutEffect(() => {
    const was = shown.current;
    shown.current = view;
    if (!was || view) return;
    // Gone without a fade (the back gesture): the cover goes up before this paints and fades off.
    if (!fades.current?.busy()) fades.current?.reveal();
  }, [view]);

  const navigate = useCallback((id) => {
    if (showView(window, id, isView)) setView(id); // no hashchange follows
  }, []);

  /** Open an app; `path` opens it at a page, for shortcuts and search results. */
  const open = useCallback((id, from, path) => {
    const a = CATALOG[id];
    if (!a) return;
    setFolder(null);
    if (id === 'settings') { setSheet('settings'); return; }
    // In its own tab: apps that can't be framed, and any the person chose (in a
    // frame, a browser gives the app separate storage, so its own sign-in
    // doesn't carry over unless the app supports Sign in with Hive).
    if (opensInTab(id, look)) { window.open(appUrl(id, path), '_blank', 'noopener'); return; }
    // The cover fades in first (AppFade); the app is mounted and shown only
    // under it (showApp), so its loading never competes with the fade.
    if (viewFromHash() !== id && viewRef.current !== id && fades.current) { fades.current.open(id, path); return; }
    showApp(id, path);
  }, [navigate, look.inside, look.external]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Put an app on screen: mount it (if it isn't kept loaded already) and make it the view. */
  const showApp = useCallback((id, path) => {
    if (path) setPaths((p) => ({ ...p, [id]: { path, n: (p[id]?.n || 0) + 1 } }));
    if (id === 'board') setBoardOpened(true);
    else setRecent((r) => (r.includes(id) ? r : [id, ...r].slice(0, KEEP_FRAMES)));
    navigate(id);
  }, [navigate]);

  /** Go home now, without a fade. */
  const leaveApp = useCallback(() => {
    homeView(window); // always the home screen: never history.back() (nav.js)
    setView(null);
  }, []);

  /** Go home from an app: the cover fades over it, Hive goes home under it, and it fades off. */
  const goHome = useCallback(() => {
    const id = viewRef.current;
    if (id && fades.current && !fades.current.busy()) fades.current.close(id);
    else leaveApp();
  }, [leaveApp]);

  // "Connect Google" and the like, from a widget or the board: Hive → Account.
  useEffect(() => {
    const on = () => { if (viewRef.current) leaveApp(); setFolder(null); setSheet(accountsOn ? 'account' : 'settings'); };
    window.addEventListener(OPEN_ACCOUNT, on);
    return () => window.removeEventListener(OPEN_ACCOUNT, on);
  }, [leaveApp]);

  // Escape goes home from an app in a frame (Fridge Board keeps Escape for its own cook mode).
  useEffect(() => {
    if (!view || view === 'board') return;
    const esc = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.hive-layer')) goHome(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [view, goHome]);

  // Ticking off the egg round, on the board or a widget: GalaxyFarm's egg count,
  // in its frame. It asks to be closed once the count is logged, and goes back
  // to where the tick was: the board on the fridge, else the home screen.
  // `viewRef`, not the hash: the fridge can start on the board with no hash.
  const eggsFrom = useRef(null);
  useEffect(() => {
    const on = () => { eggsFrom.current = viewRef.current; open('galaxyfarm', null, EGG_COUNT_PATH); };
    window.addEventListener(OPEN_EGG_COUNT, on);
    return () => window.removeEventListener(OPEN_EGG_COUNT, on);
  }, [open]);
  useEffect(() => listenForClose((id) => {
    if (viewRef.current !== id) return;
    const back = eggsFrom.current;
    eggsFrom.current = null;
    if (back === 'board') open('board'); else goHome();
  }), [goHome, open]);


  // On the fridge: when nobody is using the screen, drift back to the board,
  // or show the clock screen. An app that says it's in use (KitchenHub's cook
  // mode; taps in its frame never reach this page) counts as somebody there.
  const touched = useRef(Date.now());
  const busy = useRef({});
  useEffect(() => listenForBusy((id, on) => { busy.current = markBusy(busy.current, id, on); }), []);
  useEffect(() => {
    if (idle === 'off' || resting) return;
    const touch = () => (touched.current = Date.now());
    ['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, touch, true));
    const id = setInterval(() => {
      if (idle === 'board' && view === 'board') return;
      if (isBusy(busy.current, view)) { touched.current = Date.now(); return; }
      const limit = view ? IDLE_APP_MS : IDLE_HOME_MS;
      if (Date.now() - touched.current < limit) return;
      touched.current = Date.now();
      if (idle === 'board') open('board');
      else { if (view) goHome(); setEditing(false); setSheet(null); setFolder(null); setResting(true); }
    }, 15000);
    return () => { clearInterval(id); ['pointerdown', 'keydown'].forEach((e) => document.removeEventListener(e, touch, true)); };
  }, [idle, view, open, resting, goHome]);
  const stopResting = useCallback(() => setResting(false), []);
  const openWidget = useCallback((w, to) => {
    const def = WIDGETS[w];
    const url = to?.url || (!to?.path && def.url);
    setResting(false);
    if (url) window.open(url, '_blank', 'noopener');
    else open(def.app, null, to?.path || def.path);
  }, [open]);

  const folderItem = folder && locate(layout, folder.key)?.item;
  const onBoard = view === 'board';
  const spotAction = (a) => {
    if (a === 'wallpaper') setSheet('look');
    else if (a === 'edit') { setSheet(null); setEditing(true); }
    else if (a === 'account') setSheet(accountsOn ? 'account' : 'settings');
    else setSheet('settings');
  };

  return (
    <div className="hive" data-icons={look.iconStyle || 'colour'} data-badges={look.badgeStyle || 'count'} style={accent ? { '--accent': accent } : undefined}>
      {boardOpened && (
        <div className="hive-view board-view" data-app-view="board" hidden={!onBoard}>
          {phone
            ? <><PullToRefresh><Board onHome={goHome} /></PullToRefresh><Footer /></>
            : <Board onHome={goHome} />}
        </div>
      )}

      {recent.map((id) => <AppFrame key={id} id={id} visible={view === id} onHome={goHome} path={paths[id]} />)}

      {/* Kept laid out behind an open app (hidden, not removed), so it's ready the moment the app fades out. */}
      <div className={`hive-view home-view ${view ? 'behind' : ''}`} aria-hidden={view ? 'true' : undefined} inert={view ? '' : undefined} style={{ '--wall': wall.css }}>
        <div className={`wallpaper ${look.dim ? 'dim' : ''}`} aria-hidden="true" />
        <WidgetActions.Provider value={act}>
        <Home layout={layout} setLayout={setLayout} data={data} now={now} sig={sig} look={look} badges={badges} dark={wallDark}
          onEditStack={setStackEdit} onStackWith={setStackOn} onClock={() => setResting(true)}
          editing={editing} setEditing={setEditing} onOpen={open}
          onOpenFolder={(key, el) => setFolder({ key, rect: el?.getBoundingClientRect?.() || null })}
          onAdd={() => setSheet('add')} onCustomize={() => setSheet('look')} onSearch={() => setSheet('search')}
          onEditIcon={setIconEdit} onAddToHome={(id) => setLayout(addApp(layout, id))}
          onSetExternal={(id, on) => setLook((l) => ({ ...l, external: { ...(l.external || {}), [id]: !!on } }))} account={account} />
        </WidgetActions.Provider>
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
        <AppearanceSheet look={look} setLook={setLook} photo={photo} setPhoto={setPhoto} onClose={() => setSheet(null)}
          onShowClock={() => { setSheet(null); setResting(true); }} />
      )}
      {!view && iconEdit && <IconEditor id={iconEdit} layout={layout} setLayout={setLayout} onClose={() => setIconEdit(null)} />}
      <AppFades ref={fades} custom={layout.custom} onShow={showApp} onHide={leaveApp} />
      {!view && sheet === 'add' && (
        <AddSheet layout={layout} onClose={() => setSheet(null)}
          data={data} now={now} custom={layout.custom}
          onAddApp={(id) => setLayout(addApp(layout, id))} onAddWidget={(w, size) => setLayout(addWidget(layout, w, size))}
          onAddStack={(ws, size) => { setLayout(addStack(layout, ws, size)); setSheet(null); }} />
      )}
      {!view && stackOn && locate(layout, stackOn) && (
        <StackWithSheet targetKey={stackOn} layout={layout} onClose={() => setStackOn(null)}
          onPick={(w) => {
            const next = stackWith(layout, stackOn, w);
            setLayout(next); setStackOn(null);
            // A widget stacked on a widget becomes a new stack: open it so the order can be set.
            const made = next.grid.find((i) => i.k === 'stack' && i.widgets[0] === w);
            if (made) setStackEdit(made.key);
          }} />
      )}
      {!view && stackEdit && locate(layout, stackEdit)?.item.k === 'stack' && (
        <StackSheet stack={locate(layout, stackEdit).item} layout={layout} setLayout={setLayout} onClose={() => setStackEdit(null)} />
      )}
      {resting && (
        <ClockScreen data={data} now={now} sig={sig} rest={look.rest} custom={layout.custom}
          onOpenWidget={openWidget} onClose={stopResting} />
      )}
      {!view && sheet === 'account' && accountsOn && <AccountSheet user={user} recovering={recovering} onClose={() => setSheet(null)} />}
      {!view && sheet === 'settings' && (
        <HiveSettings settings={{ ...s, idle }} setSettings={(f) => setSettings(f({ ...s, idle }))} onClose={() => setSheet(null)} account={account}
          onLook={() => setSheet('look')} onEdit={() => { setSheet(null); setEditing(true); }}
          onResetLayout={() => setStored(defaultLayout())} />
      )}
    </div>
  );
}
