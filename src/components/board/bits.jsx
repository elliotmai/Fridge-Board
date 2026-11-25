import { APPS, appLink } from '@/config/apps';
import { retryBoard } from '@/data/sources';
import { Chevron, Right, Tick } from './Icons';

export function CheckRow({ checked, onToggle, children, late, end }) {
  return (
    <button className={`check ${late ? 'is-late' : ''}`} role="checkbox" aria-checked={checked} onClick={onToggle}>
      <span className="box"><Tick /></span>
      <span className="lbl">{children}</span>
      {end}
    </button>
  );
}

export function Fold({ open, onToggle, label, count, actions, children }) {
  return (
    <>
      <button className="fold" aria-expanded={open} onClick={onToggle}>
        {label} <b>{count}</b><Chevron />
      </button>
      {open && <div className="fold-body">{actions}{children}</div>}
    </>
  );
}

/** "Open in GalaxyFarm" style link. Rendered on phones only. */
export function OpenIn({ app, path, args = [], label }) {
  return (
    <a className="open-in" href={appLink(app, path, ...args)} target="_blank" rel="noopener noreferrer">
      {label ?? APPS[app].name}<Right />
    </a>
  );
}

/** Days until something. Nothing once it's under way: the board can't know it actually happened. */
export function Countdown({ n }) {
  if (n < 0) return null;
  if (n === 0) return <span className="countdown"><b>Today</b></span>;
  return <span className="countdown"><b>{n}</b><span>{n === 1 ? 'day' : 'days'}</span></span>;
}

/** Small label when a section isn't showing live data. Nothing when it is. */
export function Freshness({ s }) {
  if (!s || s.status === 'live') return null;
  const stale = s.status === 'stale';
  const when = stale && s.at ? ` Last updated ${new Date(s.at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : '';
  const label = stale ? 'Not updating' : s.status === 'sample' ? 'Sample' : s.status === 'error' ? 'Couldn’t reach it' : s.connect === 'google' ? 'Not connected' : 'Off';
  return (
    <span className={`fresh ${stale || s.status === 'error' ? 'stale' : ''}`} title={`${s.reason || ''}${when}`.trim()}>
      {label}
    </span>
  );
}

/** Opens Hive's Account sheet (src/hive/Hive.jsx listens), e.g. to connect Google. */
export const OPEN_ACCOUNT = 'hive:open-account';
export const openAccount = () => window.dispatchEvent(new Event(OPEN_ACCOUNT));

/**
 * What a section or widget shows instead of its data when it has none to
 * show: "Couldn't reach GalaxyFarm" with Retry, or why it's off ("Connect
 * Google", with a way to do it). Never sample data.
 */
export function Unavailable({ s, className = '' }) {
  if (!s || (s.status !== 'error' && s.status !== 'off')) return null;
  return (
    <div className={`unavail ${className}`} role="status">
      <p>{s.connect === 'google' ? 'Connect Google to see your calendar and Google Tasks' : s.reason}</p>
      {s.status === 'error' && <button className="w-act unavail-btn" onClick={retryBoard}>Retry</button>}
      {s.connect === 'google' && <button className="w-act unavail-btn" onClick={openAccount}>Connect Google</button>}
    </div>
  );
}
