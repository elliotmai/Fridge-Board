import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { callApi, setKey, takeKeyFromUrl } from '@/data/api';
import { loadBoard, REFRESH_MS } from '@/data/sources';
import { useIsPhone } from '@/hooks/useMedia';
import { useStored } from '@/hooks/useStored';
import { useTick } from '@/hooks/useTick';
import { DAY, plural } from '@/lib/dates';
import { nextBreeding, tripState } from '@/lib/derive';
import { ComingUp, SitterPanel } from './Ahead';
import { CookMode } from './CookMode';
import { Farm } from './Farm';
import { AwayBanner, Header } from './Header';
import { Meals, Shopping } from './Kitchen';
import { LockBanner } from './Lock';
import { RecipeSheet } from './RecipeSheet';
import { SettingsDrawer } from './SettingsDrawer';
import { TimerChips } from './timers';

const DEFAULT_OPTS = { offset: 0, window: 30, breedWindow: 30, awayMiles: 75, autoSitter: true, sitter: false };
const IDLE_MS = 120000;
const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function Board() {
  const { toast, clear: clearToasts } = useToast();
  const phone = useIsPhone();
  const [data, setData] = useState(null);
  const [opts, setOpts] = useStored('opts', DEFAULT_OPTS);
  // Sample-mode ticks live on this device. Live ticks go to the app; `overrides`
  // shows them straight away until the next refresh brings the app's own answer.
  const [localDone, setLocalDone] = useStored('done', []);
  const [localBought, setLocalBought] = useStored('bought', []);
  const [cleared, setCleared] = useStored('cleared', []);
  const [extra, setExtra] = useStored('extra', []);
  const [overrides, setOverrides] = useState({});
  const [pendingAdds, setPendingAdds] = useState([]);
  const [folds, setFolds] = useState([]);
  const [peek, setPeek] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [cook, setCook] = useState(null);
  const [timers, setTimers] = useState({});

  const reload = useCallback(async () => {
    const d = await loadBoard();
    setData(d); setOverrides({}); setPendingAdds([]);
    return d;
  }, []);

  // Load now, then every few minutes and whenever the screen wakes up.
  useEffect(() => {
    takeKeyFromUrl();
    reload();
    const id = setInterval(reload, REFRESH_MS);
    const vis = () => { if (!document.hidden) reload(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [reload]);

  const hasTimers = Object.keys(timers).length > 0;
  const tick = useTick(hasTimers ? 1000 : 30000);
  const now = useMemo(() => new Date(tick + opts.offset * DAY), [tick, opts.offset]);

  // Keep the screen on where the browser allows it.
  useEffect(() => {
    let lock;
    const wake = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed */ } };
    const vis = () => { if (!document.hidden) wake(); };
    wake(); document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release?.(); };
  }, []);

  // Back to the board after two minutes untouched. A recipe stays open so its timers aren't lost.
  const lastTouch = useRef(Date.now());
  useEffect(() => {
    const touch = () => (lastTouch.current = Date.now());
    ['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, touch, true));
    const id = setInterval(() => {
      if (Date.now() - lastTouch.current < IDLE_MS || cook) return;
      setPeek(null); setDrawer(false); setFolds([]);
      document.querySelectorAll('[data-scroll]').forEach((s) => (s.scrollTop = 0));
      lastTouch.current = Date.now();
    }, 15000);
    return () => { clearInterval(id); ['pointerdown', 'keydown'].forEach((e) => document.removeEventListener(e, touch, true)); };
  }, [cook]);

  const goStep = useCallback((p) => setCook((c) => {
    const last = data.recipes[c.id].steps.length, page = Math.max(0, Math.min(last, p));
    return { ...c, page, seen: c.seen.includes(page) ? c.seen : [...c.seen, page] };
  }), [data]);
  const closeCook = useCallback(() => setCook(null), []);

  if (!data) return <div className="fb" />;

  const liveChores = data.status.chores.status === 'live';
  const liveShop = data.status.shopping.status === 'live';
  const ts = tripState(data.trips, data.home, now, opts);
  const breeding = nextBreeding(data.sessions, ts, now, opts);
  const sitter = opts.sitter || (opts.autoSitter && !!ts.away);
  const fold = (k) => setFolds((f) => toggleIn(f, k));

  const choreKey = (id) => `chore:${id}`, itemKey = (id) => `item:${id}`;
  const done = liveChores
    ? data.chores.filter((c) => overrides[choreKey(c.id)] ?? c.done).map((c) => c.id)
    : localDone;
  const items = (liveShop ? [...data.shopping, ...pendingAdds] : [...data.shopping, ...extra]).filter((i) => !cleared.includes(i.id));
  const bought = liveShop
    ? items.filter((i) => overrides[itemKey(i.id)] ?? i.bought).map((i) => i.id)
    : localBought;

  /** Tell the app; on failure, put the row back and say so. */
  const sendLive = async (key, path, body, revertMsg) => {
    setOverrides((o) => ({ ...o, [key]: Object.values(body)[0] }));
    const r = await callApi(path, { method: 'POST', body });
    if (!r.ok) {
      setOverrides((o) => { const n = { ...o }; delete n[key]; return n; });
      toast(r.data?.error ? `${revertMsg}: ${r.data.error}` : revertMsg, { type: 'error', duration: 5000 });
      return false;
    }
    return true;
  };

  const setChore = (c, value) => (liveChores
    ? sendLive(choreKey(c.id), `/api/chores/${encodeURIComponent(c.id)}`, { done: value }, `Couldn't update ${c.title} in GalaxyFarm`)
    : setLocalDone((d) => (value ? [...new Set([...d, c.id])] : d.filter((x) => x !== c.id))));
  const toggleChore = async (c) => {
    const was = done.includes(c.id);
    const okay = await setChore(c, !was);
    if (!was && okay !== false) toast(`${c.title} ticked off`, { duration: 5000, action: { label: 'Undo', onClick: () => setChore(c, false) } });
  };

  const setItem = (i, value) => (liveShop && !String(i.id).startsWith('pending:')
    ? sendLive(itemKey(i.id), `/api/shopping/${encodeURIComponent(i.id)}`, { bought: value }, `Couldn't update ${i.name} in KitchenHub`)
    : setLocalBought((b) => (value ? [...new Set([...b, i.id])] : b.filter((x) => x !== i.id))));
  const toggleItem = async (i) => {
    const was = bought.includes(i.id);
    const okay = await setItem(i, !was);
    if (!was && okay !== false) toast(`${i.name} is in the cart`, { duration: 5000, action: { label: 'Undo', onClick: () => setItem(i, false) } });
  };

  const addItem = async (name, section = 'Added on the fridge') => {
    if (!liveShop) {
      const item = { id: `x${Date.now()}`, name, qty: '', section };
      setExtra((e) => [...e, item]);
      toast(`${name} added`, { duration: 5000, action: { label: 'Undo', onClick: () => setExtra((e) => e.filter((x) => x.id !== item.id)) } });
      return;
    }
    const temp = { id: `pending:${Date.now()}`, name, qty: '', section, why: '', bought: false };
    setPendingAdds((p) => [...p, temp]);
    const r = await callApi('/api/shopping', { method: 'POST', body: { name, section } });
    if (!r.ok) {
      setPendingAdds((p) => p.filter((x) => x.id !== temp.id));
      toast(`Couldn't add ${name} to KitchenHub`, { type: 'error', duration: 5000 });
      return;
    }
    toast(`${name} added to KitchenHub`);
    reload();
  };

  const clearCart = () => {
    const ids = items.filter((i) => bought.includes(i.id)).map((i) => i.id);
    setCleared((c) => [...c, ...ids]); setFolds((f) => f.filter((x) => x !== 'cart'));
    toast(`Cleared ${plural(ids.length, 'item')} from the cart`, { duration: 5000, action: { label: 'Undo', onClick: () => setCleared((c) => c.filter((x) => !ids.includes(x))) } });
  };
  const toggleSitter = () => setOpts((o) => (sitter ? { ...o, sitter: false, autoSitter: ts.away ? false : o.autoSitter } : { ...o, sitter: true }));
  const openCook = (id) => { setPeek(null); clearToasts(); setCook((c) => ({ id, page: 0, seen: [0], gathered: c?.id === id ? c.gathered : [] })); };
  const toggleTimer = (key, mins, label) => setTimers((t) => {
    const n = { ...t };
    if (n[key]) delete n[key]; else n[key] = { endsAt: Date.now() + mins * 60000, label };
    return n;
  });
  const jumpToTimer = (key) => {
    const [rid, step] = key.split(':');
    if (Date.now() >= timers[key].endsAt) { toggleTimer(key); return; }
    setCook((c) => ({ id: rid, page: +step, seen: [...new Set([...(c?.id === rid ? c.seen : [0]), +step])], gathered: c?.id === rid ? c.gathered : [] }));
  };
  const reset = () => { setLocalDone([]); setLocalBought([]); setCleared([]); setExtra([]); toast('Cleared ticks and added items on this device'); };
  const saveKey = async (k) => { setKey(k); const d = await reload(); if (!d.locked) toast('Board unlocked'); return !d.locked; };
  const peekMeal = peek != null && data.meals.find((m) => m.d === peek && m.type === 'Dinner');

  return (
    <div className="fb">
      <Header now={now} weather={data.weather} weatherStatus={data.status.weather} sitter={sitter} onToggleSitter={toggleSitter} onOpenSettings={() => setDrawer(true)} phone={phone} />
      {data.locked && <LockBanner reason={data.locked} onSave={saveKey} />}
      <AwayBanner trip={ts.away} />
      <main className="board">
        <Farm chores={data.chores} done={done} onToggle={toggleChore} now={now} folds={folds} onFold={fold} phone={phone} sitter={sitter} status={data.status.chores} />
        <section className="kitchen zone" aria-label="Kitchen">
          <Meals meals={data.meals} recipes={data.recipes} expiring={data.expiring} onCook={openCook} onPeek={setPeek} phone={phone} status={data.status.meals} />
          <Shopping items={items} quick={data.quick} bought={bought} onToggle={toggleItem} onAdd={addItem} onClear={clearCart} folds={folds} onFold={fold} phone={phone} status={data.status.shopping} />
        </section>
        {sitter
          ? <SitterPanel ts={ts} breeding={breeding} sitter={data.sitter} now={now} phone={phone} status={data.status} />
          : <ComingUp ts={ts} breeding={breeding} tasks={data.tasks} subjects={data.subjects} now={now} opts={opts} phone={phone} status={data.status} />}
      </main>

      {!cook && hasTimers && <div className="board-timers fb-layer"><TimerChips timers={timers} now={tick} onJump={jumpToTimer} /></div>}
      {peekMeal && data.recipes[peekMeal.recipe] && <RecipeSheet meal={peekMeal} recipe={data.recipes[peekMeal.recipe]} onClose={() => setPeek(null)} onCook={openCook} phone={phone} />}
      {cook && data.recipes[cook.id] && (
        <CookMode cook={cook} recipe={data.recipes[cook.id]} timers={timers} now={tick} onGo={goStep} onClose={closeCook}
          onToggleTimer={toggleTimer} onJump={jumpToTimer} onGather={(n) => setCook((c) => ({ ...c, gathered: toggleIn(c.gathered, n) }))} />
      )}
      {drawer && <SettingsDrawer opts={opts} setOpts={setOpts} now={now} onClose={() => setDrawer(false)} onReset={reset} onSaveKey={saveKey} home={data.home} />}
    </div>
  );
}
