import { useEffect, useRef, useState } from 'react';
import { AUDIENCE, CATALOG, appIds, appLook, appUrl } from '@/config/catalog';
import { FEEDBACK_URL } from '@/config/app';
import { useTheme } from '@/context/ThemeContext';
import { AppIcon } from './Home';
import { forgetFrame, markFrameReady } from './frameReady';
import { placedApps, placedWidgets, setStack, unstack } from './layout';
import { Widget, WIDGETS, widgetIds } from './widgets';

/** Close on Escape and put focus inside, like any dialog. */
function useDialog(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('button, input, a')?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); prev?.focus?.(); };
  }, [onClose]);
  return ref;
}

export function FolderView({ folder, origin, custom, badges = {}, editing, onOpen, onRename, onTakeOut, onClose }) {
  const ref = useDialog(onClose);
  const [name, setName] = useState(folder.name);
  // Bloom out of the folder's icon: start at its spot and size, then grow.
  const from = origin ? { '--fx': `${origin.left + origin.width / 2 - window.innerWidth / 2}px`, '--fy': `${origin.top + origin.height / 2 - window.innerHeight / 2}px` } : {};
  return (
    <div className="scrim hive-layer folder-scrim" onClick={onClose}>
      <div className="folder-open" style={from} role="dialog" aria-modal="true" aria-label={`${folder.name} folder`} ref={ref} onClick={(e) => e.stopPropagation()}>
        {editing
          ? <input className="folder-name" value={name} aria-label="Folder name" onChange={(e) => setName(e.target.value)} onBlur={() => onRename(name)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          : <h2 className="folder-title">{folder.name}</h2>}
        <div className="folder-grid">
          {folder.apps.map((id) => (
            <div className="tile" key={id}>
              <button className="tile-btn" onClick={(e) => !editing && onOpen(id, e.currentTarget.querySelector('.icon'))}>
                <AppIcon id={id} custom={custom} badge={badges[id]} /><span className="tile-name">{appLook(id, custom).name}</span>
              </button>
              {editing && (
                <button className="badge-out" aria-label={`Move ${appLook(id, custom).name} out of the folder`} onClick={() => onTakeOut(id)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18V6M7 11l5-5 5 5" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {editing && <p className="sheet-note">Tap the arrow to move an app back to the home screen.</p>}
      </div>
    </div>
  );
}

const SIZE_NAMES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];
const DEFAULT_SIZE = { today: 'm' };

/** One widget in the picker: a live preview at the size you choose, and Add. */
function WidgetPick({ w, data, now, custom, onAdd }) {
  const [size, setSize] = useState(DEFAULT_SIZE[w] || 's');
  const def = WIDGETS[w];
  return (
    <div className="pick">
      <div className={`pick-preview size-${size}`} aria-hidden="true" inert="">
        <Widget w={w} size={size} data={data} now={now} color={appLook(def.app, custom).color} onOpen={() => {}} still />
      </div>
      <div className="pick-foot">
        <span><b>{def.label}</b><small>From {CATALOG[def.app].name}</small></span>
        <div className="seg seg-mini" role="radiogroup" aria-label={`${def.label} size`}>
          {SIZE_NAMES.map(([s, name]) => (
            <button key={s} role="radio" aria-checked={size === s} onClick={() => setSize(s)}>{name}</button>
          ))}
        </div>
        <button className="pill strong" onClick={() => onAdd(w, size)}>Add widget</button>
      </div>
    </div>
  );
}

/**
 * Add to the home screen: a widget gallery with live previews (pick a size,
 * see it with today's data), then every app not on the home screen yet.
 */
export function AddSheet({ layout, data, now, custom = {}, onAddApp, onAddWidget, onClose }) {
  const ref = useDialog(onClose);
  const onHome = placedApps(layout);
  const widgetsOn = placedWidgets(layout);
  const apps = appIds.filter((id) => !onHome.has(id));
  const widgets = widgetIds.filter((w) => !widgetsOn.has(w));
  return (
    <div className="scrim hive-layer" onClick={onClose}>
      <div className="sheet-panel sheet-wide" role="dialog" aria-modal="true" aria-label="Add to the home screen" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>Add to home screen</h2><button className="pill" onClick={onClose}>Close</button></div>
        <h3 className="sheet-sub">Widgets</h3>
        {widgets.length ? (
          <div className="picks">
            {widgets.map((w) => <WidgetPick key={w} w={w} data={data} now={now} custom={custom} onAdd={onAddWidget} />)}
          </div>
        ) : <p className="sheet-note">Every widget is on your home screen. To make room, drop one widget on another: they become a stack.</p>}
        <h3 className="sheet-sub">Apps</h3>
        {apps.length ? (
          <div className="add-list">
            {apps.map((id) => (
              <button key={id} className="add-row" onClick={() => onAddApp(id)}>
                <AppIcon id={id} size={40} />
                <span><b>{CATALOG[id].name}</b><small>{CATALOG[id].blurb}</small></span>
                <span className="chip">{AUDIENCE[CATALOG[id].audience]}</span>
                <span className="add-plus" aria-hidden="true">+</span>
              </button>
            ))}
          </div>
        ) : <p className="sheet-note">Every app is on your home screen. Remove one with the minus badge to see it here.</p>}
      </div>
    </div>
  );
}

/** A stack's widgets: their order, take one out, add one, and whether it turns by itself. */
export function StackSheet({ stack, layout, setLayout, onClose }) {
  const ref = useDialog(onClose);
  const free = widgetIds.filter((w) => !placedWidgets(layout).has(w));
  const order = (from, to) => {
    const ws = [...stack.widgets];
    const [w] = ws.splice(from, 1);
    ws.splice(to, 0, w);
    setLayout((l) => setStack(l, stack.key, { widgets: ws }));
  };
  return (
    <div className="scrim hive-layer" onClick={onClose}>
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label="Edit stack" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>Edit stack</h2><button className="pill" onClick={onClose}>Done</button></div>
        <label className="set-row">
          <span><b>Turn by itself</b><small>Shows what matters now: chores in the morning, dinner from mid-afternoon, an event about to start. Turning it by hand holds for half an hour.</small></span>
          <input type="checkbox" className="switch-input" checked={stack.rotate} onChange={(e) => setLayout((l) => setStack(l, stack.key, { rotate: e.target.checked }))} />
        </label>
        <h3 className="sheet-sub">In this stack, top first</h3>
        <div className="add-list">
          {stack.widgets.map((w, i) => (
            <div key={w} className="add-row">
              <AppIcon id={WIDGETS[w].app} size={40} />
              <span><b>{WIDGETS[w].label}</b><small>From {CATALOG[WIDGETS[w].app].name}</small></span>
              <span className="row-tools">
                <button className="tool" disabled={i === 0} onClick={() => order(i, i - 1)} aria-label={`Move ${WIDGETS[w].label} up`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18V6M7 11l5-5 5 5" /></svg>
                </button>
                <button className="tool" disabled={i === stack.widgets.length - 1} onClick={() => order(i, i + 1)} aria-label={`Move ${WIDGETS[w].label} down`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M7 13l5 5 5-5" /></svg>
                </button>
                <button className="tool" onClick={() => { setLayout((l) => unstack(l, stack.key, w)); if (stack.widgets.length <= 2) onClose(); }} aria-label={`Take ${WIDGETS[w].label} out of the stack`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
                </button>
              </span>
            </div>
          ))}
        </div>
        {free.length > 0 && (
          <>
            <h3 className="sheet-sub">Add to this stack</h3>
            <div className="add-list">
              {free.map((w) => (
                <button key={w} className="add-row" onClick={() => setLayout((l) => setStack(l, stack.key, { add: w }))}>
                  <AppIcon id={WIDGETS[w].app} size={40} />
                  <span><b>{WIDGETS[w].label}</b><small>From {CATALOG[WIDGETS[w].app].name}</small></span>
                  <span className="add-plus" aria-hidden="true">+</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function HiveSettings({ settings, setSettings, onResetLayout, onClose, account, onLook, onEdit }) {
  const ref = useDialog(onClose);
  const { theme, setTheme } = useTheme();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="scrim hive-layer" onClick={onClose}>
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label="Hive settings" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>Hive settings</h2><button className="pill" onClick={onClose}>Close</button></div>
        <div className="set-row">
          {!account?.on ? (
            <span><b>Hive account</b><small>Not set up yet. Until it is, each app asks you to sign in on its own.</small></span>
          ) : (
            <>
              <span>
                <b>{account.user?.verified ? account.user.name || 'Hive account' : 'Hive account'}</b>
                <small>{!account.user ? 'Sign in once, and apps that support Hive sign you in by themselves.'
                  : !account.user.verified ? `Confirm ${account.user.email} to finish.`
                  : account.user.email}</small>
              </span>
              <button className={`pill ${account.user?.verified ? '' : 'strong'}`} onClick={account.open} disabled={!account.ready}>
                {!account.user ? 'Sign in' : !account.user.verified ? 'Confirm' : 'Manage'}
              </button>
            </>
          )}
        </div>
        <button className="set-row set-link" onClick={onLook}>
          <span><b>Wallpaper &amp; home screen</b><small>Wallpaper, colours, icons, columns, dock, badges, the clock screen.</small></span><span className="chev" aria-hidden="true">›</span>
        </button>
        <button className="set-row set-link" onClick={onEdit}>
          <span><b>Edit home screen</b><small>Or press and hold any empty space.</small></span><span className="chev" aria-hidden="true">›</span>
        </button>
        <label className="set-row">
          <span><b>Open to</b><small>On the fridge tablet, Fridge Board keeps it working like before.</small></span>
          <select value={settings.start} onChange={(e) => setSettings((s) => ({ ...s, start: e.target.value }))}>
            <option value="home">Home screen</option>
            <option value="board">Fridge Board</option>
            <option value="clock">Clock screen</option>
          </select>
        </label>
        <label className="set-row">
          <span><b>When left alone</b><small>After 2 minutes on the home screen, or 15 minutes in an app.</small></span>
          <select value={settings.idle} onChange={(e) => setSettings((s) => ({ ...s, idle: e.target.value, idleToBoard: e.target.value === 'board' }))}>
            <option value="board">Go to Fridge Board</option>
            <option value="clock">Show the clock screen</option>
            <option value="off">Stay where it is</option>
          </select>
        </label>
        <label className="set-row">
          <span><b>Theme</b></span>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select>
        </label>
        <div className="set-row">
          <span><b>Home screen layout</b><small>Saved on this device for now. It follows your account once Hive sign-in is ready.</small></span>
          {confirm
            ? <button className="pill danger" onClick={() => { onResetLayout(); setConfirm(false); }}>Reset it</button>
            : <button className="pill" onClick={() => setConfirm(true)}>Reset</button>}
        </div>
        <a className="feedback" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Report a bug or request a feature</a>
      </div>
    </div>
  );
}

/**
 * A non-native app, full screen inside Hive. The bar at the bottom is the
 * home indicator: swipe it up (the app shrinks with your finger) or tap it to
 * go home. The top bar has Home, Reload and Open in its own tab.
 */
export function AppFrame({ id, visible, onHome, path }) {
  const a = CATALOG[id];
  const [nonce, setNonce] = useState(0);
  const [pull, setPull] = useState(0);
  const start = useRef(null);
  const src = appUrl(id, path?.path);
  // A fresh load (reload, or a shortcut to another page) isn't ready until it loads; an app not online yet is ready at once.
  useEffect(() => { if (a.url) forgetFrame(id); else markFrameReady(id); }, [id, nonce, path?.n, a.url]);
  const onDown = (e) => { start.current = { y: e.clientY, id: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (start.current?.id === e.pointerId) setPull(Math.max(0, start.current.y - e.clientY)); };
  const onUp = (e) => {
    if (start.current?.id !== e.pointerId) return;
    const moved = start.current.y - e.clientY;
    start.current = null;
    setPull(0);
    if (moved > 70 || Math.abs(moved) < 6) onHome();
  };
  const k = Math.min(1, pull / 260);
  return (
    // Parked, not removed, when not showing: kept laid out and loaded (hidden
    // with visibility), so opening it again is instant and costs no layout.
    <div className={`frame-view ${visible ? '' : 'parked'}`} data-app-view={id} aria-hidden={visible ? undefined : 'true'} inert={visible ? undefined : ''}
      style={pull ? { transform: `translateY(${-pull * 0.5}px) scale(${1 - k * 0.22})`, borderRadius: `${16 + k * 24}px`, transition: 'none' } : undefined}>
      <div className="frame-bar" style={{ '--c': a.color }}>
        <button className="frame-home" onClick={onHome} aria-label="Back to the Hive home screen">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Home
        </button>
        <b className="frame-title">{a.name}</b>
        {a.url && (
          <span className="frame-actions">
            <button className="frame-btn" aria-label={`Reload ${a.name}`} onClick={() => setNonce((n) => n + 1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>
            </button>
            <a className="frame-btn" href={src} target="_blank" rel="noopener noreferrer" aria-label={`Open ${a.name} in its own tab`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
            </a>
          </span>
        )}
      </div>
      {a.url ? (
        <iframe key={`${nonce}:${path?.n || 0}`} className="frame" src={src} title={a.name} data-app={id}
          onLoad={() => markFrameReady(id)}
          allow="geolocation; camera; microphone; clipboard-read; clipboard-write; fullscreen; web-share" />
      ) : (
        <div className="frame-missing">
          <AppIcon id={id} size={72} />
          <h2>{a.name} isn&apos;t online yet</h2>
          <p>It will open right here once it&apos;s online.</p>
        </div>
      )}
      <button className="home-indicator" aria-label="Swipe up or tap to go home"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { start.current = null; setPull(0); }}>
        <i />
      </button>
    </div>
  );
}
