import { APPS, appLink } from '@/config/apps';
import { DAY, fmt, md, wd } from '@/lib/dates';
import { Freshness } from './bits';
import { HomeIcon, Plane, Sliders, Snow, WX } from './Icons';

const APP_DOTS = { galaxyfarm: 'var(--farm)', kitchenhub: 'var(--kitchen)', learnleaf: 'var(--ahead)', wander: 'var(--ahead)', znt: 'var(--farm)' };

export function Header({ now, weather, weatherStatus, sitter, onToggleSitter, onOpenSettings, onHome, phone }) {
  const parts = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).match(/^(.*?)\s?([AP]M)?$/i);
  const W = WX[weather.code] ?? WX.cloud;
  const today = weather.days[0];
  return (
    <>
      <header className="top">
        <div className="clock">
          <div className="time">{parts[1]}{parts[2] && <small>{parts[2].toLowerCase()}</small>}</div>
          <div className="date">{fmt(now, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <div className="wx">
          <div className="wx-now">
            <W />
            <span className="wx-temp">{weather.now}°</span>
            <span className="wx-desc">
              <b>{weather.desc}</b>
              <span>High {today.hi}°, low {today.lo}°</span>
              {today.lo <= 34 && <span className="frost-line"><Snow />Frost tonight</span>}
              <Freshness s={weatherStatus} />
            </span>
          </div>
          <div className="wx-days">
            {weather.days.slice(1, 4).map((d, i) => {
              const I = WX[d.code] ?? WX.cloud;
              return <div className="wx-day" key={i}><b>{wd(new Date(now.getTime() + (i + 1) * DAY))}</b><I /><span>{d.hi}° {d.lo}°</span></div>;
            })}
          </div>
        </div>
        <div className="top-end">
          <button className="mode" aria-pressed={sitter} onClick={onToggleSitter}>
            <span className="long">Housesitter mode</span><span className="short">Sitter</span>
            <span className="switch" aria-hidden="true" />
          </button>
          <button className="round" aria-label="Board settings" onClick={onOpenSettings}><Sliders /></button>
          {onHome && <button className="round" aria-label="Hive home screen" onClick={onHome}><HomeIcon /></button>}
        </div>
      </header>
      {phone && !onHome && (
        <nav className="apps" aria-label="Open an app">
          {Object.entries(APPS).map(([k, a]) => (
            <a key={k} href={appLink(k, '')} target="_blank" rel="noopener noreferrer" style={{ '--dot': APP_DOTS[k] }}><i />{a.name}</a>
          ))}
        </nav>
      )}
    </>
  );
}

/** One strip under the header: where you are when away, and that housesitter mode is on. */
export function AwayBanner({ trip, sitter, onTurnOff }) {
  if (!trip && !sitter) return null;
  return (
    <div className={`away ${trip ? '' : 'sitter-only'}`}>
      {trip && <Plane />}
      <strong>{trip ? `Away in ${trip.dest}` : 'Housesitter mode'}</strong>
      <span>{trip ? `Back ${md(trip.endD)}` : 'Meals, shopping and personal tasks are hidden'}{trip && sitter ? '. Housesitter mode is on.' : '.'}</span>
      {sitter && <button className="away-off" onClick={onTurnOff}>Turn off</button>}
    </div>
  );
}
