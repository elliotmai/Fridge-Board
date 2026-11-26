import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { callApi, takeKeyFromUrl } from '@/data/api';
import { loadBoard, REFRESH_MS, RETRY_EVENT } from '@/data/sources';
import { useToast } from '@/context/ToastContext';
import { useStored } from '@/hooks/useStored';
import { USER_CHANGED } from './account';
import { openEggCount, opensEggCount } from '@/lib/eggs';

/**
 * The board's feed for the home screen, with ticks from widgets laid over it.
 *
 * Live ticks go to the app that owns the thing (GalaxyFarm, KitchenHub,
 * LearnLeaf, Google Tasks) and show straight away; the next refresh brings the
 * app's own answer. In sample mode (signed out only), and for shopping lines KitchenHub can't
 * tick (worked out from the meal plan), ticks stay on this device, in the same
 * storage the board uses, so the two agree.
 *
 * Returns `{ data, act }`. `data` has `chores[].done`, `shopping[].bought` and
 * `todosDone` (keys from mergeTodos) already applied, so widgets and badges
 * just read it.
 */
export function useLiveBoard() {
  const { toast } = useToast();
  const [raw, setRaw] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [pendingAdds, setPendingAdds] = useState([]);
  const [localDone, setLocalDone] = useStored('done', []);
  const [localBought, setLocalBought] = useStored('bought', []);
  const [localTodos, setLocalTodos] = useStored('todosDone', []);
  const [extra, setExtra] = useStored('extra', []);
  const [cleared] = useStored('cleared', []);

  const reload = useCallback(async () => {
    const d = await loadBoard();
    setRaw(d); setOverrides({}); setPendingAdds([]);
  }, []);

  useEffect(() => {
    takeKeyFromUrl();
    reload();
    const id = setInterval(reload, REFRESH_MS);
    const vis = () => { if (!document.hidden) reload(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener(USER_CHANGED, reload);
    window.addEventListener(RETRY_EVENT, reload);
    return () => {
      clearInterval(id); document.removeEventListener('visibilitychange', vis);
      window.removeEventListener(USER_CHANGED, reload); window.removeEventListener(RETRY_EVENT, reload);
    };
  }, [reload]);

  const live = (section) => raw?.status[section]?.status === 'live';
  const localOnly = (id) => /^(meal|pending):/.test(String(id));

  const data = useMemo(() => {
    if (!raw) return null;
    const lc = raw.status.chores.status === 'live', ls = raw.status.shopping.status === 'live';
    const chores = raw.chores.map((c) => ({ ...c, done: lc ? overrides[`chore:${c.id}`] ?? c.done : localDone.includes(c.id) }));
    const shopping = (ls ? [...raw.shopping, ...pendingAdds] : [...raw.shopping, ...extra])
      .filter((i) => !cleared.includes(i.id))
      .map((i) => ({ ...i, bought: ls && !localOnly(i.id) ? overrides[`item:${i.id}`] ?? i.bought : localBought.includes(i.id) }));
    const todosDone = [
      ...localTodos,
      ...Object.entries(overrides).filter(([k, v]) => k.startsWith('todo:') && v).map(([k]) => k.slice(5)),
    ].filter((k) => !(overrides[`todo:${k}`] === false));
    return { ...raw, chores, shopping, todosDone };
  }, [raw, overrides, pendingAdds, localDone, localBought, localTodos, extra, cleared]);

  /** Tell the app; on failure, put it back and say so. */
  const send = async (key, path, body, fail) => {
    setOverrides((o) => ({ ...o, [key]: Object.values(body)[0] }));
    const r = await callApi(path, { method: 'POST', body });
    if (!r.ok) {
      setOverrides((o) => { const n = { ...o }; delete n[key]; return n; });
      toast(r.data?.error ? `${fail}: ${r.data.error}` : fail, { type: 'error', duration: 5000 });
      return false;
    }
    return true;
  };
  const inList = (set) => (id, on) => set((l) => (on ? [...new Set([...l, id])] : l.filter((x) => x !== id)));

  const setChore = (c, on) => (live('chores')
    ? send(`chore:${c.id}`, `/api/chores/${encodeURIComponent(c.id)}`, { done: on }, `Couldn't update ${c.title} in GalaxyFarm`)
    : (inList(setLocalDone)(c.id, on), true));
  const setItem = (i, on) => (live('shopping') && !localOnly(i.id)
    ? send(`item:${i.id}`, `/api/shopping/${encodeURIComponent(i.id)}`, { bought: on }, `Couldn't update ${i.name} in KitchenHub`)
    : (inList(setLocalBought)(i.id, on), true));
  const setTodo = (t, on) => {
    const isLive = live(t.source === 'google' ? 'gtasks' : 'tasks');
    if (!isLive) { inList(setLocalTodos)(t.key, on); return true; }
    const path = t.source === 'google'
      ? `/api/todos/google/${encodeURIComponent(t.list)}/${encodeURIComponent(t.id)}`
      : `/api/todos/learnleaf/${encodeURIComponent(t.id)}`;
    return send(`todo:${t.key}`, path, { done: on }, `Couldn't update ${t.name} in ${t.source === 'google' ? 'Google Tasks' : 'LearnLeaf'}`);
  };

  /** Flip, and offer Undo when something was ticked off. True when it landed. */
  const flip = async (set, thing, was, msg) => {
    const ok = await set(thing, !was);
    if (!was && ok !== false) toast(msg, { duration: 5000, action: { label: 'Undo', onClick: () => set(thing, false) } });
    return ok !== false;
  };

  const act = {
    chore: async (c) => {
      const landed = await flip(setChore, c, c.done, `${c.title} ticked off`);
      // Ticking off the egg round opens GalaxyFarm's egg count — once GalaxyFarm
      // has the tick, so a refused one leaves you on the home screen.
      if (landed && opensEggCount(c, c.done, live('chores'))) openEggCount();
    },
    item: (i) => flip(setItem, i, i.bought, `${i.name} is in the cart`),
    todo: (t, done) => flip(setTodo, t, done, `${t.name} done`),
    addItem: async (name) => {
      name = name.trim();
      if (!name) return;
      const section = 'Added in Hive';
      if (!live('shopping')) {
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
    },
  };

  return { data, act };
}

/** What widgets can do. Without a provider (the menu's preview), nothing. */
const noop = () => {};
export const WidgetActions = createContext({ chore: noop, item: noop, todo: noop, addItem: noop, open: noop });
export const useWidgetActions = () => useContext(WidgetActions);
