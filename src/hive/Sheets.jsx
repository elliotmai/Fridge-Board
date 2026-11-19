import { useEffect, useRef, useState } from 'react';
import { AUDIENCE, CATALOG, appIds } from '@/config/catalog';
import { FEEDBACK_URL } from '@/config/app';
import { useTheme } from '@/context/ThemeContext';
import { AppIcon } from './Home';
import { placedApps, placedWidgets } from './layout';
import { WIDGETS, widgetIds } from './widgets';

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

export function FolderView({ folder, editing, onOpen, onRename, onTakeOut, onClose }) {
  const ref = useDialog(onClose);
  const [name, setName] = useState(folder.name);
  return (
    <div className="scrim hive-layer" onClick={onClose}>
      <div className="folder-open" role="dialog" aria-modal="true" aria-label={`${folder.name} folder`} ref={ref} onClick={(e) => e.stopPropagation()}>
        {editing
          ? <input className="folder-name" value={name} aria-label="Folder name" onChange={(e) => setName(e.target.value)} onBlur={() => onRename(name)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          : <h2 className="folder-title">{folder.name}</h2>}
        <div className="folder-grid">
          {folder.apps.map((id) => (
            <div className="tile" key={id}>
              <button className="tile-btn" onClick={() => !editing && onOpen(id)}>
                <AppIcon id={id} /><span className="tile-name">{CATALOG[id].name}</span>
              </button>
              {editing && (
                <button className="badge-out" aria-label={`Move ${CATALOG[id].name} out of the folder`} onClick={() => onTakeOut(id)}>
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

/** The App Library: every app and widget not on the home screen yet. */
export function AddSheet({ layout, onAddApp, onAddWidget, onClose }) {
  const ref = useDialog(onClose);
  const onHome = placedApps(layout);
  const widgetsOn = placedWidgets(layout);
  const apps = appIds.filter((id) => !onHome.has(id));
  const widgets = widgetIds.filter((w) => !widgetsOn.has(w));
  return (
    <div className="scrim hive-layer" onClick={onClose}>
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label="Add to the home screen" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>Add to Home</h2><button className="pill" onClick={onClose}>Close</button></div>
        <h3 className="sheet-sub">Widgets</h3>
        {widgets.length ? (
          <div className="add-list">
            {widgets.map((w) => (
              <button key={w} className="add-row" onClick={() => onAddWidget(w)}>
                <AppIcon id={WIDGETS[w].app} size={40} />
                <span><b>{WIDGETS[w].label}</b><small>From {CATALOG[WIDGETS[w].app].name}</small></span>
                <span className="add-plus" aria-hidden="true">+</span>
              </button>
            ))}
          </div>
        ) : <p className="sheet-note">Every widget is on your home screen.</p>}
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

export function HiveSettings({ settings, setSettings, onResetLayout, onClose, account }) {
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
        <label className="set-row">
          <span><b>Open to</b><small>On the fridge tablet, Fridge Board keeps it working like before.</small></span>
          <select value={settings.start} onChange={(e) => setSettings((s) => ({ ...s, start: e.target.value }))}>
            <option value="home">Home screen</option>
            <option value="board">Fridge Board</option>
          </select>
        </label>
        <label className="set-row">
          <span><b>Go back to Fridge Board when left alone</b><small>After 2 minutes on the home screen, or 15 minutes in another app.</small></span>
          <input type="checkbox" checked={settings.idleToBoard} onChange={(e) => setSettings((s) => ({ ...s, idleToBoard: e.target.checked }))} />
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

/** A non-native app, full screen inside Hive, with a way home and a way out. */
export function AppFrame({ id, visible, onHome }) {
  const a = CATALOG[id];
  const [nonce, setNonce] = useState(0);
  return (
    <div className="frame-view" hidden={!visible}>
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
            <a className="frame-btn" href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${a.name} in its own tab`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
            </a>
          </span>
        )}
      </div>
      {a.url ? (
        <iframe key={nonce} className="frame" src={a.url} title={a.name} data-app={id}
          allow="geolocation; camera; microphone; clipboard-read; clipboard-write; fullscreen; web-share" />
      ) : (
        <div className="frame-missing">
          <AppIcon id={id} size={72} />
          <h2>{a.name} isn&apos;t online yet</h2>
          <p>It will open right here once it&apos;s online.</p>
        </div>
      )}
    </div>
  );
}
