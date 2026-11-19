import { useState } from 'react';
import { APPS } from '@/config/apps';
import { Freshness } from '@/components/board/bits';
import { WX } from '@/components/board/Icons';
import { DAY, daysBetween, fmt, md, plural, startOf, wd } from '@/lib/dates';

const short = (d) => fmt(d, { month: 'short', day: 'numeric' });
import { agendaDays, dedupeEvents, mergeTodos } from '@/lib/agenda';
import { nextBreeding, tripState } from '@/lib/derive';
import { UI } from './glyphs';
import { useWidgetActions } from './live';

export { useLiveBoard } from './live';

const OPTS = { window: 30, breedWindow: 30, awayMiles: 75 };

/**
 * Each widget: the app that owns what it shows (tapping the title opens it
 * there, at `path`), or `url` for something outside Hive (Google Calendar),
 * its label, its default size, and what it shows.
 *
 * Bodies are interactive: lists scroll inside the widget, ticks go to the app
 * that owns the thing (live.js), and nothing is cut off: text wraps, and
 * whatever doesn't fit scrolls.
 */
export const WIDGETS = {
  today: { label: 'Weather', app: 'board', size: 'wide', Body: Today, status: (d) => d.status.weather },
  chores: { label: 'Chores', app: 'galaxyfarm', path: APPS.galaxyfarm.paths.chores, size: 'square', Body: Chores, status: (d) => d.status.chores },
  dinner: { label: 'Dinners', app: 'kitchenhub', path: APPS.kitchenhub.paths.mealPlan, size: 'square', Body: Dinner, status: (d) => d.status.meals },
  shopping: { label: 'Shopping', app: 'kitchenhub', path: APPS.kitchenhub.paths.shopping, size: 'square', Body: Shopping, status: (d) => d.status.shopping },
  trip: { label: 'Trips', app: 'wander', size: 'square', Body: Trip, status: (d) => d.status.trips },
  breeding: { label: 'Breeding', app: 'znt', size: 'square', Body: Breeding, status: (d) => d.status.breeding },
  tasks: { label: 'To do', app: 'learnleaf', path: APPS.learnleaf.paths.tasks, size: 'square', Body: Tasks, status: (d) => [d.status.tasks, d.status.gtasks].find((x) => x?.status !== 'live') || d.status.tasks },
  calendar: { label: 'Calendar', app: 'board', url: 'https://calendar.google.com/', size: 'square', Body: Calendar, status: (d) => d.status.calendar },
};
export const widgetIds = Object.keys(WIDGETS);

/**
 * `onOpen(to)` opens the widget's app; `to` ({ path } or { url }) opens a
 * particular thing instead, like one recipe or one calendar day.
 * `still` (the long-press preview) shows it without scroll bars or actions.
 */
export function Widget({ w, size, data, now, onOpen, color, still }) {
  const def = WIDGETS[w];
  const sz = size || (def.size === 'wide' ? 'm' : 's');
  // A tap on the card that isn't on something it can do opens the app.
  const onBody = (e) => { if (!e.target.closest('.w-act, .w-scroll-x, input, form')) onOpen(); };
  return (
    <div className={`widget size-${sz} ${still ? 'still' : ''}`} style={{ '--tint': color }}>
      <button className="widget-head" onClick={() => onOpen()} aria-label={`Open ${def.label}`}>
        <i aria-hidden="true" /><span>{def.label}</span>
        {data && <Freshness s={def.status(data)} />}
        <UI.chevron />
      </button>
      <div className="widget-body" onClick={onBody}>
        {data ? <def.Body data={data} now={now} size={sz} onOpen={onOpen} /> : <span className="widget-wait">Loading</span>}
      </div>
    </div>
  );
}

/** A list that scrolls inside the widget, with a soft fade where there's more. */
function Scroll({ children, className = '', label }) {
  const [edge, setEdge] = useState({ top: true, end: false });
  const on = (e) => {
    const el = e.currentTarget;
    setEdge({ top: el.scrollTop < 2, end: el.scrollTop + el.clientHeight >= el.scrollHeight - 2 });
  };
  return (
    <div className={`w-scroll ${edge.top ? 'at-top' : ''} ${edge.end ? 'at-end' : ''} ${className}`} onScroll={on} tabIndex={0} aria-label={label}>
      {children}
    </div>
  );
}

function Check({ on, label, onToggle, children, sub, tone }) {
  return (
    <li className={`w-row ${on ? 'is-done' : ''}`}>
      <button className="w-act w-check" onClick={onToggle} role="checkbox" aria-checked={on} aria-label={label}>
        <span className="w-box" aria-hidden="true">{on && <UI.check />}</span>
        <span className="w-text">{children}{sub && <small className={tone || ''}>{sub}</small>}</span>
      </button>
    </li>
  );
}

const Empty = ({ big, sub }) => <div className="w-empty"><div className="w-mid">{big}</div>{sub && <div className="w-sub">{sub}</div>}</div>;
const clock = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const hourLabel = (s, i) => (i === 0 ? 'Now' : new Date(s).toLocaleTimeString(undefined, { hour: 'numeric' }).replace(/\s?([AP])M/i, (m, x) => x.toLowerCase()));
const parseLocal = (s) => { const [d, t = '00:00'] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi); };

/* ---------- weather ---------- */

function Today({ data, now, size }) {
  const wx = data.weather;
  const W = WX[wx.code] ?? WX.cloud;
  const d0 = wx.days[0];
  const hours = wx.hours || [];
  const [tab, setTab] = useState(hours.length ? 'hours' : 'days');
  const days = wx.days.map((d, i) => ({ ...d, label: i === 0 ? 'Today' : wd(d.date ? parseLocal(d.date) : new Date(now.getTime() + i * DAY)) }));
  const lo = Math.min(...days.map((d) => d.lo)), hi = Math.max(...days.map((d) => d.hi));

  const hourCells = hours.map((h, i) => ({ key: h.time, top: hourLabel(h.time, i), code: h.code, main: `${h.temp}°`, rain: h.rain }));
  const dayCells = days.map((d) => ({ key: d.label + d.hi, top: d.label, code: d.code, main: `${d.hi}°`, sub: `${d.lo}°`, rain: d.rain }));
  // Small: one strip, the day by the hour and then the days after it. Medium: a switch.
  const strip = size === 's' ? [...hourCells, ...(hourCells.length ? [{ key: 'gap', gap: true }] : []), ...dayCells.slice(hourCells.length ? 1 : 0)]
    : tab === 'hours' ? hourCells : dayCells;
  const tabs = hours.length > 0 && size === 'm' && (
    <div className="w-tabs" role="tablist">
      <button className="w-act" role="tab" aria-selected={tab === 'hours'} onClick={() => setTab('hours')}>Hourly</button>
      <button className="w-act" role="tab" aria-selected={tab === 'days'} onClick={() => setTab('days')}>{days.length} days</button>
    </div>
  );

  return (
    <div className="w-today">
      <div className="w-now">
        <div>
          <div className="w-big">{wx.now}°</div>
          <div className="w-sub">{size !== 's' && wx.desc && <span className="w-desc">{wx.desc} · </span>}H {d0.hi}° L {d0.lo}°</div>
        </div>
        {size === 'l' && <div className="w-clock"><b>{clock(now)}</b><span>{fmt(now, { weekday: 'long', month: 'short', day: 'numeric' })}</span></div>}
        {size === 'm' ? tabs : <W />}
      </div>
      {size === 'l' ? (
        <>
          {hours.length > 0 && <Strip items={hourCells} />}
          <Scroll className="w-days" label="Forecast by day">
            <ul>
              {days.map((d) => {
                const I = WX[d.code] ?? WX.cloud;
                return (
                  <li key={d.label + d.hi}>
                    <b>{d.label}</b><I />
                    <span className="w-rain">{d.rain >= 20 ? `${d.rain}%` : ''}</span>
                    <span className="w-lo">{d.lo}°</span>
                    <span className="w-range" aria-hidden="true"><i style={{ left: `${((d.lo - lo) / Math.max(1, hi - lo)) * 100}%`, right: `${((hi - d.hi) / Math.max(1, hi - lo)) * 100}%` }} /></span>
                    <span>{d.hi}°</span>
                  </li>
                );
              })}
            </ul>
          </Scroll>
        </>
      ) : <Strip items={strip} />}
    </div>
  );
}

/** Scrolls sideways: hours, or days. */
function Strip({ items }) {
  const rainy = items.some((x) => x.sub || x.rain >= 20);
  return (
    <div className="w-scroll-x" tabIndex={0} aria-label="Forecast">
      {items.map((x) => {
        if (x.gap) return <span className="w-gap" key={x.key} aria-hidden="true" />;
        const I = WX[x.code] ?? WX.cloud;
        return (
          <div className="w-cell" key={x.key}>
            <small>{x.top}</small><I />
            <b>{x.main}</b>
            {x.sub ? <small>{x.sub}</small> : x.rain >= 20 ? <small className="w-rain">{x.rain}%</small> : rainy && <small>&nbsp;</small>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- lists you tick ---------- */

function Chores({ data }) {
  const act = useWidgetActions();
  const list = [...data.chores].sort((a, b) => Number(a.done) - Number(b.done));
  const left = list.filter((c) => !c.done).length;
  if (!list.length) return <Empty big="No chores today" />;
  return (
    <>
      <div className="w-count">{left ? <><b>{left}</b> left</> : <b>All done</b>}</div>
      <Scroll label="Chores"><ul className="w-list">{list.map((c) => (
        <Check key={c.id} on={c.done} label={c.title} onToggle={() => act.chore(c)} sub={c.detail}>{c.title}</Check>
      ))}</ul></Scroll>
    </>
  );
}

function Shopping({ data, size }) {
  const act = useWidgetActions();
  const [name, setName] = useState('');
  const left = data.shopping.filter((i) => !i.bought);
  const got = data.shopping.filter((i) => i.bought);
  const add = (e) => { e.preventDefault(); act.addItem(name); setName(''); };
  return (
    <>
      <div className="w-count">{left.length ? <><b>{left.length}</b> to buy</> : <b>List is empty</b>}</div>
      <Scroll label="Shopping list"><ul className="w-list">
        {[...left, ...got].map((i) => (
          <Check key={i.id} on={i.bought} label={i.name} onToggle={() => act.item(i)} sub={size !== 's' ? [i.qty, i.why && `for ${i.why}`].filter(Boolean).join(' · ') : i.qty}>{i.name}</Check>
        ))}
      </ul></Scroll>
      {size !== 's' && (
        <form className="w-add" onSubmit={add}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item" aria-label="Add to the shopping list" enterKeyHint="done" />
          <button className="w-act" disabled={!name.trim()} aria-label="Add"><UI.plus /></button>
        </form>
      )}
    </>
  );
}

const dueLabel = (t) => (t.n == null ? '' : t.n < -1 ? `${-t.n} days late` : t.n === -1 ? 'Yesterday' : t.n === 0 ? 'Today' : t.n === 1 ? 'Tomorrow' : wd(t.due));

function Tasks({ data, now }) {
  const act = useWidgetActions();
  const all = mergeTodos({ learnleaf: data.tasks, subjects: data.subjects, google: data.gtasks }, now);
  const done = new Set(data.todosDone || []);
  if (!all.length) return <Empty big="Nothing to do" sub="Nothing due this week" />;
  const over = all.filter((t) => t.n != null && t.n < 0 && !done.has(t.key)).length;
  const left = all.filter((t) => !done.has(t.key)).length;
  const rows = [...all].sort((a, b) => Number(done.has(a.key)) - Number(done.has(b.key)));
  return (
    <>
      <div className="w-count"><b>{left}</b> to do{over > 0 && <span className="w-warn"> · {over} overdue</span>}</div>
      <Scroll label="To do"><ul className="w-list">{rows.map((t) => (
        <Check key={t.key} on={done.has(t.key)} label={t.name} onToggle={() => act.todo(t, done.has(t.key))}
          sub={[dueLabel(t), t.time, t.tag].filter(Boolean).join(' · ')} tone={t.n != null && t.n < 0 ? 'w-warn' : ''}>
          {t.name}
        </Check>
      ))}</ul></Scroll>
    </>
  );
}

/* ---------- things to look through ---------- */

const pad = (n) => String(n).padStart(2, '0');
const calDay = (d) => `https://calendar.google.com/calendar/r/day/${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;

function Calendar({ data, now, onOpen }) {
  const days = agendaDays(dedupeEvents(data.events, data.trips).shown, now, 14);
  if (!days.length) return <Empty big="Nothing coming up" sub="The next two weeks are clear" />;
  const at = (e) => (e.allDay ? 'All day' : clock(new Date(e.start)));
  return (
    <Scroll label="Next two weeks">
      {days.map((d) => (
        <section key={d.n} className="w-daygroup">
          <h4>{d.n === 0 ? 'Today' : d.n === 1 ? 'Tomorrow' : md(d.date)}</h4>
          <ul className="w-list">
            {d.events.map((e) => (
              <li key={`${e.id}-${d.n}`}>
                <button className="w-act w-link" onClick={() => onOpen({ url: calDay(d.date) })}>
                  <span className="w-when">{e.continued ? 'Cont.' : at(e)}</span>
                  <span className="w-text">{e.title}{e.location && <small>{e.location}</small>}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Scroll>
  );
}

function Dinner({ data, onOpen }) {
  const week = data.meals.filter((m) => m.type === 'Dinner' && m.d >= 0 && m.d < 7).sort((a, b) => a.d - b.d);
  if (!week.length) return <Empty big="Nothing planned" sub="Plan the week in KitchenHub" />;
  const day = (n) => (n === 0 ? 'Tonight' : n === 1 ? 'Tomorrow' : wd(new Date(Date.now() + n * DAY)));
  return (
    <Scroll label="Dinners this week">
      <ul className="w-list w-meals">
        {week.map((m) => {
          const r = m.recipe && data.recipes[m.recipe];
          return (
            <li key={`${m.d}-${m.name}`} className={m.d === 0 ? 'w-tonight' : ''}>
              <button className="w-act w-link" onClick={() => onOpen({ path: m.recipe ? APPS.kitchenhub.paths.recipe(m.recipe) : APPS.kitchenhub.paths.mealPlan })}>
                <span className="w-when">{day(m.d)}</span>
                <span className="w-text">{m.name}{r && <small>{[r.time, r.cal && `${r.cal} cal`].filter(Boolean).join(' · ')}</small>}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Scroll>
  );
}

function Trip({ data, now, onOpen }) {
  const ts = tripState(data.trips, data.home, now, OPTS);
  const trips = ts.all.filter((t) => t.current || t.until >= 0).sort((a, b) => Number(b.current) - Number(a.current) || a.until - b.until);
  if (!trips.length) return <Empty big="No trips planned" sub="Plan one in Wander" />;
  const when = (t) => (t.current ? 'Now' : t.until === 0 ? 'Today' : t.until === 1 ? 'Tomorrow' : `${t.until} days`);
  return (
    <Scroll label="Upcoming trips">
      <ul className="w-list w-trips">
        {trips.map((t) => (
          <li key={t.id}>
            <button className="w-act w-link" onClick={() => onOpen({ path: APPS.wander.paths.trip(t.id) })}>
              <span className="w-when">{when(t)}</span>
              <span className="w-text">{t.name}<small>{[t.dest, t.startD && `${short(t.startD)}${t.endD && +t.endD !== +t.startD ? `–${short(t.endD)}` : ''}`].filter(Boolean).join(' · ')}</small></span>
            </button>
          </li>
        ))}
      </ul>
    </Scroll>
  );
}

function Breeding({ data, now }) {
  const ts = tripState(data.trips, data.home, now, OPTS);
  const b = nextBreeding(data.sessions, ts, now, { ...OPTS, breedWindow: 365 });
  if (!b) return <Empty big="Nothing scheduled" sub="No upcoming CIDRs" />;
  const today = startOf(now);
  const steps = [['CIDRs in', b.cidr], ['Lutalyse', b.lut], ['Breed', b.b1], ['Breed again', b.b2]];
  const n = daysBetween(today, b.cidr);
  return (
    <>
      <Scroll label={b.name}>
        <div className="w-count"><b>{b.name}</b> {n <= 0 ? 'under way' : n === 1 ? 'tomorrow' : `in ${n} days`}</div>
        {b.clash.map((c) => <p key={c} className="w-sub w-warn">{c}</p>)}
        <ul className="w-list w-steps">
          {steps.map(([what, d]) => (
            <li key={what} className={d < today ? 'is-done' : ''}><span className="w-text">{what}<small>{md(d)}</small></span></li>
          ))}
        </ul>
        <p className="w-sub">{plural(b.head, 'head')}: {b.groups.map(([g, k]) => `${g} ${k}`).join(', ')}</p>
        {b.notes && <p className="w-sub">{b.notes}</p>}
      </Scroll>
    </>
  );
}
