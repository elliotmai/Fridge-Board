import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { callApi } from '@/data/api';
import { USER_CHANGED, idToken, supabase } from '@/hive/account';
import { byKey, fromRow, newTimerRow, ringing as ringingOf, sortTimers } from '@/lib/kitchenTimers';
import { askToNotify, notifyDone, startRinging, unlockAudio } from '@/lib/ringer';

/*
 * KitchenHub's cooking timers, for the whole of Hive: the fridge board's step
 * timers, the timers anyone started on a phone in KitchenHub, and the alarm
 * when one is done. KitchenHub opened inside Hive leaves the ringing to Hive,
 * so a device never chimes twice.
 *
 * Signed in to Hive, the timers come straight from kitchen.timers (row-level
 * security keeps them to the household) with Realtime. A board that isn't
 * signed in uses its board key through /api/timers and checks every 20
 * seconds. Either way the time left is worked out from each timer's end, so
 * a late update only delays news of a new or stopped timer, never the ring.
 */

const Ctx = createContext(null);
const POLL_MS = 20000;
const COLUMNS = 'id, key, label, duration_s, ends_at';

/** Where the timers are read and written: straight from Supabase, or via the board key. */
async function openSource() {
  if (await idToken()) {
    try {
      const sb = await supabase();
      const { data: hid } = await sb.schema('core').rpc('my_household');
      if (hid) {
        const table = () => sb.schema('kitchen').from('timers');
        return {
          live: true,
          list: async () => {
            const { data, error } = await table().select(COLUMNS).eq('household_id', hid).order('ends_at');
            if (error) throw error;
            return data.map(fromRow);
          },
          add: async (row) => {
            const { error } = await table().insert({ ...row, household_id: hid });
            if (error) throw error;
          },
          remove: async (id) => {
            const { error } = await table().delete().eq('household_id', hid).eq('id', id);
            if (error) throw error;
          },
          watch: (onChange) => {
            const ch = sb.channel(`kitchen-timers:${hid}`)
              .on('postgres_changes', { event: 'INSERT', schema: 'kitchen', table: 'timers', filter: `household_id=eq.${hid}` }, onChange)
              .on('postgres_changes', { event: 'UPDATE', schema: 'kitchen', table: 'timers', filter: `household_id=eq.${hid}` }, onChange)
              .on('postgres_changes', { event: 'DELETE', schema: 'kitchen', table: 'timers' }, onChange)
              .subscribe();
            return () => sb.removeChannel(ch);
          },
        };
      }
    } catch { /* fall back to the board key */ }
  }
  const must = (r) => { if (!r.ok) throw new Error(r.data?.error || `KitchenHub answered ${r.status}`); return r.data; };
  return {
    live: false,
    list: async () => (must(await callApi('/api/timers')).timers || []).map(fromRow),
    add: async (row) => must(await callApi('/api/timers', { method: 'POST', body: { label: row.label, minutes: row.duration_s / 60, key: row.key } })),
    remove: async (id) => must(await callApi(`/api/timers/${encodeURIComponent(id)}`, { method: 'POST', body: { stop: true } })),
    watch: () => () => {},
  };
}

/** Is this Hive itself inside another frame? Then the outer screen rings. */
const framed = () => { try { return window.parent !== window; } catch { return true; } };

export function KitchenTimersProvider({ children }) {
  const [timers, setTimers] = useState([]);
  const [now, setNow] = useState(Date.now());
  const source = useRef(null);

  const reload = useCallback(async () => {
    try {
      source.current ??= await openSource();
      setTimers(await source.current.list());
    } catch { /* keep what we had; the next check tries again */ }
  }, []);

  useEffect(() => {
    let unwatch = () => {};
    const start = async () => {
      unwatch();
      source.current = null;
      await reload();
      unwatch = source.current?.watch(reload) || (() => {});
    };
    start();
    const id = setInterval(() => { if (!source.current?.live) reload(); }, POLL_MS);
    const wake = () => { if (!document.hidden) reload(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener(USER_CHANGED, start);
    // Browsers only allow sound after a tap: the first tap anywhere unlocks it.
    const unlock = () => unlockAudio();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      unwatch(); clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener(USER_CHANGED, start);
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, [reload]);

  // Tick every second while any timer exists.
  const any = timers.length > 0;
  useEffect(() => {
    if (!any) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [any]);

  const sorted = useMemo(() => sortTimers(timers, now), [timers, now]);
  const done = useMemo(() => ringingOf(timers, now), [timers, now]);
  const doneIds = done.map((t) => t.id).join(',');

  // Ring while anything is done; one notification per timer.
  const told = useRef(new Set());
  useEffect(() => {
    if (!doneIds || framed()) return;
    for (const t of done) if (!told.current.has(t.id)) { told.current.add(t.id); notifyDone(t); }
    return startRinging();
    // `done` is read for its ids, which doneIds tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneIds]);

  const start = useCallback(async ({ label, minutes, key }) => {
    unlockAudio();
    askToNotify();
    const row = newTimerRow({ label, minutes, key });
    if (!row) return false;
    const temp = fromRow({ ...row, id: `pending-${Date.now()}` });
    setTimers((l) => [...l, temp]);
    try {
      source.current ??= await openSource();
      await source.current.add(row);
      await reload();
      return true;
    } catch {
      setTimers((l) => l.filter((t) => t.id !== temp.id));
      return false;
    }
  }, [reload]);

  const stop = useCallback(async (id) => {
    setTimers((l) => l.filter((t) => t.id !== id));
    try {
      source.current ??= await openSource();
      await source.current.remove(id);
      return true;
    } catch {
      reload();
      return false;
    }
  }, [reload]);

  const value = useMemo(() => ({ timers: sorted, ringing: done, now, byKey: byKey(timers), start, stop }), [sorted, done, now, timers, start, stop]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useKitchenTimers = () => useContext(Ctx);
