import { useEffect, useRef, useState } from 'react';
import { CATALOG, appLook } from '@/config/catalog';
import { useTheme } from '@/context/ThemeContext';
import { AppIcon } from './Apps';
import { GLYPHS } from './glyphs';
import { setCustom } from './arrange';
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

/** Background & look. Every change shows on the home screen behind the sheet as you make it. */
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
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label="Background and look" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>Background &amp; look</h2><button className="pill" onClick={onClose}>Done</button></div>

        <h3 className="sheet-sub">Background</h3>
        <p className="sheet-note">Shows around the edges and behind the clock. The day itself stays on plain panels, so it reads the same on any background.</p>
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
        <Toggle label="Dim the background" hint="Darker around the panels, easier on the eyes at night." checked={look.dim} onChange={set('dim')} />

        <h3 className="sheet-sub">Counts</h3>
        <Toggle label="Show counts beside apps" hint="Chores left, things to buy, tasks due." checked={look.badges} onChange={set('badges')} />

        <h3 className="sheet-sub">Apps</h3>
        <Toggle label="Open apps inside Hive" checked={look.inside !== false} onChange={set('inside')}
          hint="On: every app opens inside Hive. Off: every app opens in its own tab. To choose for one app, press and hold it in the app list." />

        <h3 className="sheet-sub">Appearance</h3>
        <div className="set-row stack"><span><b>Light or dark</b></span>
          <Seg label="Theme" value={theme} onChange={setTheme} options={[['light', 'Light'], ['dark', 'Dark']]} /></div>
      </div>
    </div>
  );
}

const SWATCHES = ['#2f7a4a', '#3d6b2f', '#9c3a5c', '#c2553a', '#c27c0e', '#b77a0c', '#1f7fa6', '#2c5e9e', '#4b3b78', '#8e2f3c', '#355147', '#24292f', '#56606b', '#8e8e93'];

/** Rename an app and change its icon's colour and glyph. Changes apply as you go. */
export function IconEditor({ id, arrangement, setArrangement, onClose }) {
  const ref = useSheet(onClose);
  const custom = arrangement.custom || {};
  const now = appLook(id, custom);
  const base = CATALOG[id] || {};
  const [name, setName] = useState(custom[id]?.name || '');
  const patch = (p) => setArrangement((a) => setCustom(a, id, p));

  return (
    <div className="scrim hive-layer see-through" onClick={onClose}>
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-label={`Edit ${now.name} icon`} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>Edit icon</h2><button className="pill" onClick={onClose}>Done</button></div>
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
