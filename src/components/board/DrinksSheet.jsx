import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { callApi } from '@/data/api';
import { hiveSession } from '@/hive/account';

/*
 * Drinks on the fridge: pick who you are from the household, then one tap
 * adds a drink to that person's Drink Tracker (netlify/functions/drinks.mjs
 * checks you're signed in, and that they're in your household).
 *
 * It asks who you are every time it opens, so the next person at the fridge
 * is never logged as you. While it's open you can add several drinks for the
 * same person, or switch with "Not you?".
 *
 * Speed: everyone's drinks start loading as soon as the sheet opens (yours
 * alongside the list of people, the others once it arrives), so picking a
 * name shows their drinks straight away instead of starting a second wait.
 * After adding a drink for someone, picking them again loads them afresh.
 */
const PREFETCH_MAX = 8;
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } };

const EMOJI = { Beer: '🍺', Wine: '🍷', Cocktail: '🍸', Spirit: '🥃', Other: '🍹' };
const label = (d) => `${d.name || d.type} · ${d.quantity} oz`;

export function DrinksSheet({ onClose, start }) {
  const { toast } = useToast();
  const [people, setPeople] = useState(null); // null: loading
  const [error, setError] = useState('');
  const [who, setWho] = useState(null);
  const [opts, setOpts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  // Search: every drink they've logged, then the plain types; any part of the name or type.
  const found = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !opts?.all) return [];
    const plain = (opts.types || []).map((t) => ({ type: t.type, name: '', quantity: t.quantity }));
    return [...opts.all, ...plain]
      .filter((d) => { const s = `${d.name} ${d.type}`.toLowerCase(); return words.every((w) => s.includes(w)); })
      .slice(0, 8);
  }, [q, opts]);

  // Each person's options: the request (shared, so nothing is asked twice) and,
  // once it's back, the answer, so a pick can show it without a Loading flash.
  const asked = useRef(new Map());
  const answered = useRef(new Map());
  const fetchOpts = useCallback((id) => {
    let p = asked.current.get(id);
    if (!p) {
      p = callApi(`/api/drinks/${encodeURIComponent(id)}?tz=${encodeURIComponent(tz())}`)
        .then((r) => (r.ok ? r.data : { error: r.data?.error || 'Couldn’t reach Drink Tracker' }));
      asked.current.set(id, p);
      p.then((o) => {
        if (asked.current.get(id) !== p) return;
        if (o.error) asked.current.delete(id); // try again next time they're picked
        else answered.current.set(id, o);
      });
    }
    return p;
  }, []);
  const forget = (id) => { asked.current.delete(id); answered.current.delete(id); };

  useEffect(() => {
    // Yours first, alongside the list: it's usually you at the fridge.
    hiveSession().then((s) => { if (s?.uid) fetchOpts(s.uid); });
    callApi('/api/drinks').then((r) => {
      if (!r.ok) { setError(r.data?.error || 'Couldn’t reach Drink Tracker'); setPeople([]); return; }
      setPeople(r.data.people);
      // On a household screen, whoever the camera sees is picked already ("Not me" undoes it).
      const seen = start && r.data.people.find((p) => p.id === start);
      if (seen) setWho({ id: seen.id, name: seen.name });
      r.data.people.slice(0, PREFETCH_MAX).forEach((p) => fetchOpts(p.id));
    });
  }, [fetchOpts]); // eslint-disable-line react-hooks/exhaustive-deps -- `start` only for the first pick

  useEffect(() => {
    if (!who) return undefined;
    let live = true;
    setOpts(answered.current.get(who.id) || null);
    fetchOpts(who.id).then((o) => { if (live) setOpts(o); });
    return () => { live = false; };
  }, [who?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (p) => setWho({ id: p.id, name: p.name });
  const notMe = () => { setWho(null); setOpts(null); setQ(''); };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = async (d) => {
    if (busy) return;
    setBusy(true);
    const r = await callApi(`/api/drinks/${encodeURIComponent(who.id)}`, { method: 'POST', body: { type: d.type, name: d.name || '', quantity: d.quantity, tz: tz() } });
    setBusy(false);
    if (!r.ok) { toast(r.data?.error || 'Couldn’t add that drink', { type: 'error', duration: 5000 }); return; }
    forget(who.id); // picked again later, they load afresh with this drink in
    setOpts((o) => (o ? { ...o, today: (o.today || 0) + 1 } : o));
    toast(`${d.name || d.type} added for ${who.name}. Fix or remove it in Drink Tracker.`, { duration: 5000 });
  };

  const Chip = ({ d }) => (
    <button className="drink-chip" disabled={busy} onClick={() => add(d)}>
      <span aria-hidden="true">{EMOJI[d.type] || '🍹'}</span>{label(d)}
    </button>
  );

  return (
    <div className="fb-layer">
      <div className="scrim" onClick={onClose} />
      <div className="sheet drinks-sheet" role="dialog" aria-modal="true" aria-labelledby="drinksTitle">
        <div className="grab" />
        <button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        <span className="when">Drink Tracker</span>
        <h3 id="drinksTitle">{who ? `Add a drink for ${who.name}` : 'Who’s having a drink?'}</h3>

        {people === null && <p className="sub">Loading…</p>}
        {error && <p className="sub">{error}</p>}

        {!who && people?.length > 0 && (
          <div className="drink-people">
            {people.map((p) => <button key={p.id} className="drink-person" onClick={() => choose(p)}>{p.name}{p.me && <small>Signed in here</small>}</button>)}
          </div>
        )}

        {who && (
          <>
            <div className="drink-who">
              <span>{opts?.today != null ? `${opts.today} today` : ''}</span>
              <button className="text-btn" onClick={notMe}>Not {who.name}?</button>
            </div>
            {!opts && <p className="sub">Loading…</p>}
            {opts?.error && <p className="sub">{opts.error}</p>}
            {opts && !opts.error && (
              <input className="drink-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${who.name}’s drinks`} aria-label={`Search ${who.name}’s drinks`} />
            )}
            {q.trim() && (found.length
              ? <div className="drink-chips">{found.map((d) => <Chip key={label(d)} d={d} />)}</div>
              : <p className="sub">Nothing called “{q.trim()}” yet. Add it in Drink Tracker.</p>)}
            {!q.trim() && opts?.favorites?.length > 0 && <><div className="sh">Top 3</div><div className="drink-chips">{opts.favorites.map((d) => <Chip key={label(d)} d={d} />)}</div></>}
            {!q.trim() && opts?.recent?.length > 0 && <><div className="sh">Recent</div><div className="drink-chips">{opts.recent.map((d) => <Chip key={label(d)} d={d} />)}</div></>}
            {!q.trim() && opts?.types && <><div className="sh">Quick add</div><div className="drink-chips">{opts.types.map((d) => <Chip key={d.type} d={{ type: d.type, name: '', quantity: d.quantity }} />)}</div></>}
          </>
        )}

        <div className="sheet-actions"><button className="secondary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
