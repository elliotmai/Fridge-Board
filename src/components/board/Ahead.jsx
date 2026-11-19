import { appLink } from '@/config/apps';
import { clock12, daysBetween, md, parseDate, plural, short, startOf, wd } from '@/lib/dates';
import { Countdown, Freshness, OpenIn } from './bits';
import { Bed, Car, Cow, Pin, Plane, Right, Tick, Train, Warn } from './Icons';

const KIND_ICON = { flight: Plane, plane: Plane, stay: Bed, drive: Car, car: Car, train: Train, rail: Train };
const KIND_LABEL = { flight: 'Flight', drive: 'Drive', car: 'Drive', train: 'Train', bus: 'Bus', ferry: 'Ferry', stay: 'Stay', other: 'Travel' };
const dayLabel = (iso) => (iso ? `${wd(parseDate(iso))} ${short(parseDate(iso))}` : '');

/** Your own flights, drives and stays on a trip, in date order. */
function Itinerary({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="itinerary">
      {items.map((i, n) => {
        const Icon = KIND_ICON[i.kind] || Pin;
        return (
          <li key={`${i.kind}-${i.date}-${n}`}>
            <Icon />
            <span className="it-main">
              <b>{i.kind === 'stay' ? i.title : [i.title || KIND_LABEL[i.kind] || 'Travel', i.route].filter(Boolean).join('  ')}</b>
              <small>
                {i.kind === 'stay'
                  ? `${dayLabel(i.date)}${i.until ? ` to ${dayLabel(i.until)}` : ''}`
                  : [dayLabel(i.date), i.time && `${i.time}${i.arrive ? ` to ${i.arrive}` : ''}`].filter(Boolean).join(', ')}
              </small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Breeding({ b, now, phone }) {
  const today = startOf(now), until = daysBetween(today, b.cidr);
  // Each step spans days: CIDRs are in until Lutalyse, Lutalyse runs until
  // breeding starts, then the breeding window. Done = past its last day;
  // now = today falls inside it. Done and now are highlighted; what's ahead is muted.
  const dayBefore = (d) => { const x = new Date(d); x.setDate(x.getDate() - 1); return x; };
  const stops = [
    ['CIDRs in', md(b.cidr), b.cidr, dayBefore(b.lut)],
    ['Lutalyse', md(b.lut), b.lut, dayBefore(b.b1)],
    ['Breed', `${wd(b.b1)} to ${wd(b.b2)} ${short(b.b2)}`, b.b1, b.b2],
  ].map(([label, when, start, end]) => ({ label, when, state: today > end ? 'done' : today >= start ? 'now' : 'ahead' }));
  const reached = stops.filter((s) => s.state !== 'ahead').length;
  return (
    <div className="entry">
      <div className="row"><h3>{b.name}</h3>{until > 0 ? <Countdown n={until} /> : <Countdown now />}</div>
      <div className="herd">
        {b.groups.length ? <><span><b>{b.head}</b> head</span>{b.groups.map((g) => <span key={g[0]}>{g[0]} {g[1]}</span>)}</> : <span>No groups added yet</span>}
      </div>
      <div className="track" style={{ '--reached': Math.max(0, reached - 1) / 2 }}>
        {stops.map((s) => (
          <div key={s.label} className={`stop ${s.state}`}>
            <i />
            <b>{s.label}{s.state === 'now' && <span className="badge now">Now</span>}</b>
            <span>{s.when}</span>
          </div>
        ))}
      </div>
      {b.clash.map((c) => <div className="clash" key={c}><Warn /><span>{c}</span></div>)}
      {b.notes && <p>{b.notes}</p>}
      {phone && <a className="more-link" href={appLink('znt', 'home')} target="_blank" rel="noopener noreferrer">Open ZNT<Right /></a>}
    </div>
  );
}

const MAX_ANYTIME = 5;
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(/\s/g, '').toLowerCase();
const dayName = (d, n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${wd(d)} ${short(d)}`);
const SOURCES = [['tasks', 'LearnLeaf'], ['gtasks', 'Google'], ['trips', 'Wander'], ['breeding', 'ZNT']];

/** One to-do row: tick box, name, where it's from, and when it's due. */
function Todo({ t, done, onToggle, when }) {
  return (
    <button className={`todo ${t.n != null && t.n < 0 ? 'overdue' : ''} ${done ? 'is-done' : ''}`} role="checkbox" aria-checked={done} onClick={() => onToggle(t)}>
      <span className="tbox" aria-hidden="true"><Tick /></span>
      <span className="tname">{t.name}<small><i style={{ background: t.color }} />{t.tag}</small></span>
      {when && <em>{when}</em>}
    </button>
  );
}

/** A non-task line: time or icon on the left, what it is on the right. */
function Line({ left, icon: Icon, tone, title, sub, children }) {
  return (
    <div className={`tl-line ${tone || ''}`}>
      <em>{Icon ? <Icon /> : left}</em>
      <span><b>{title}</b>{sub && <small>{sub}</small>}{children}</span>
    </div>
  );
}

function Item({ i, todoDone, onToggle }) {
  const t = i.trip, b = i.breeding;
  switch (i.kind) {
    case 'task': return <Todo t={i.task} done={todoDone.includes(i.task.key)} onToggle={onToggle} when={i.task.time ? clock12(i.task.time) : ''} />;
    case 'event': return <Line left={i.event.allDay ? 'All day' : i.continued ? 'cont.' : timeOf(i.event.start)} title={i.event.title} sub={!i.continued && i.event.location} />;
    case 'trip-start': return <Line icon={Plane} tone="trip" title={`Leave for ${t.name}`} sub={`${t.dest}, ${plural(daysBetween(parseDate(t.startDate), parseDate(t.endDate)), 'night')}${t.far ? '' : '. Close to home'}`} />;
    case 'trip-now': return <Line icon={Plane} tone="trip" title={`Away: ${t.name}`} sub={`${t.dest}, back ${md(parseDate(t.endDate))}`} />;
    case 'trip-end': return <Line icon={Plane} tone="trip" title={`Back from ${t.name}`} />;
    case 'leg': {
      const l = i.leg;
      return <Line icon={KIND_ICON[l.kind] || Pin} tone="trip" title={[l.title || KIND_LABEL[l.kind] || 'Travel', l.route].filter(Boolean).join('  ')} sub={[l.time, l.arrive && `to ${l.arrive}`].filter(Boolean).join(' ')} />;
    }
    case 'stay': return <Line icon={Bed} tone="trip" title={i.leg.title || 'Stay'} sub={i.leg.until ? `Check in, until ${dayLabel(i.leg.until)}` : 'Check in'} />;
    case 'breed': return (
      <Line icon={Cow} tone="breed" title={`${b.name}: ${i.label}`} sub={i.step === 'cidr' && b.groups.length ? `${b.head} head: ${b.groups.map((g) => `${g[0]} ${g[1]}`).join(', ')}` : ''}>
        {i.step === 'cidr' && b.clash.map((c) => <span className="clash" key={c}><Warn />{c}</span>)}
        {i.step === 'cidr' && b.notes && <small>{b.notes}</small>}
      </Line>
    );
    default: return null;
  }
}

/** One label naming the sources that aren't live, e.g. "Sample: Google, ZNT". */
function SourceNotes({ status }) {
  const off = [];
  for (const [k, label] of SOURCES) {
    const st = status[k];
    if (st && st.status !== 'live' && !off.some((o) => o.label === label)) off.push({ label, st });
  }
  if (!off.length) return null;
  const sample = off.filter((o) => o.st.status !== 'stale'), stale = off.filter((o) => o.st.status === 'stale');
  const title = off.map((o) => `${o.label}: ${o.st.reason || o.st.status}`).join('\n');
  return (
    <>
      {sample.length > 0 && <span className="fresh" title={title}>Sample: {sample.map((o) => o.label).join(', ')}</span>}
      {stale.length > 0 && <span className="fresh stale" title={title}>Not updating: {stale.map((o) => o.label).join(', ')}</span>}
    </>
  );
}

/**
 * Coming up: to-dos, calendar, travel and breeding in one list by day
 * (src/lib/agenda.js `timeline`). Trips that are also on the calendar show once.
 */
export function ComingUp({ tl, todoDone, onToggleTodo, hiddenEvents, phone, status }) {
  const empty = !tl.overdue.length && !tl.days.length && !tl.later.length && !tl.anytime.length;
  return (
    <section className="zone ahead" aria-label="Coming up">
      <div className="zh">
        <h2>Coming up</h2>
        <SourceNotes status={status} />
        {phone && <span className="zh-links"><OpenIn app="learnleaf" path="tasks" /><OpenIn app="wander" path="trips" /></span>}
      </div>
      <div className="scroll" data-scroll>
        {tl.overdue.length > 0 && (
          <div className="tl-day">
            <span className="tl-date late">Overdue</span>
            {tl.overdue.map((t) => <Todo key={t.key} t={t} done={todoDone.includes(t.key)} onToggle={onToggleTodo} when={wd(t.due)} />)}
          </div>
        )}
        {tl.days.map((d) => (
          <div className="tl-day" key={d.n}>
            <span className={`tl-date ${d.n === 0 ? 'is-today' : ''}`}>
              {dayName(d.date, d.n)}
              {d.away && <span className="tl-away"><Plane />{d.away}</span>}
            </span>
            {d.items.map((i) => <Item key={i.key} i={i} todoDone={todoDone} onToggle={onToggleTodo} />)}
          </div>
        ))}
        {tl.later.length > 0 && (
          <div className="tl-day">
            <span className="tl-date">Later</span>
            {tl.later.slice(0, 4).map((l) => (
              <div className="later-row" key={l.key}>
                <span>{l.kind === 'trip' ? l.trip.name : `${l.breeding.name}: CIDRs in`}<small>{l.kind === 'trip' ? `${l.trip.dest}, ${dayLabel(l.trip.startDate)}` : md(l.breeding.cidr)}</small></span>
                <em>{l.n} days</em>
              </div>
            ))}
          </div>
        )}
        {tl.anytime.length > 0 && (
          <div className="tl-day">
            <span className="tl-date">Anytime</span>
            {tl.anytime.slice(0, MAX_ANYTIME).map((t) => <Todo key={t.key} t={t} done={todoDone.includes(t.key)} onToggle={onToggleTodo} />)}
            {tl.anytime.length > MAX_ANYTIME && <p className="empty-note">And {tl.anytime.length - MAX_ANYTIME} more in Google Tasks.</p>}
          </div>
        )}
        {empty && <p className="empty-note">Nothing coming up in the next two weeks.</p>}
        {/Sign in|Confirm/.test(status.calendar?.reason || '') && status.calendar.status === 'sample' && (
          <p className="tl-foot">{status.calendar.reason.replace('this', 'your own calendar and Google Tasks')}. The ones above are samples.</p>
        )}
        {hiddenEvents > 0 && <p className="tl-foot">{plural(hiddenEvents, 'calendar event')} matched a Wander trip, so {hiddenEvents === 1 ? 'it shows' : 'they show'} as the trip.</p>}
      </div>
    </section>
  );
}

/** Middle column in housesitter mode: what the place needs from the sitter. */
export function SitterGuide({ sitter, phone, status }) {
  const care = sitter.care || [];
  const empty = !care.length && !sitter.notes.length && !sitter.intro && !(sitter.doNotHandle || []).length;
  return (
    <section className="zone farm care" aria-label="The animals">
      <div className="zh"><h2>The animals</h2><Freshness s={status} />{phone && <OpenIn app="galaxyfarm" path="housesitter" label="Full guide" />}</div>
      <div className="scroll" data-scroll>
        {(sitter.doNotHandle || []).length > 0 && (
          <div className="danger">
            <b><Warn />Do not handle these alone</b>
            {sitter.doNotHandle.map((d) => <span key={d}>{d}</span>)}
          </div>
        )}
        {sitter.intro && <p className="intro">{sitter.intro}</p>}
        {care.map((sec) => (
          <div key={sec.title}>
            <div className="sh">{sec.title}</div>
            {sec.items.map((i, n) => (
              <div className="care-item" key={`${i.name}-${n}`}>
                <div className="care-head">
                  {i.name && <b>{i.name}</b>}
                  {i.safety != null && i.safety >= 3 && <span className="badge late">{i.safetyLabel || `Safety ${i.safety}`}</span>}
                </div>
                {i.detail && <p>{i.detail}</p>}
              </div>
            ))}
          </div>
        ))}
        {sitter.notes.length > 0 && <div className="sh">Good to know</div>}
        {sitter.notes.map((n) => <div className={`note ${n[0]}`} key={n[1]}>{n[1]}</div>)}
        {empty && <p className="empty-note">Nothing in the housesitter guide yet. Add pens, pets, feeding plans and notes in GalaxyFarm under Housesitter, and they show here.</p>}
      </div>
    </section>
  );
}

/** Right column in housesitter mode: when we're back, who to call, cattle dates. */
export function SitterPanel({ ts, breeding, sitter, now, phone, status }) {
  const trip = ts.away || ts.shown.find((t) => t.far);
  return (
    <section className="zone ahead" aria-label="While we're away">
      <div className="zh"><h2>While we&apos;re away</h2></div>
      <div className="scroll" data-scroll>
        {trip ? (
          <div className="entry">
            <p>{trip.current ? "We're back" : 'We leave'}</p>
            <span className="back-big">{md(trip.current ? trip.endD : trip.startD)}</span>
            <p>{trip.dest}</p>
            <Itinerary items={trip.items} />
          </div>
        ) : <p className="empty-note">No trip in Wander right now.</p>}
        <div className="sh">Who to call<Freshness s={status.sitter} /></div>
        {sitter.contacts.length ? sitter.contacts.map((c) => (
          <div className="contact" key={c[0]}><div>{c[0]}<small>{c[1]}</small></div><span className="num">{c[2] || 'No number saved'}</span></div>
        )) : <p className="empty-note">Tag contacts as emergency or vet in GalaxyFarm to list them here.</p>}
        {breeding && (<><div className="sh">Cattle<Freshness s={status.breeding} /></div><Breeding b={breeding} now={now} phone={phone} /></>)}
      </div>
    </section>
  );
}
