import { appLink } from '@/config/apps';
import { dayFrom, daysBetween, md, plural, short, startOf, wd } from '@/lib/dates';
import { Countdown, OpenIn } from './bits';
import { Right, Warn } from './Icons';

function Legs({ legs }) {
  if (!legs) return null;
  return <div className="legs">{legs.map((l) => <span key={l[0]}>{l[0]}&nbsp;&nbsp; {l[1]}&nbsp;&nbsp; {l[2]}</span>)}</div>;
}

function Trip({ t, phone }) {
  const nights = daysBetween(t.startD, t.endD);
  const body = (
    <>
      <div className="row"><h3>{t.name}</h3><Countdown n={t.until} now={t.current} /></div>
      <p>{t.dest}</p>
      <div className="line"><span>{wd(t.startD)} {short(t.startD)} to {wd(t.endD)} {short(t.endD)}</span><span>{plural(nights, 'night')}</span></div>
      {t.current && !t.far && <p>Close to home, so the board stays as it is.</p>}
      <Legs legs={t.legs} />
      {t.stay && <p>{t.stay}</p>}
    </>
  );
  return phone
    ? <a className="entry" href={appLink('wander', 'trip', t.id)} target="_blank" rel="noopener noreferrer">{body}</a>
    : <div className="entry">{body}</div>;
}

function Breeding({ b, now, phone }) {
  const today = startOf(now), until = daysBetween(today, b.cidr);
  const stops = [['CIDRs in', md(b.cidr), b.cidr], ['Lutalyse', md(b.lut), b.lut], ['Breed', `${wd(b.b1)} to ${wd(b.b2)} ${short(b.b2)}`, b.b2]];
  const next = stops.findIndex((s) => s[2] >= today);
  return (
    <div className="entry">
      <div className="row"><h3>{b.name}</h3>{until > 0 ? <Countdown n={until} /> : <Countdown now />}</div>
      <div className="herd"><span><b>{b.head}</b> head</span>{b.groups.map((g) => <span key={g[0]}>{g[0]} {g[1]}</span>)}</div>
      <div className="track">
        {stops.map((s, i) => (
          <div key={s[0]} className={`stop ${i < next ? 'past' : i === next ? 'next' : ''}`}><i /><b>{s[0]}</b><span>{s[1]}</span></div>
        ))}
      </div>
      {b.clash.map((c) => <div className="clash" key={c}><Warn /><span>{c}</span></div>)}
      {b.notes && <p>{b.notes}</p>}
      {phone && <a className="more-link" href={appLink('znt', 'home')} target="_blank" rel="noopener noreferrer">Open ZNT<Right /></a>}
    </div>
  );
}

export function ComingUp({ ts, breeding, tasks, subjects, now, opts, phone }) {
  const today = startOf(now);
  const list = tasks
    .map((t) => ({ ...t, due: dayFrom(t.d) }))
    .map((t) => ({ ...t, n: daysBetween(today, t.due) }))
    .filter((t) => t.n <= 7)
    .sort((a, b) => a.n - b.n);
  const over = list.filter((t) => t.n < 0).length;
  return (
    <section className="zone ahead" aria-label="Coming up">
      <div className="zh"><h2>Coming up</h2></div>
      <div className="scroll" data-scroll>
        <div className="sh">Trips{phone && <OpenIn app="wander" path="trips" />}</div>
        {ts.shown.length ? ts.shown.map((t) => <Trip key={t.id} t={t} phone={phone} />) : <p className="empty-note">No trips in the next {opts.window} days.</p>}
        {breeding && (<><div className="sh">Next breeding group</div><Breeding b={breeding} now={now} phone={phone} /></>)}
        <div className="sh">Tasks{over > 0 && <span className="badge late">{over} overdue</span>}{phone && <OpenIn app="learnleaf" path="tasks" />}</div>
        {list.length ? list.map((t) => (
          <div key={t.name} className={`task ${t.n < 0 ? 'overdue' : ''}`}>
            <i style={{ background: subjects[t.subject][1] }} title={subjects[t.subject][0]} />
            <span>{t.name}</span>
            <em>{t.n < 0 ? 'Overdue' : t.n === 0 ? t.time || 'Today' : t.n === 1 ? 'Tomorrow' : wd(t.due)}</em>
          </div>
        )) : <p className="empty-note">Nothing due this week.</p>}
      </div>
    </section>
  );
}

export function SitterPanel({ ts, breeding, sitter, now, phone }) {
  const trip = ts.away || ts.shown.find((t) => t.far);
  return (
    <section className="zone ahead" aria-label="While we're away">
      <div className="zh"><h2>While we&apos;re away</h2>{phone && <OpenIn app="galaxyfarm" path="housesitter" label="Full guide" />}</div>
      <div className="scroll" data-scroll>
        {trip && (
          <div className="entry">
            <p>{trip.current ? "We're back" : 'We leave'}</p>
            <span className="back-big">{md(trip.current ? trip.endD : trip.startD)}</span>
            <p>{trip.dest}</p>
            <Legs legs={trip.legs} />
          </div>
        )}
        <div className="sh">Who to call</div>
        {sitter.contacts.map((c) => (
          <div className="contact" key={c[0]}><div>{c[0]}<small>{c[1]}</small></div><span className="num">{c[2]}</span></div>
        ))}
        <div className="sh">Good to know</div>
        {sitter.notes.map((n) => <div className={`note ${n[0]}`} key={n[1]}>{n[1]}</div>)}
        {breeding && (<><div className="sh">Cattle</div><Breeding b={breeding} now={now} phone={phone} /></>)}
      </div>
    </section>
  );
}
