import { useEffect, useMemo, useRef, useState } from 'react';
import { APPS } from '@/config/apps';
import { CATALOG, appIds, appLook } from '@/config/catalog';
import { dedupeEvents, eventDays, mergeTodos } from '@/lib/agenda';
import { daysBetween, md, startOf } from '@/lib/dates';
import { AppIcon } from './Home';
import { UI } from './glyphs';

/**
 * Search everything: apps, and what's in them (tasks, events, trips, shopping,
 * chores, meals) from the same feed as the widgets. Hive as one brain.
 *
 * Results open the app that owns them, at the right page when the app has one.
 * Arrow keys move, Enter opens, Escape closes.
 */
export function Spotlight({ data, now, custom, recent, onOpen, onAction, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);

  const results = useMemo(() => search(q, { data, now, custom }), [q, data, now, custom]);
  const flat = results.flatMap((g) => g.items);
  useEffect(() => setSel(0), [q]);

  const go = (r) => {
    onClose();
    if (r.action) onAction(r.action);
    else if (r.url) window.open(r.url, '_blank', 'noopener'); // outside Hive: Google Calendar, Google Tasks
    else onOpen(r.app, null, r.path);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && flat[sel]) { e.preventDefault(); go(flat[sel]); }
  };

  const today = !q.trim() ? todayList(data, now) : [];
  let n = -1;

  return (
    <div className="spot hive-layer" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="spot-panel" role="dialog" aria-modal="true" aria-label="Search">
        <div className="spot-bar">
          <UI.search />
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search apps, tasks, trips…" aria-label="Search" enterKeyHint="go" autoComplete="off" />
          <button className="spot-cancel" onClick={onClose}>Cancel</button>
        </div>

        <div className="spot-body">
          {!q.trim() && (
            <>
              {recent.length > 0 && (
                <>
                  <h3 className="spot-h">Recent</h3>
                  <div className="spot-recent">
                    {recent.slice(0, 8).map((id) => (
                      <button key={id} className="tile-btn" onClick={() => go({ app: id })}>
                        <AppIcon id={id} custom={custom} size={52} />
                        <span className="tile-name">{appLook(id, custom).name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {today.length > 0 && (
                <>
                  <h3 className="spot-h">Today</h3>
                  <ul className="spot-list">{today.map((r) => <Row key={r.key} r={r} custom={custom} onGo={go} />)}</ul>
                </>
              )}
            </>
          )}
          {q.trim() && !flat.length && <p className="spot-empty">Nothing for “{q.trim()}”.</p>}
          {results.map((g) => (
            <section key={g.title}>
              <h3 className="spot-h">{g.title}</h3>
              <ul className="spot-list">
                {g.items.map((r) => { n++; return <Row key={r.key} r={r} custom={custom} onGo={go} active={n === sel} />; })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ r, custom, onGo, active }) {
  return (
    <li>
      <button className={`spot-row ${active ? 'active' : ''}`} onClick={() => onGo(r)}>
        <AppIcon id={r.app} custom={custom} size={34} />
        <span><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
        <em>{r.where || appLook(r.app, custom).name}</em>
      </button>
    </li>
  );
}

const has = (s, q) => String(s || '').toLowerCase().includes(q);
const when = (d, now) => { const n = daysBetween(startOf(now), d); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : md(d); };

/** Search results, grouped. Exported for tests and kept pure. */
export function search(query, { data, now, custom = {} }) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const groups = [];
  const add = (title, items, max = 6) => { if (items.length) groups.push({ title, items: items.slice(0, max) }); };

  add('Apps', appIds
    .filter((id) => has(appLook(id, custom).name, q) || has(CATALOG[id].blurb, q))
    .sort((a, b) => Number(!appLook(a, custom).name.toLowerCase().startsWith(q)) - Number(!appLook(b, custom).name.toLowerCase().startsWith(q)))
    .map((id) => ({ key: `app:${id}`, app: id, title: appLook(id, custom).name, sub: CATALOG[id].blurb })), 8);

  add('Settings', [
    { key: 'act:wallpaper', action: 'wallpaper', app: 'settings', title: 'Wallpaper & Home Screen', words: 'wallpaper background photo icons dock columns badges look theme dark' },
    { key: 'act:edit', action: 'edit', app: 'settings', title: 'Edit Home Screen', words: 'edit arrange move rearrange widgets folders' },
    { key: 'act:account', action: 'account', app: 'settings', title: 'Hive account', words: 'sign in account email password log out' },
    { key: 'act:settings', action: 'settings', app: 'settings', title: 'Settings', words: 'settings preferences fridge board idle' },
  ].filter((a) => has(a.title, q) || has(a.words, q)), 3);

  if (!data) return groups;

  const todos = mergeTodos({ learnleaf: data.tasks, subjects: data.subjects, google: data.gtasks }, now);
  add('Tasks', todos.filter((t) => has(t.name, q) || has(t.tag, q)).map((t) => ({
    key: t.key, ...(t.source === 'learnleaf' ? { app: 'learnleaf', path: APPS.learnleaf.paths.tasks } : google.tasks),
    title: t.name, sub: [t.tag, t.due ? when(t.due, now) : ''].filter(Boolean).join(' · '),
  })));

  const { shown } = dedupeEvents(data.events || [], data.trips || []);
  add('Calendar', shown.filter((e) => has(e.title, q) || has(e.location, q)).map((e) => ({
    key: `ev:${e.id}`, ...google.day(eventDays(e).first), title: e.title, sub: [when(eventDays(e).first, now), e.location].filter(Boolean).join(' · '),
  })));

  add('Trips', (data.trips || []).filter((t) => has(t.name, q) || has(t.dest, q)).map((t) => ({
    key: `trip:${t.id}`, app: 'wander', path: APPS.wander.paths.trip(t.id), title: t.name, sub: t.dest,
  })));

  add('Shopping', (data.shopping || []).filter((i) => has(i.name, q)).map((i) => ({
    key: `shop:${i.id}`, app: 'kitchenhub', path: APPS.kitchenhub.paths.shopping, title: i.name, sub: [i.qty, i.section].filter(Boolean).join(' · '),
  })));

  add('Meals', (data.meals || []).filter((m) => has(m.name, q)).map((m) => ({
    key: `meal:${m.d}:${m.type}`, app: 'kitchenhub', path: m.recipe ? APPS.kitchenhub.paths.recipe(m.recipe) : APPS.kitchenhub.paths.mealPlan,
    title: m.name, sub: `${m.type}, ${m.d === 0 ? 'today' : m.d === 1 ? 'tomorrow' : `in ${m.d} days`}`,
  })));

  add('Chores', (data.chores || []).filter((c) => has(c.title, q) || has(c.detail, q)).map((c) => ({
    key: `chore:${c.id}`, app: 'galaxyfarm', path: APPS.galaxyfarm.paths.chores, title: c.title, sub: [c.detail, c.done ? 'Done' : ''].filter(Boolean).join(' · '),
  })));

  return groups;
}

/**
 * Google's own apps for things that live there. They aren't Hive apps, so
 * they open in a new tab; the icon shown is the board's, which displays them.
 */
const pad = (n) => String(n).padStart(2, '0');
const google = {
  tasks: { app: 'board', url: 'https://tasks.google.com/', where: 'Google Tasks' },
  day: (d) => ({ app: 'board', url: `https://calendar.google.com/calendar/r/day/${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`, where: 'Google Calendar' }),
};

/** With nothing typed: what's on today, at a glance. */
function todayList(data, now) {
  if (!data) return [];
  const out = [];
  const dinner = (data.meals || []).find((m) => m.d === 0 && m.type === 'Dinner');
  if (dinner) out.push({ key: 'dinner', app: 'kitchenhub', path: dinner.recipe ? APPS.kitchenhub.paths.recipe(dinner.recipe) : APPS.kitchenhub.paths.mealPlan, title: dinner.name, sub: 'Tonight’s dinner' });
  const { shown } = dedupeEvents(data.events || [], data.trips || []);
  shown.filter((e) => daysBetween(startOf(now), eventDays(e).first) === 0).slice(0, 3)
    .forEach((e) => out.push({ key: `ev:${e.id}`, ...google.day(eventDays(e).first), title: e.title, sub: e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }));
  const left = (data.chores || []).filter((c) => !c.done).length;
  if (left) out.push({ key: 'chores', app: 'galaxyfarm', path: APPS.galaxyfarm.paths.chores, title: `${left} chore${left === 1 ? '' : 's'} left`, sub: 'GalaxyFarm' });
  return out;
}
