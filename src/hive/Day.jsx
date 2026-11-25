import { useLayoutEffect, useRef, useState } from 'react';
import { APPS } from '@/config/apps';
import { CheckRow, Freshness } from '@/components/board/bits';
import { Plane, WX } from '@/components/board/Icons';
import { minutesOf } from '@/lib/agenda';
import { daysBetween, md, plural, startOf, wd } from '@/lib/dates';
import { choresNow, comingUp, dayLine, dinners, herdAlert, notUpdating, shoppingNow, tasksNow, upNext, useSoon } from '@/lib/day';
import { AppIcon } from './Apps';
import { UI } from './glyphs';
import { useWidgetActions } from './live';

/* The household's day: the header (time, weather, what's next), the day
   line, and the three things people come to the screen for. Every part
   opens the app that owns it; ticks go back to that app (live.js). */

const ampm = (d) => {
  const [, t, ap] = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).match(/^(.*?)\s?([AP]M)?$/i) || [];
  return { t, ap: ap?.toLowerCase() };
};
/** Minutes after midnight as "4 pm" or "4:30 pm". */
const hm = (min) => {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
};
const dayName = (n, date) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : md(date));

/* ------------------------------------------------------------ header --- */

export function DayHeader({ data, now, onOpen, onSearch, account, onSettings }) {
  const { t, ap } = ampm(now);
  const next = data ? upNext(data, now) : null;
  const wx = data?.weather;
  const W = wx ? WX[wx.code] ?? WX.cloud : null;
  const d0 = wx?.days?.[0];
  const signIn = account?.on && account.ready && !account.user?.verified;
  return (
    <header className="day-head">
      <div className="day-when">
        <time className="day-clock" dateTime={now.toISOString()}>{t}{ap && <small>{ap}</small>}</time>
        <p className="day-date">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {next && (
        <button className="day-next" onClick={() => openPin(next, onOpen)}>
          <span className="day-next-k">{next.when === 'now' ? 'Now' : 'Next'}</span>
          <span className="day-next-v">
            {next.title}
            <small>{next.when === 'now' ? `until ${hm(next.until)}` : next.kind === 'chores' ? `by ${hm(next.at)}` : `at ${hm(next.at)}`}{next.event?.location ? `, ${next.event.location}` : ''}</small>
          </span>
        </button>
      )}

      {wx && (
        <div className="day-wx">
          <W />
          <span className="day-wx-t">{wx.now}°</span>
          <span className="day-wx-d">
            {wx.desc && <b>{wx.desc}</b>}
            {d0 && <span>High {d0.hi}°, low {d0.lo}°{rainNote(wx, now)}</span>}
            <Freshness s={data.status.weather} />
          </span>
        </div>
      )}

      <div className="day-tools">
        <button className="tool tool-search" onClick={() => onSearch('')} aria-keyshortcuts="/">
          <UI.search /><span>Search</span>
        </button>
        {account?.on && (
          <button className={`tool ${signIn ? 'tool-strong' : ''}`} onClick={account.open} disabled={!account.ready}
            aria-label={signIn ? undefined : `Hive account, ${account.user?.name || account.user?.email || ''}`}>
            {signIn ? (account.user ? 'Confirm email' : 'Sign in') : <span className="avatar" aria-hidden="true">{(account.user?.name || account.user?.email || '?').slice(0, 1).toUpperCase()}</span>}
          </button>
        )}
        <button className="tool tool-icon" onClick={onSettings} aria-label="Settings"><GearIcon /></button>
      </div>
    </header>
  );
}

const GearIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /><circle cx="12" cy="12" r="6.4" /></svg>;

/** ", rain likely from 6 pm" when the next hours say so. */
function rainNote(wx, now) {
  const h = (wx.hours || []).find((x) => x.rain >= 50 && new Date(x.time) >= new Date(now.getTime() - 3600e3));
  if (!h) return '';
  const d = new Date(h.time);
  return daysBetween(startOf(now), d) === 0 ? `, rain likely from ${hm(d.getHours() * 60)}` : '';
}

function openPin(p, onOpen) {
  if (p.kind === 'chores') return onOpen('galaxyfarm', null, APPS.galaxyfarm.paths.chores);
  if (p.kind === 'task') return p.task.source === 'learnleaf' ? onOpen('learnleaf', null, APPS.learnleaf.paths.tasks) : onOpen('board');
  return onOpen('board'); // calendar events: Google Calendar can't be shown inside Hive; the board shows them
}

/* ---------------------------------------------------------- day line --- */

/**
 * The day from 5 am to midnight: the chore slots end to end, a mark for now,
 * and today's timed events pinned where they happen. The one picture to read
 * from across the room: where we are in the day and what's still left.
 */
export function DayLine({ data, now, onOpen }) {
  const line = dayLine(data, now);
  const span = line.to - line.from;
  const x = (m) => `${((Math.min(line.to, Math.max(line.from, m)) - line.from) / span) * 100}%`;
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Labels that would overlap go on a second row; past that they share it.
  // Near the right end a label hangs to the left of its time (`flip`).
  const lanes = [];
  const pins = line.pins.map((p) => {
    const px = ((p.at - line.from) / span) * w;
    const lw = Math.min(260, 70 + p.title.length * 9) + 12;
    const flip = p.at - line.from > span * 0.78;
    const [a, b] = flip ? [px - lw, px] : [px, px + lw];
    let lane = lanes.findIndex((end) => a >= end);
    if (lane < 0) lane = lanes.length < 2 ? lanes.length : 1;
    lanes[lane] = b;
    return { ...p, lane, flip };
  });
  const slotState = (s) => (s.to <= line.now ? (s.left ? 'late' : 'past') : s.from <= line.now ? 'now' : 'ahead');
  const said = (s, st) => `${s.label}, ${hm(s.from)} to ${hm(s.to)}: ${s.total ? (s.left ? `${plural(s.left, 'chore')} left${st === 'late' ? ', late' : ''}` : 'chores done') : 'no chores'}`;
  return (
    <section className="dayline" aria-label="Today">
      <div className="dl-band" ref={ref}>
        {line.slots.map((s) => {
          const st = slotState(s);
          return (
            <button key={s.key} className={`dl-slot is-${st} ${st === 'now' && line.now - s.from < (s.to - s.from) / 2 ? 'text-end' : ''}`} style={{ flexGrow: s.to - s.from }}
              onClick={() => onOpen('galaxyfarm', null, APPS.galaxyfarm.paths.chores)} aria-label={said(s, st)}>
              <b>{s.label}</b>
              <small>{!s.total ? 'No chores' : s.left ? `${s.left} left` : 'Done'}</small>
            </button>
          );
        })}
        <i className="dl-now" style={{ left: x(line.now) }} aria-hidden="true" />
      </div>
      {pins.length > 0 && (
        <ol className={`dl-pins lanes-${Math.max(1, lanes.length)}`}>
          {pins.map((p) => (
            <li key={p.key} className={`dl-pin is-${p.kind} lane-${p.lane} ${p.until <= line.now && p.kind === 'event' ? 'is-over' : ''}`}
              style={{ left: x(p.at), ...(p.flip ? { '--flip': 1 } : {}) }}>
              <button onClick={() => openPin(p, onOpen)} aria-label={`${hm(p.at)}, ${p.title}`}>
                <small>{hm(p.at)}</small><b>{p.title}</b>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* --------------------------------------------------- needs someone --- */

const CAP = 6; // rows shown before "Show all"

function GroupHead({ app, title, sub, status, onOpen, path, count }) {
  return (
    <h3 className="g-head">
      <button onClick={() => onOpen(app, null, path)}>
        <AppIcon id={app} size={28} />
        <span className="g-title">{title}{sub && <small>{sub}</small>}</span>
        {count != null && <span className="g-count">{count}</span>}
        {status && <Freshness s={status} />}
        <UI.chevron />
      </button>
    </h3>
  );
}

/**
 * What needs someone, soonest first: this slot's chores, what's due, what to
 * buy, the herd. Ticks happen right here.
 */
export function Needs({ data, now, on, onOpen }) {
  const act = useWidgetActions();
  const [item, setItem] = useState('');
  const [showAllShop, setShowAllShop] = useState(false);
  const [showAllChores, setShowAllChores] = useState(false);
  const chores = choresNow(data.chores, now);
  const tasks = tasksNow(data, now);
  const shop = shoppingNow(data.shopping);
  const herd = herdAlert(data, now);
  const soon = useSoon(data.expiring);
  const stale = notUpdating(data.status);
  const slotName = { morning: 'this morning', midday: 'by 2 pm', evening: 'this evening', night: 'tonight' };

  const onlyTonight = !showAllShop && shop.tonight.length > 0;
  const shopRows = showAllShop ? shop.left : shop.tonight.length ? shop.tonight : shop.left.slice(0, 3);
  const nothing = !chores.left && !tasks.some((t) => !t.done) && !shop.left.length && !herd && !soon.length;

  return (
    <section className="panel p-needs" aria-labelledby="h-needs">
      <h2 className="panel-title" id="h-needs">Needs someone</h2>
      <div className="panel-body">
        {data.locked && (
          <p className="h-note warn">
            Hive can&apos;t read the household&apos;s apps on this device yet.{' '}
            <button className="link-btn inline" onClick={() => onOpen('board')}>Enter the board key in Fridge Board</button>
          </p>
        )}

        {on('chores') && (
          <div className="group g-farm">
            <GroupHead app="galaxyfarm" title="Chores" sub={chores.left ? `${chores.left} to do ${slotName[chores.slot]}` : chores.allDone ? 'All done for today' : `Nothing due ${slotName[chores.slot]}`}
              status={data.status.chores} onOpen={onOpen} path={APPS.galaxyfarm.paths.chores} />
            {chores.rows.length > 0 && (
              <ul className="rows">
                {(showAllChores ? chores.rows : chores.rows.slice(0, CAP)).map((c) => (
                  <li key={c.id}>
                    <CheckRow checked={!!c.done} late={c.late} onToggle={() => act.chore(c)}
                      end={c.late && <span className="h-tag late">{c.slot === 'owed' ? 'Still owed' : 'Late'}</span>}>
                      {c.title}{c.detail && <small>{c.detail}</small>}
                    </CheckRow>
                  </li>
                ))}
              </ul>
            )}
            {chores.rows.length > CAP && (
              <button className="more more-btn" aria-expanded={showAllChores} onClick={() => setShowAllChores((v) => !v)}>
                {showAllChores ? 'Show fewer' : `Show all ${chores.rows.length}`}
              </button>
            )}
            {chores.later > 0 && <p className="more">{plural(chores.later, 'more chore')} later today</p>}
          </div>
        )}

        {on('tasks') && tasks.length > 0 && (
          <div className="group g-ahead">
            <GroupHead app="learnleaf" title="To do" sub={`${tasks.filter((t) => !t.done).length} due today or late`} status={tasks.some((t) => t.source === 'google') ? data.status.gtasks : data.status.tasks}
              onOpen={onOpen} path={APPS.learnleaf.paths.tasks} />
            <ul className="rows">
              {tasks.map((t) => (
                <li key={t.key}>
                  <CheckRow checked={t.done} late={t.late && !t.done} onToggle={() => act.todo(t, t.done)}
                    end={t.late && !t.done && <span className="h-tag late">{t.n === -1 ? 'Yesterday' : `${-t.n} days late`}</span>}>
                    {t.name}<small>{[t.tag, minutesOf(t.time) != null && hm(minutesOf(t.time))].filter(Boolean).join(', ')}</small>
                  </CheckRow>
                </li>
              ))}
            </ul>
          </div>
        )}

        {on('shopping') && (
          <div className="group g-kitchen">
            <GroupHead app="kitchenhub" title="Shopping" sub={shop.left.length ? (shop.tonight.length ? `${shop.tonight.length} for tonight` : 'Nothing needed for tonight') : 'The list is empty'}
              count={shop.left.length || null} status={data.status.shopping} onOpen={onOpen} path={APPS.kitchenhub.paths.shopping} />
            {shopRows.length > 0 && (
              <ul className="rows">
                {shopRows.map((i) => (
                  <li key={i.id}>
                    <CheckRow checked={!!i.bought} onToggle={() => act.item(i)}>
                      {i.name}<small>{[i.qty, !onlyTonight && i.why && `for ${i.why}`].filter(Boolean).join(', ')}</small>
                    </CheckRow>
                  </li>
                ))}
              </ul>
            )}
            {shop.left.length > shopRows.length || showAllShop ? (
              <button className="more more-btn" aria-expanded={showAllShop} onClick={() => setShowAllShop((v) => !v)}>
                {showAllShop ? 'Show fewer' : `Show all ${shop.left.length}`}
              </button>
            ) : null}
            <form className="h-add" onSubmit={(e) => { e.preventDefault(); act.addItem(item); setItem(''); }}>
              <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add to the list" aria-label="Add to the shopping list" enterKeyHint="done" />
              <button className="pill" disabled={!item.trim()}>Add</button>
            </form>
          </div>
        )}

        {on('herd') && herd && (
          <div className="group g-farm">
            <GroupHead app="znt" title={herd.name} sub={plural(herd.head, 'head')} status={data.status.breeding} onOpen={onOpen} />
            <ul className="rows plain">
              {herd.steps.map((s) => <li key={s.label}><b>{s.label}</b> {s.n === 0 ? 'today' : 'tomorrow'}</li>)}
              {herd.clash.map((c) => <li key={c} className="warn-text">{c}</li>)}
            </ul>
          </div>
        )}

        {on('shopping') && soon.length > 0 && (
          <div className="group g-kitchen">
            <GroupHead app="kitchenhub" title="Use soon" sub={soon.map((x) => `${x.name} ${x.days <= 0 ? 'today' : x.days === 1 ? 'by tomorrow' : `in ${x.days} days`}`).join(', ')}
              onOpen={onOpen} path={APPS.kitchenhub.paths.inventory} />
          </div>
        )}

        {nothing && !data.locked && <p className="h-note">Nothing needs anyone right now.</p>}
        {stale.length > 0 && <p className="h-note warn">{stale.join(' and ')} {stale.length === 1 ? 'isn’t' : 'aren’t'} updating. Showing the last copy Hive saw.</p>}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- tonight --- */

export function Tonight({ data, onOpen }) {
  const { tonight, after } = dinners(data.meals);
  const recipe = tonight?.recipe && data.recipes?.[tonight.recipe];
  const open = (m) => onOpen('kitchenhub', null, m?.recipe ? APPS.kitchenhub.paths.recipe(m.recipe) : APPS.kitchenhub.paths.mealPlan);
  const nightName = (n) => (n === 1 ? 'Tomorrow' : wd(new Date(Date.now() + n * 864e5)));
  return (
    <section className="panel p-tonight" aria-labelledby="h-tonight">
      <h2 className="panel-title" id="h-tonight">Tonight<Freshness s={data.status.meals} /></h2>
      <div className="panel-body">
        {tonight ? (
          <button className="dish" onClick={() => open(tonight)}>
            <b>{tonight.name}</b>
            {recipe && <span>{[recipe.sub, recipe.time].filter(Boolean).join('. ')}</span>}
            <em>{tonight.recipe ? 'Open the recipe in KitchenHub' : 'Open the meal plan'}</em>
          </button>
        ) : (
          <div className="dish is-empty">
            <b>Nothing planned</b>
            <button className="pill" onClick={() => open(null)}>Plan dinner in KitchenHub</button>
          </div>
        )}
        {after.length > 0 && (
          <ul className="nights">
            {after.map((m) => (
              <li key={m.d}><button onClick={() => open(m)}><span>{nightName(m.d)}</span>{m.name}</button></li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------- coming up --- */

const KIND = {
  event: 'k-ahead', 'trip-start': 'k-ahead', 'trip-now': 'k-ahead', 'trip-end': 'k-ahead', leg: 'k-ahead', stay: 'k-ahead', breed: 'k-farm', task: 'k-ahead',
};

function itemText(i) {
  switch (i.kind) {
    case 'event': return { what: i.event.title, sub: i.event.location, at: i.continued || i.event.allDay ? 'All day' : hm(new Date(i.event.start).getHours() * 60 + new Date(i.event.start).getMinutes()) };
    case 'task': return { what: i.task.name, sub: i.task.tag, at: i.at != null ? hm(i.at) : 'To do' };
    case 'trip-start': return { what: `Leave for ${i.trip.dest || i.trip.name}`, sub: i.trip.name, at: 'Trip' };
    case 'trip-now': return { what: `Away in ${i.trip.dest || i.trip.name}`, sub: i.trip.name, at: 'Trip' };
    case 'trip-end': return { what: `Home from ${(i.trip.dest || i.trip.name).split(',')[0]}`, sub: i.trip.name, at: 'Trip' };
    case 'stay': return { what: i.leg.title || 'Stay', sub: i.trip.name, at: 'Stay' };
    case 'leg': return { what: i.leg.title || i.leg.route, sub: i.leg.title ? i.leg.route : i.trip.name, at: i.at >= 0 ? hm(i.at) : 'Travel' };
    case 'breed': return { what: i.label, sub: i.breeding.name, at: 'Herd' };
    default: return { what: '', at: '' };
  }
}

function openItem(i, onOpen) {
  if (i.kind === 'breed') return onOpen('znt');
  if (i.trip) return onOpen('wander', null, APPS.wander.paths.trip(i.trip.id));
  if (i.kind === 'task' && i.task.source === 'learnleaf') return onOpen('learnleaf', null, APPS.learnleaf.paths.tasks);
  return onOpen('board');
}

const DAYS_SHOWN = 4;

export function ComingUp({ data, now, onOpen }) {
  const [all, setAll] = useState(false);
  const { days: every, later } = comingUp(data, now, 14);
  const days = all ? every : every.slice(0, DAYS_SHOWN);
  const forecast = (date) => (data.weather?.days || []).find((d) => d.date && daysBetween(startOf(date), new Date(`${d.date}T00:00`)) === 0);
  return (
    <section className="panel p-ahead" aria-labelledby="h-ahead">
      <h2 className="panel-title" id="h-ahead">Coming up<Freshness s={[data.status.calendar, data.status.trips].find((s) => s?.status !== 'live')} /></h2>
      <div className="panel-body">
        {days.map((d) => {
          const f = forecast(d.date);
          const W = f ? WX[f.code] ?? WX.cloud : null;
          return (
            <section className="cu-day" key={d.n} aria-label={dayName(d.n, d.date)}>
              <h3 className="cu-date">
                <span>{dayName(d.n, d.date)}</span>
                {d.away && <span className="cu-away"><Plane />{d.away}</span>}
                {f && <span className="cu-wx" aria-label={`High ${f.hi}°, low ${f.lo}°`}><W />{f.hi}°<small>{f.lo}°</small></span>}
              </h3>
              <ul>
                {d.items.map((i) => {
                  const tx = itemText(i);
                  return (
                    <li key={i.key}>
                      <button className={`cu-row ${KIND[i.kind] || ''}`} onClick={() => openItem(i, onOpen)}>
                        <span className="cu-at">{tx.at}</span>
                        <span className="cu-what">{tx.what}{tx.sub && <small>{tx.sub}</small>}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {every.length > DAYS_SHOWN && (
          <button className="more more-btn" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer days' : 'Show the next two weeks'}
          </button>
        )}
        {(all || every.length <= DAYS_SHOWN) && later.length > 0 && (
          <section className="cu-day" aria-label="Later">
            <h3 className="cu-date"><span>Later</span></h3>
            <ul>
              {later.slice(0, 3).map((l) => (
                <li key={l.key}>
                  <button className="cu-row k-ahead" onClick={() => (l.kind === 'trip' ? onOpen('wander', null, APPS.wander.paths.trip(l.trip.id)) : onOpen('znt'))}>
                    <span className="cu-at">In {l.n} days</span>
                    <span className="cu-what">{l.kind === 'trip' ? l.trip.name : `${l.breeding.name}: CIDRs in`}<small>{l.kind === 'trip' ? l.trip.dest : md(l.breeding.cidr)}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!every.length && !later.length && <p className="h-note">Nothing on the calendar for the next two weeks.</p>}
      </div>
    </section>
  );
}
