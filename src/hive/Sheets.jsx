import { useEffect, useRef, useState } from 'react';
import { AUDIENCE, CATALOG, appIds, appLook, appUrl } from '@/config/catalog';
import { FEEDBACK_URL } from '@/config/app';
import { useTheme } from '@/context/ThemeContext';
import { AppIcon } from './Apps';
import { PIN_MAX, SECTIONS, hide, movePin, pin, sectionIds, sectionOn, setSection, show, unpin } from './arrange';

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

/**
 * Edit home screen: which apps are pinned (and in what order), which parts of
 * the day show, and which apps are tucked away. Changes show behind the sheet
 * as you make them.
 */
export function EditHome({ arrangement, setArrangement, onLook, onReset, onClose }) {
  const ref = useDialog(onClose);
  const [confirm, setConfirm] = useState(false);
  const { pinned, hidden, custom } = arrangement;
  const name = (id) => appLook(id, custom).name;
  const set = (f) => setArrangement((a) => f(a));
  return (
    <div className="scrim hive-layer see-through" onClick={onClose}>
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label="Edit home screen" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>Edit home screen</h2><button className="pill" onClick={onClose}>Done</button></div>

        <h3 className="sheet-sub">Pinned apps</h3>
        <p className="sheet-note">First in the app list, and along the bottom of a phone. Up to {PIN_MAX}.</p>
        {pinned.length ? (
          <ul className="edit-list">
            {pinned.map((id, i) => (
              <li key={id} className="edit-row">
                <AppIcon id={id} custom={custom} size={36} />
                <b>{name(id)}</b>
                <button className="pill icon-only" aria-label={`Move ${name(id)} up`} disabled={i === 0} onClick={() => set((a) => movePin(a, id, -1))}><Arrow up /></button>
                <button className="pill icon-only" aria-label={`Move ${name(id)} down`} disabled={i === pinned.length - 1} onClick={() => set((a) => movePin(a, id, 1))}><Arrow /></button>
                <button className="pill" onClick={() => set((a) => unpin(a, id))}>Unpin</button>
              </li>
            ))}
          </ul>
        ) : <p className="sheet-note">Nothing pinned. Pin an app below, or press and hold it on the home screen.</p>}

        <h3 className="sheet-sub">On the home screen</h3>
        <div className="add-list">
          {sectionIds.map((k) => (
            <label key={k} className="set-row">
              <span><b>{SECTIONS[k]}</b></span>
              <input type="checkbox" className="switch-input" checked={sectionOn(arrangement, k)} onChange={(e) => set((a) => setSection(a, k, e.target.checked))} />
            </label>
          ))}
        </div>

        <h3 className="sheet-sub">Apps</h3>
        <ul className="edit-list">
          {appIds.map((id) => {
            const isPinned = pinned.includes(id), isHidden = hidden.includes(id);
            return (
              <li key={id} className={`edit-row ${isHidden ? 'is-hidden' : ''}`}>
                <AppIcon id={id} custom={custom} size={36} />
                <span><b>{name(id)}</b><small>{isHidden ? 'Hidden. Search still finds it.' : AUDIENCE[CATALOG[id].audience]}</small></span>
                {!isPinned && <button className="pill" disabled={pinned.length >= PIN_MAX} onClick={() => set((a) => pin(a, id))}>Pin</button>}
                {id !== 'settings' && (isHidden
                  ? <button className="pill" onClick={() => set((a) => show(a, id))}>Show</button>
                  : <button className="pill" onClick={() => set((a) => hide(a, id))}>Hide</button>)}
              </li>
            );
          })}
        </ul>

        <button className="set-row set-link" onClick={onLook}>
          <span><b>Background &amp; look</b><small>Background colour or photo, badges, light or dark.</small></span><span className="chev" aria-hidden="true">›</span>
        </button>
        <div className="set-row">
          <span><b>Start over</b><small>Back to the standard pins and every part of the day. Saved on this device.</small></span>
          {confirm
            ? <button className="pill danger" onClick={() => { onReset(); setConfirm(false); }}>Reset it</button>
            : <button className="pill" onClick={() => setConfirm(true)}>Reset</button>}
        </div>
      </div>
    </div>
  );
}

const Arrow = ({ up }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{up ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}</svg>;

export function HiveSettings({ settings, setSettings, onClose, account, onLook, onEdit }) {
  const ref = useDialog(onClose);
  const { theme, setTheme } = useTheme();
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
          <span><b>Background &amp; look</b><small>Background colour or photo, badges, light or dark, apps inside Hive.</small></span><span className="chev" aria-hidden="true">›</span>
        </button>
        <button className="set-row set-link" onClick={onEdit}>
          <span><b>Edit home screen</b><small>Pinned apps, hidden apps, and which parts of the day show.</small></span><span className="chev" aria-hidden="true">›</span>
        </button>
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
    <div className="frame-view" hidden={!visible}
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
