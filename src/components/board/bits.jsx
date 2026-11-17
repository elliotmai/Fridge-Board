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
