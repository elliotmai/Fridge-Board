import { useEffect, useRef, useState } from 'react';
import { CATALOG, appLook } from '@/config/catalog';
import { useTheme } from '@/context/ThemeContext';
import { AppIcon } from './Home';
import { GLYPHS } from './glyphs';
import { setCustom } from './layout';
import { WALLPAPERS, photoToWallpaper } from './look';

/** Escape closes, focus goes inside, and back where it was after. */
function useSheet(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('button, input')?.focus({ preventScroll: true });
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); prev?.focus?.({ preventScroll: true }); };
  }, [onClose]);
  return ref;
}

function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} aria-selected={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="set-row">
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" className="switch-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Wallpaper & Home Screen. Every change shows on the home screen behind the sheet as you make it. */
export function AppearanceSheet({ look, setLook, photo, setPhoto, onClose }) {
  const ref = useSheet(onClose);
  const { theme, setTheme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (v) => setLook((l) => ({ ...l, [k]: v }));

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const p = await photoToWallpaper(file);
      setPhoto(p);
      setLook((l) => ({ ...l, wallpaper: 'photo' }));
    } catch {
      setErr('That photo couldn’t be used. Try a JPEG or PNG.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim hive-layer see-through" onClick={onClose}>
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label="Wallpaper and Home Screen" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>Wallpaper &amp; Home Screen</h2><button className="pill" onClick={onClose}>Done</button></div>

        <h3 className="sheet-sub">Wallpaper</h3>
        <div className="walls">
          {Object.entries(WALLPAPERS).map(([k, w]) => (
            <button key={k} className={`wall ${look.wallpaper === k ? 'on' : ''}`} onClick={() => set('wallpaper')(k)} aria-pressed={look.wallpaper === k}>
              <span className="wall-swatch" style={{ background: w.css }} />
              <small>{w.name}</small>
            </button>
          ))}
          <label className={`wall ${look.wallpaper === 'photo' ? 'on' : ''}`}>
            <span className="wall-swatch wall-photo" style={photo ? { backgroundImage: `url(${photo.dataUrl})` } : undefined}>{!photo && '+'}</span>
            <small>{busy ? 'Loading…' : photo ? 'Your photo' : 'Choose photo'}</small>
            <input type="file" accept="image/*" hidden onChange={pick} />
          </label>
        </div>
        {photo && look.wallpaper === 'photo' && <button className="link-btn" onClick={() => { setPhoto(null); set('wallpaper')('honey'); }}>Remove your photo</button>}
        {err && <p className="auth-msg bad" role="alert">{err}</p>}
        <Toggle label="Dim wallpaper" hint="Darker behind the icons, easier on the eyes at night." checked={look.dim} onChange={set('dim')} />

        <h3 className="sheet-sub">Icons</h3>
        <div className="set-row stack"><span><b>Size</b></span><Seg label="Icon size" value={look.iconSize} onChange={set('iconSize')} options={[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]} /></div>
        <div className="set-row stack"><span><b>Columns</b><small>Auto fits the screen: 4 on a phone, more on a tablet.</small></span>
          <Seg label="Columns" value={look.cols} onChange={set('cols')} options={[['auto', 'Auto'], ['4', '4'], ['5', '5'], ['6', '6'], ['8', '8']]} /></div>
        <Toggle label="Show names under icons" checked={look.labels} onChange={set('labels')} />
        <Toggle label="Badges" hint="Counts on icons, like chores left or things to buy." checked={look.badges} onChange={set('badges')} />

        <h3 className="sheet-sub">Home Screen</h3>
        <Toggle label="Dock" checked={look.dock} onChange={set('dock')} />
        <Toggle label="Search" hint="Swipe down, or tap the dots, to search apps and everything in them." checked={look.search} onChange={set('search')} />
        <Toggle label="App Library" hint="A last page with every app, grouped." checked={look.library} onChange={set('library')} />
        <div className="set-row stack"><span><b>Appearance</b></span>
          <Seg label="Theme" value={theme} onChange={setTheme} options={[['light', 'Light'], ['dark', 'Dark']]} /></div>
      </div>
    </div>
  );
}

const SWATCHES = ['#2f7a4a', '#3d6b2f', '#9c3a5c', '#c2553a', '#c27c0e', '#b77a0c', '#1f7fa6', '#2c5e9e', '#4b3b78', '#8e2f3c', '#355147', '#24292f', '#56606b', '#8e8e93'];

/** Rename an app and change its icon's colour and glyph. Changes apply as you go. */
export function IconEditor({ id, layout, setLayout, onClose }) {
  const ref = useSheet(onClose);
  const custom = layout.custom || {};
  const now = appLook(id, custom);
  const base = CATALOG[id] || {};
  const [name, setName] = useState(custom[id]?.name || '');
  const patch = (p) => setLayout((l) => setCustom(l, id, p));

  return (
    <div className="scrim hive-layer see-through" onClick={onClose}>
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label={`Edit ${now.name} icon`} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>Edit Icon</h2><button className="pill" onClick={onClose}>Done</button></div>
        <div className="icon-preview"><AppIcon id={id} custom={custom} size={88} /><b>{now.name}</b></div>

        <label className="auth-form"><span className="field-label">Name</span>
          <input value={name} placeholder={base.name} maxLength={40}
            onChange={(e) => { setName(e.target.value); patch({ name: e.target.value }); }} />
        </label>

        <h3 className="sheet-sub">Colour</h3>
        <div className="swatches">
          {SWATCHES.map((c) => (
            <button key={c} className={`swatch ${now.color.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => patch({ color: c })} />
          ))}
          <label className="swatch swatch-custom" aria-label="Pick any colour">
            <input type="color" value={now.color} onChange={(e) => patch({ color: e.target.value })} />
          </label>
        </div>

        <h3 className="sheet-sub">Symbol</h3>
        <div className="glyph-grid">
          {Object.keys(GLYPHS).map((g) => {
            const G = GLYPHS[g];
            return (
              <button key={g} className={`glyph-pick ${now.glyph === g ? 'on' : ''}`} style={{ '--c': now.color }} aria-label={g} onClick={() => patch({ glyph: g })}>
                <G />
              </button>
            );
          })}
        </div>

        <button className="pill wide" onClick={() => { setName(''); patch(null); }} disabled={!custom[id]}>Reset to {base.name}’s own icon</button>
      </div>
    </div>
  );
}
