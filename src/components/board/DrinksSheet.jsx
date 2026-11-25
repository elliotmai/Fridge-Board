import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { callApi } from '@/data/api';

/*
 * Drinks on the fridge: pick who you are from the household, then one tap
 * adds a drink to that person's Drink Tracker (netlify/functions/drinks.mjs
 * checks you're signed in, and that they're in your household).
 *
 * It asks who you are every time it opens, so the next person at the fridge
 * is never logged as you. While it's open you can add several drinks for the
 * same person, or switch with "Not you?".
 */
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } };

const EMOJI = { Beer: '🍺', Wine: '🍷', Cocktail: '🍸', Spirit: '🥃', Other: '🍹' };
const label = (d) => `${d.name || d.type} · ${d.quantity} oz`;

export function DrinksSheet({ onClose }) {
  const { toast } = useToast();
  const [people, setPeople] = useState(null); // null: loading
  const [error, setError] = useState('');
  const [who, setWho] = useState(null);
  const [opts, setOpts] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    callApi('/api/drinks').then((r) => {
      if (!r.ok) { setError(r.data?.error || 'Couldn’t reach Drink Tracker'); setPeople([]); return; }
      setPeople(r.data.people);
    });
  }, []);

  const loadOpts = useCallback(async (w) => {
    setOpts(null);
    const r = await callApi(`/api/drinks/${encodeURIComponent(w.id)}?tz=${encodeURIComponent(tz())}`);
    setOpts(r.ok ? r.data : { error: r.data?.error || 'Couldn’t reach Drink Tracker' });
  }, []);
  useEffect(() => { if (who) loadOpts(who); }, [who?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (p) => setWho({ id: p.id, name: p.name });
  const notMe = () => { setWho(null); setOpts(null); };

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
            {opts?.favorites?.length > 0 && <><div className="sh">Favourites</div><div className="drink-chips">{opts.favorites.map((d) => <Chip key={label(d)} d={d} />)}</div></>}
            {opts?.recent?.length > 0 && <><div className="sh">Recent</div><div className="drink-chips">{opts.recent.map((d) => <Chip key={label(d)} d={d} />)}</div></>}
            {opts?.types && <><div className="sh">Quick add</div><div className="drink-chips">{opts.types.map((d) => <Chip key={d.type} d={{ type: d.type, name: '', quantity: d.quantity }} />)}</div></>}
          </>
        )}

        <div className="sheet-actions"><button className="secondary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
