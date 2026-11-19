import { useEffect, useState } from 'react';
import { APPS } from '@/config/apps';
import { loadBoard, REFRESH_MS } from '@/data/sources';
import { takeKeyFromUrl } from '@/data/api';
import { USER_CHANGED } from './account';
import { Freshness } from '@/components/board/bits';
import { WX } from '@/components/board/Icons';
import { DAY, daysBetween, fmt, plural, startOf, wd } from '@/lib/dates';
import { agendaDays, dedupeEvents, mergeTodos } from '@/lib/agenda';
import { nextBreeding, tripState } from '@/lib/derive';

/** The board's feed, for widgets. Same source, same refresh rhythm as the board. */
export function useBoardData() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () => loadBoard().then((d) => live && setData(d));
    takeKeyFromUrl();
    load();
    const id = setInterval(load, REFRESH_MS);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener(USER_CHANGED, load);
    return () => { live = false; clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener(USER_CHANGED, load); };
  }, []);
  return data;
}

const OPTS = { window: 30, breedWindow: 30, awayMiles: 75 };

/**
 * Each widget: the app that owns what it shows (tapping opens it there, at
 * `path`), or `url` for something outside Hive (Google Calendar), its label,
 * its default size, and what it shows.
 */
export const WIDGETS = {
  today: { label: 'Today', app: 'board', size: 'wide', Body: Today, status: (d) => d.status.weather },
  chores: { label: 'Chores', app: 'galaxyfarm', path: APPS.galaxyfarm.paths.chores, size: 'square', Body: Chores, status: (d) => d.status.chores },
  dinner: { label: 'Tonight', app: 'kitchenhub', path: APPS.kitchenhub.paths.mealPlan, size: 'square', Body: Dinner, status: (d) => d.status.meals },
  shopping: { label: 'Shopping', app: 'kitchenhub', path: APPS.kitchenhub.paths.shopping, size: 'square', Body: Shopping, status: (d) => d.status.shopping },
  trip: { label: 'Next trip', app: 'wander', size: 'square', Body: Trip, status: (d) => d.status.trips },
  breeding: { label: 'Breeding', app: 'znt', size: 'square', Body: Breeding, status: (d) => d.status.breeding },
  tasks: { label: 'To do', app: 'learnleaf', path: APPS.learnleaf.paths.tasks, size: 'square', Body: Tasks, status: (d) => [d.status.tasks, d.status.gtasks].find((x) => x?.status !== 'live') || d.status.tasks },
  calendar: { label: 'Calendar', app: 'board', url: 'https://calendar.google.com/', size: 'square', Body: Calendar, status: (d) => d.status.calendar },
};
export const widgetIds = Object.keys(WIDGETS);

/** How many list lines fit: a large widget is twice as tall as a small one. */
const LINES = { s: 3, m: 3, l: 9 };

export function Widget({ w, size, data, now, onOpen, color }) {
  const def = WIDGETS[w];
  const sz = size || (def.size === 'wide' ? 'm' : 's');
  return (
    <div className={`widget size-${sz}`} style={{ '--tint': color }}>
      <div className="widget-head">
        <i aria-hidden="true" />{def.label}
        {data && <Freshness s={def.status(data)} />}
      </div>
      <button className="widget-body" onClick={() => onOpen(def)} aria-label={`${def.label}: open`}>
        {data ? <def.Body data={data} now={now} max={LINES[sz]} size={sz} /> : <span className="widget-wait">Loading</span>}
      </button>
    </div>
  );
}

function Today({ data, now }) {
  const W = WX[data.weather.code] ?? WX.cloud;
  const d0 = data.weather.days[0];
  return (
    <div className="w-today">
      <div>
        <div className="w-big">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
        <div className="w-sub">{fmt(now, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </div>
      <div className="w-wx">
        <W />
        <div><div className="w-big">{data.weather.now}°</div><div className="w-sub">{d0.hi}° / {d0.lo}°</div></div>
      </div>
      <div className="w-days">
        {data.weather.days.map((d, i) => {
          const I = WX[d.code] ?? WX.cloud;
          return <div className="w-day" key={i}><b>{i === 0 ? 'Today' : wd(new Date(now.getTime() + i * DAY))}</b><I /><span>{d.hi}°</span></div>;
        })}
      </div>
    </div>
  );
}

function Chores({ data, max = 3 }) {
  const open = data.chores.filter((c) => !c.done);
  if (!open.length) return <><div className="w-big">All done</div><div className="w-sub">Every chore for today</div></>;
  return (
    <>
      <div className="w-big">{open.length}<small> left</small></div>
      <ul className="w-list">{open.slice(0, max).map((c) => <li key={c.id}>{c.title}</li>)}</ul>
    </>
  );
}

function Dinner({ data }) {
  const m = data.meals.find((x) => x.d === 0 && x.type === 'Dinner');
  if (!m) return <><div className="w-mid">Nothing planned</div><div className="w-sub">Plan it in KitchenHub</div></>;
  const r = m.recipe && data.recipes[m.recipe];
  const next = data.meals.find((x) => x.d === 1 && x.type === 'Dinner');
  return (
    <>
      <div className="w-mid">{m.name}</div>
      {r && <div className="w-sub">{r.time}{r.cal ? ` · ${r.cal} cal` : ''}</div>}
      {next && <div className="w-sub w-next">Tomorrow: {next.name}</div>}
    </>
  );
}

function Shopping({ data, max = 3 }) {
  const left = data.shopping.filter((i) => !i.bought);
  if (!left.length) return <><div className="w-big">0</div><div className="w-sub">The list is empty</div></>;
  return (
    <>
      <div className="w-big">{left.length}<small> to buy</small></div>
      <ul className="w-list">{left.slice(0, max).map((i) => <li key={i.id}>{i.name}</li>)}</ul>
    </>
  );
}

function Trip({ data, now }) {
  const ts = tripState(data.trips, data.home, now, OPTS);
  const t = ts.all.find((x) => x.current) || [...ts.shown, ...ts.later].find((x) => x.until >= 0);
  if (!t) return <><div className="w-mid">No trips planned</div><div className="w-sub">Plan one in Wander</div></>;
  return (
    <>
      <div className="w-big">{t.current ? 'Now' : t.until === 0 ? 'Today' : t.until}{!t.current && t.until > 0 && <small> {t.until === 1 ? 'day' : 'days'}</small>}</div>
      <div className="w-mid">{t.name}</div>
      <div className="w-sub">{t.dest}</div>
    </>
  );
}

function Breeding({ data, now }) {
  const ts = tripState(data.trips, data.home, now, OPTS);
  const b = nextBreeding(data.sessions, ts, now, { ...OPTS, breedWindow: 365 });
  if (!b) return <><div className="w-mid">Nothing scheduled</div><div className="w-sub">No upcoming CIDRs</div></>;
  const n = daysBetween(startOf(now), b.cidr);
  return (
    <>
      <div className="w-big">{n <= 0 ? 'Now' : n}{n > 0 && <small> {n === 1 ? 'day' : 'days'}</small>}</div>
      <div className="w-mid">{b.name}</div>
      <div className={`w-sub ${b.clash.length ? 'w-warn' : ''}`}>{b.clash[0] || `CIDRs ${wd(b.cidr)}, ${plural(b.head, 'head')}`}</div>
    </>
  );
}

function Tasks({ data, now, max = 3 }) {
  const all = mergeTodos({ learnleaf: data.tasks, subjects: data.subjects, google: data.gtasks }, now);
  const due = all.filter((t) => t.n != null);
  const over = due.filter((t) => t.n < 0).length;
  if (!all.length) return <><div className="w-big">0</div><div className="w-sub">Nothing due this week</div></>;
  const shown = (due.length ? due : all).slice(0, over ? max - 1 : max);
  return (
    <>
      <div className="w-big">{due.length || all.length}<small> {due.length ? 'this week' : 'to do'}</small></div>
      {over > 0 && <div className="w-sub w-warn">{over} overdue</div>}
      <ul className="w-list">{shown.map((t) => <li key={t.key}>{t.name}</li>)}</ul>
    </>
  );
}

function Calendar({ data, now, max = 3 }) {
  const days = agendaDays(dedupeEvents(data.events, data.trips).shown, now, 7);
  if (!days.length) return <><div className="w-mid">Nothing this week</div><div className="w-sub">Your calendar is clear</div></>;
  const first = days[0];
  const label = first.n === 0 ? 'Today' : first.n === 1 ? 'Tomorrow' : wd(first.date);
  const rows = days.flatMap((d) => d.events.filter((e) => !e.continued).map((e) => ({ ...e, d }))).slice(0, max);
  const at = (e) => (e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
  return (
    <>
      <div className="w-mid">{label}</div>
      <ul className="w-list w-cal">{rows.map((e) => <li key={`${e.id}-${e.d.n}`}><b>{e.d.n === first.n ? at(e) : wd(e.d.date)}</b> {e.title}</li>)}</ul>
    </>
  );
}
