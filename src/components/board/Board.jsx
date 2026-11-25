import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { useKitchenTimers } from '@/context/KitchenTimers';
import { stepKey } from '@/lib/kitchenTimers';
import { USER_CHANGED } from '@/hive/account';
import { callApi, setKey, takeKeyFromUrl } from '@/data/api';
import { loadBoard, REFRESH_MS } from '@/data/sources';
import { useIsPhone } from '@/hooks/useMedia';
import { useStored } from '@/hooks/useStored';
import { useTick } from '@/hooks/useTick';
import { DAY, plural } from '@/lib/dates';
import { dedupeEvents, mergeTodos, timeline } from '@/lib/agenda';
import { nextBreeding, tripState } from '@/lib/derive';
import { ComingUp, SitterGuide, SitterPanel } from './Ahead';
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

/** `onHome` (from Hive) adds a button back to the home screen. */
export function Board({ onHome }) {
  const { toast, clear: clearToasts } = useToast();
  const phone = useIsPhone();
  const [data, setData] = useState(null);
  const [opts, setOpts] = useStored('opts', DEFAULT_OPTS);
  // Sample-mode ticks live on this device. Live ticks go to the app; `overrides`
  // shows them straight away until the next refresh brings the app's own answer.
  const [localDone, setLocalDone] = useStored('done', []);
  const [localBought, setLocalBought] = useStored('bought', []);
  const [localTodos, setLocalTodos] = useStored('todosDone', []);
  const [cleared, setCleared] = useStored('cleared', []);
  const [extra, setExtra] = useStored('extra', []);
  const [overrides, setOverrides] = useState({});
  const [pendingAdds, setPendingAdds] = useState([]);
  const [folds, setFolds] = useState([]);
  const [peek, setPeek] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [cook, setCook] = useState(null);
  // KitchenHub's timers, shared with every screen in the household
  // (src/context/KitchenTimers.jsx). Here they are keyed the board's way:
  // '<recipe>:<page>' for a step's timer, 'timer:<id>' for any other.
  const kitchenTimers = useKitchenTimers();
  const timers = useMemo(() => Object.fromEntries((kitchenTimers?.timers || []).map((t) => {
    const step = /^recipe:(.+):(\d+)$/.exec(t.key || '');
    return [step ? `${step[1]}:${+step[2] + 1}` : `timer:${t.id}`, t];
  })), [kitchenTimers?.timers]);

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
    window.addEventListener(USER_CHANGED, reload);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener(USER_CHANGED, reload); };
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
    ? items.filter((i) => (/^(meal|pending):/.test(String(i.id)) ? localBought.includes(i.id) : overrides[itemKey(i.id)] ?? i.bought)).map((i) => i.id)
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

  // KitchenHub has no tick for lines worked out from the meal plan (ids "meal:…"),
  // so those, like rows still being added, are ticked on this device only.
  const localOnly = (id) => /^(meal|pending):/.test(String(id));
  const setItem = (i, value) => (liveShop && !localOnly(i.id)
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
  const toggleTimer = async (key, mins, label) => {
    if (timers[key]) { kitchenTimers.stop(timers[key].id); return; }
    const [rid, page] = [key.slice(0, key.lastIndexOf(':')), +key.slice(key.lastIndexOf(':') + 1)];
    const name = data.recipes[rid]?.name;
    const ok = await kitchenTimers.start({ key: stepKey(rid, page - 1), minutes: mins, label: name ? `${name}: ${label}` : label });
    if (!ok) toast("Couldn't start the timer", { type: 'error', duration: 5000 });
  };
  const jumpToTimer = (key) => {
    if (Date.now() >= timers[key].endsAt) { toggleTimer(key); return; }
    if (key.startsWith('timer:')) return;
    const rid = key.slice(0, key.lastIndexOf(':')), step = key.slice(key.lastIndexOf(':') + 1);
    setCook((c) => ({ id: rid, page: +step, seen: [...new Set([...(c?.id === rid ? c.seen : [0]), +step])], gathered: c?.id === rid ? c.gathered : [] }));
  };
  const reset = () => { setLocalDone([]); setLocalBought([]); setLocalTodos([]); setCleared([]); setExtra([]); toast('Cleared ticks and added items on this device'); };
  const saveKey = async (k) => { setKey(k); const d = await reload(); if (!d.locked) toast('Board unlocked'); return !d.locked; };
  // To do: LearnLeaf + Google Tasks in one list. Ticks go to the app that owns
  // the task; in sample mode they stay on this device.
  const todos = mergeTodos({ learnleaf: data.tasks, subjects: data.subjects, google: data.gtasks }, now);
  const liveTodo = (t) => (t.source === 'google' ? data.status.gtasks : data.status.tasks).status === 'live';
  const todoKey = (t) => `todo:${t.key}`;
  const todoDone = todos.filter((t) => (liveTodo(t) ? overrides[todoKey(t)] ?? false : localTodos.includes(t.key))).map((t) => t.key);
  const setTodo = (t, value) => {
    if (!liveTodo(t)) { setLocalTodos((d) => (value ? [...new Set([...d, t.key])] : d.filter((x) => x !== t.key))); return true; }
    const path = t.source === 'google'
      ? `/api/todos/google/${encodeURIComponent(t.list)}/${encodeURIComponent(t.id)}`
      : `/api/todos/learnleaf/${encodeURIComponent(t.id)}`;
    return sendLive(todoKey(t), path, { done: value }, `Couldn't update ${t.name} in ${t.source === 'google' ? 'Google Tasks' : 'LearnLeaf'}`);
  };
  const toggleTodo = async (t) => {
    const was = todoDone.includes(t.key);
    const okay = await setTodo(t, !was);
    if (!was && okay !== false) toast(`${t.name} done`, { duration: 5000, action: { label: 'Undo', onClick: () => setTodo(t, false) } });
  };

  // Coming up: tasks, calendar, trips and breeding in one list by day. Calendar
  // events that are really a Wander trip show once, as the trip.
  const { shown: calEvents, hidden: tripEvents } = dedupeEvents(data.events, data.trips);
  const tl = timeline({ todos, events: calEvents, trips: ts.all, breeding }, now, { horizon: 14 });

  const peekMeal = peek != null && data.meals.find((m) => m.d === peek && m.type === 'Dinner');

  return (
    <div className="fb">
      <Header now={now} weather={data.weather} weatherStatus={data.status.weather} sitter={sitter} onToggleSitter={toggleSitter} onOpenSettings={() => setDrawer(true)} onHome={onHome} phone={phone} />
      {data.locked && <LockBanner reason={data.locked} onSave={saveKey} />}
      <AwayBanner trip={ts.away} sitter={sitter} onTurnOff={toggleSitter} />
      <main className={`board ${sitter ? 'sitter' : ''}`}>
        <Farm chores={data.chores} done={done} onToggle={toggleChore} now={now} folds={folds} onFold={fold} phone={phone} sitter={sitter} status={data.status.chores} />
        {sitter ? (
          <SitterGuide sitter={data.sitter} phone={phone} status={data.status.sitter} />
        ) : (
          <section className="kitchen zone" aria-label="Kitchen">
            <Meals meals={data.meals} recipes={data.recipes} expiring={data.expiring} onCook={openCook} onPeek={setPeek} phone={phone} status={data.status.meals} />
            <Shopping items={items} quick={data.quick} bought={bought} onToggle={toggleItem} onAdd={addItem} onClear={clearCart} folds={folds} onFold={fold} phone={phone} status={data.status.shopping} />
          </section>
        )}
        {sitter
          ? <SitterPanel ts={ts} breeding={breeding} sitter={data.sitter} now={now} phone={phone} status={data.status} />
          : <ComingUp tl={tl} todoDone={todoDone} onToggleTodo={toggleTodo} hiddenEvents={tripEvents.length} phone={phone} status={data.status} />}
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
