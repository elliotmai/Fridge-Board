import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { loadBoard } from '@/data/sources';
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
  const [done, setDone] = useStored('done', []);
  const [bought, setBought] = useStored('bought', []);
  const [cleared, setCleared] = useStored('cleared', []);
  const [extra, setExtra] = useStored('extra', []);
  const [folds, setFolds] = useState([]);
  const [peek, setPeek] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [cook, setCook] = useState(null);
  const [timers, setTimers] = useState({});

  useEffect(() => { loadBoard().then(setData); }, []);

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

  const ts = tripState(data.trips, data.home, now, opts);
  const breeding = nextBreeding(data.sessions, ts, now, opts);
  const sitter = opts.sitter || (opts.autoSitter && !!ts.away);
  const items = data.shopping.concat(extra).filter((i) => !cleared.includes(i.id));
  const fold = (k) => setFolds((f) => toggleIn(f, k));

  const toggleChore = (c) => {
    const was = done.includes(c.id);
    setDone((d) => toggleIn(d, c.id));
    if (!was) toast(`${c.title} ticked off`, { duration: 5000, action: { label: 'Undo', onClick: () => setDone((d) => d.filter((x) => x !== c.id)) } });
  };
  const toggleItem = (i) => {
    const was = bought.includes(i.id);
    setBought((b) => toggleIn(b, i.id));
    if (!was) toast(`${i.name} is in the cart`, { duration: 5000, action: { label: 'Undo', onClick: () => setBought((b) => b.filter((x) => x !== i.id)) } });
  };
  const addItem = (name, section = 'Added on the fridge') => {
    const item = { id: `x${Date.now()}`, name, qty: '', section };
    setExtra((e) => [...e, item]);
    toast(`${name} added`, { duration: 5000, action: { label: 'Undo', onClick: () => setExtra((e) => e.filter((x) => x.id !== item.id)) } });
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
  const reset = () => { setDone([]); setBought([]); setCleared([]); setExtra([]); toast('Ticks and added items cleared'); };
  const peekMeal = peek != null && data.meals.find((m) => m.d === peek && m.type === 'Dinner');

  return (
    <div className="fb">
      <Header now={now} weather={data.weather} sitter={sitter} onToggleSitter={toggleSitter} onOpenSettings={() => setDrawer(true)} phone={phone} />
      <AwayBanner trip={ts.away} />
      <main className="board">
        <Farm chores={data.chores} done={done} onToggle={toggleChore} now={now} folds={folds} onFold={fold} phone={phone} sitter={sitter} />
        <section className="kitchen zone" aria-label="Kitchen">
          <Meals meals={data.meals} recipes={data.recipes} expiring={data.expiring} onCook={openCook} onPeek={setPeek} phone={phone} />
          <Shopping items={items} quick={data.quick} bought={bought} onToggle={toggleItem} onAdd={addItem} onClear={clearCart} folds={folds} onFold={fold} phone={phone} />
        </section>
        {sitter
          ? <SitterPanel ts={ts} breeding={breeding} sitter={data.sitter} now={now} phone={phone} />
          : <ComingUp ts={ts} breeding={breeding} tasks={data.tasks} subjects={data.subjects} now={now} opts={opts} phone={phone} />}
      </main>

      {!cook && hasTimers && <div className="board-timers fb-layer"><TimerChips timers={timers} now={tick} onJump={jumpToTimer} /></div>}
      {peekMeal && <RecipeSheet meal={peekMeal} recipe={data.recipes[peekMeal.recipe]} onClose={() => setPeek(null)} onCook={openCook} phone={phone} />}
      {cook && (
        <CookMode cook={cook} recipe={data.recipes[cook.id]} timers={timers} now={tick} onGo={goStep} onClose={closeCook}
          onToggleTimer={toggleTimer} onJump={jumpToTimer} onGather={(n) => setCook((c) => ({ ...c, gathered: toggleIn(c.gathered, n) }))} />
      )}
      {drawer && <SettingsDrawer opts={opts} setOpts={setOpts} now={now} onClose={() => setDrawer(false)} onReset={reset} />}
    </div>
  );
}
