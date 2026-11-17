import { FEEDBACK_URL } from '@/config/app';
import { useTheme } from '@/context/ThemeContext';
import { md } from '@/lib/dates';
import { Close } from './Icons';

export function SettingsDrawer({ opts, setOpts, now, onClose, onReset }) {
  const { theme, setTheme } = useTheme();
  const set = (k) => (e) => setOpts((o) => ({ ...o, [k]: e.target.type === 'checkbox' ? e.target.checked : Math.max(1, +e.target.value || o[k]) }));
  return (
    <aside className="drawer fb-layer" aria-label="Board settings">
      <div className="drawer-head"><h2>Board settings</h2><button className="round" aria-label="Close settings" onClick={onClose}><Close /></button></div>
      <label className="field">Pretend today is <output>{opts.offset === 0 ? 'today' : `${md(now)}, ${opts.offset > 0 ? '+' : ''}${opts.offset} days`}</output>
        <input type="range" min="-3" max="16" step="1" value={opts.offset} onChange={(e) => setOpts((o) => ({ ...o, offset: +e.target.value }))} />
        <small>Slide to day 3 for the lake trip, which is close to home, so nothing changes. Slide to day 10 for Asheville: the away banner shows and housesitter mode turns on.</small>
      </label>
      <label className="field">Show trips starting within this many days
        <input type="number" min="1" max="120" value={opts.window} onChange={set('window')} />
      </label>
      <label className="field">Show the next breeding group when CIDRs go in within this many days
        <input type="number" min="1" max="120" value={opts.breedWindow} onChange={set('breedWindow')} />
      </label>
      <label className="field">Count a trip as away when it&apos;s more than this many miles from home
        <input type="number" min="1" max="2000" value={opts.awayMiles} onChange={set('awayMiles')} />
        <small>The lake is about 25 miles away in this sample. Asheville is about 860.</small>
      </label>
      <label className="toggle-row">Turn on housesitter mode while away
        <input type="checkbox" checked={opts.autoSitter} onChange={set('autoSitter')} />
      </label>
      <label className="field">Theme
        <select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select>
      </label>
      <button className="reset" onClick={onReset}>Clear ticks and added items</button>
      <p className="hint">The board shows sample data until each app is connected. Ticks and settings stay on this device.</p>
      <a className="feedback" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Report a bug or request a feature</a>
    </aside>
  );
}
