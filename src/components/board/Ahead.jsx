import { appLink } from '@/config/apps';
import { clock12, daysBetween, md, parseDate, plural, short, startOf, wd } from '@/lib/dates';
import { Countdown, Freshness, OpenIn } from './bits';
import { Bed, Car, Pin, Plane, Right, Tick, Train, Warn } from './Icons';

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

function Trip({ t, phone }) {
  const nights = daysBetween(t.startD, t.endD);
  const body = (
    <>
      <div className="row"><h3>{t.name}</h3><Countdown n={t.until} now={t.current} /></div>
      <p>{t.dest}</p>
      <div className="line"><span>{wd(t.startD)} {short(t.startD)} to {wd(t.endD)} {short(t.endD)}</span><span>{plural(nights, 'night')}</span></div>
      {t.current && !t.far && <p>Close to home, so the board stays as it is.</p>}
      <Itinerary items={t.items} />
    </>
  );
  return phone
    ? <a className="entry" href={appLink('wander', 'trip', t.id)} target="_blank" rel="noopener noreferrer">{body}</a>
    : <div className="entry">{body}</div>;
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

const MAX_UNDATED = 5;
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(/\s/g, '').toLowerCase();
const dayName = (d, n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${wd(d)} ${short(d)}`);

/** One to-do row: tick box, name, where it's from, when it's due. */
function Todo({ t, done, onToggle }) {
  const when = t.n == null ? '' : t.n < 0 ? 'Overdue' : t.n === 0 ? clock12(t.time) || 'Today' : t.n === 1 ? 'Tomorrow' : wd(t.due);
  return (
    <button className={`todo ${t.n != null && t.n < 0 ? 'overdue' : ''} ${done ? 'is-done' : ''}`} role="checkbox" aria-checked={done} onClick={() => onToggle(t)}>
      <span className="tbox" aria-hidden="true"><Tick /></span>
      <span className="tname">{t.name}<small><i style={{ background: t.color }} />{t.tag}</small></span>
      {when && <em>{when}</em>}
    </button>
  );
}

export function ComingUp({ ts, breeding, todos, todoDone, onToggleTodo, agenda, hiddenEvents, now, opts, phone, status }) {
  const dated = todos.filter((t) => t.n != null);
  const undated = todos.filter((t) => t.n == null);
  const over = dated.filter((t) => t.n < 0 && !todoDone.includes(t.key)).length;
  const todoStatus = [status.tasks, status.gtasks].find((x) => x && x.status !== 'live') || status.tasks;
  return (
    <section className="zone ahead stacked" aria-label="Coming up">
      <div className="zh"><h2>Coming up</h2></div>
      <div className={`part ${todos.length ? '' : 'is-empty'}`}>
        <div className="sh">To do<Freshness s={todoStatus} />{over > 0 && <span className="badge late">{over} overdue</span>}{phone && <OpenIn app="learnleaf" path="tasks" />}</div>
        <div className="scroll" data-scroll>
          {todos.length ? (
            <>
              {dated.map((t) => <Todo key={t.key} t={t} done={todoDone.includes(t.key)} onToggle={onToggleTodo} />)}
              {undated.length > 0 && <span className="later-h">No date</span>}
              {undated.slice(0, MAX_UNDATED).map((t) => <Todo key={t.key} t={t} done={todoDone.includes(t.key)} onToggle={onToggleTodo} />)}
              {undated.length > MAX_UNDATED && <p className="empty-note">And {undated.length - MAX_UNDATED} more in Google Tasks.</p>}
            </>
          ) : <p className="empty-note">Nothing due this week.</p>}
        </div>
      </div>
      <div className={`part ${agenda.length ? '' : 'is-empty'}`}>
        <div className="sh">Calendar<Freshness s={status.calendar} />{hiddenEvents > 0 && <span className="by" title="Events that are a Wander trip, or its flights and stays, show under Travel instead.">{hiddenEvents} under Travel</span>}</div>
        <div className="scroll" data-scroll>
          {agenda.length ? agenda.map((d) => (
            <div className="cal-day" key={d.n}>
              <span className={`cal-date ${d.n === 0 ? 'is-today' : ''}`}>{dayName(d.date, d.n)}</span>
              {d.events.map((e) => (
                <div className="cal-ev" key={`${e.id}-${d.n}`}>
                  <em>{e.allDay ? (e.continued ? 'cont.' : 'All day') : e.continued ? 'cont.' : timeOf(e.start)}</em>
                  <span>{e.title}{e.location && !e.continued && <small>{e.location}</small>}</span>
                </div>
              ))}
            </div>
          )) : <p className="empty-note">Nothing on the calendar this week.</p>}
        </div>
      </div>
      <div className={`part ${ts.shown.length || ts.later.length ? '' : 'is-empty'}`}>
        <div className="sh">Travel<Freshness s={status.trips} />{phone && <OpenIn app="wander" path="trips" />}</div>
        <div className="scroll" data-scroll>
          {ts.shown.length ? ts.shown.map((t) => <Trip key={t.id} t={t} phone={phone} />) : <p className="empty-note">No travel in the next {opts.window} days.</p>}
          {ts.later.length > 0 && (
            <div className="later">
              <span className="later-h">Later</span>
              {ts.later.slice(0, 4).map((t) => (
                <div className="later-row" key={t.id}>
                  <span>{t.name}<small>{t.dest}, {dayLabel(t.startDate)}</small></span>
                  <em>{t.until} days</em>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={`part ${breeding ? '' : 'is-empty'}`}>
        <div className="sh">Breeding<Freshness s={status.breeding} /></div>
        <div className="scroll" data-scroll>
          {breeding ? <Breeding b={breeding} now={now} phone={phone} /> : <p className="empty-note">No breeding group in the next {opts.breedWindow} days.</p>}
        </div>
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
