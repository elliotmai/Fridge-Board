import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { UI } from './glyphs';

/**
 * The long-press menu: the icon (or widget) lifts out of the blurred home
 * screen and its actions open beside it, above or below, whichever fits.
 *
 *   actions: [{ label, icon, onSelect, danger?, checked? } | { divider: true }]
 */
export function ContextMenu({ rect, preview, actions, title, onClose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const m = menuRef.current;
    if (!m) return;
    const vw = window.innerWidth, vh = window.innerHeight, gap = 12, h = m.offsetHeight, w = m.offsetWidth;
    const below = rect.bottom + gap + h <= vh - 12;
    const top = below ? rect.bottom + gap : Math.max(12, rect.top - gap - h);
    const left = Math.max(12, Math.min(vw - w - 12, rect.left + rect.width / 2 - w / 2));
    setPos({ top, left, origin: below ? 'top' : 'bottom' });
  }, [rect]);

  useEffect(() => {
    const prev = document.activeElement;
    menuRef.current?.querySelector('button')?.focus({ preventScroll: true });
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(menuRef.current?.querySelectorAll('button') || [])];
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.({ preventScroll: true }); };
  }, [onClose]);

  return (
    <div className="ctx-scrim hive-layer" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onContextMenu={(e) => e.preventDefault()}>
      <div className="ctx-preview" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} aria-hidden="true">
        {preview}
      </div>
      <div ref={menuRef} className="ctx-menu" role="menu" aria-label={title ? `${title} actions` : 'Actions'}
        style={pos ? { top: pos.top, left: pos.left, transformOrigin: `center ${pos.origin}` } : { visibility: 'hidden', top: 0, left: 0 }}>
        {actions.map((a, i) => (a.divider
          ? <div key={`d${i}`} className="ctx-divider" role="separator" />
          : (
            <button key={a.label} role="menuitem" className={`ctx-item ${a.danger ? 'danger' : ''}`} onClick={a.onSelect}>
              <span>{a.label}</span>
              {a.checked ? <UI.check /> : a.icon ? <a.icon /> : null}
            </button>
          )))}
      </div>
    </div>
  );
}
