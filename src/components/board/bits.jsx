import { APPS, appLink } from '@/config/apps';
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

export function Countdown({ n, now }) {
  if (now) return <span className="countdown now"><b>Now</b></span>;
  return <span className="countdown"><b>{n}</b><span>{n === 1 ? 'day' : 'days'}</span></span>;
}

/** Small label when a section isn't showing live data. Nothing when it is. */
export function Freshness({ s }) {
  if (!s || s.status === 'live') return null;
  const stale = s.status === 'stale';
  const when = stale && s.at ? ` Last updated ${new Date(s.at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : '';
  return (
    <span className={`fresh ${stale ? 'stale' : ''}`} title={`${s.reason || ''}${when}`.trim()}>
      {stale ? 'Not updating' : 'Sample'}
    </span>
  );
}
