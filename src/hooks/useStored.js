import { useEffect, useState } from 'react';
import { APP_KEY } from '@/config/app';

/** useState that survives reloads on this device. Storage failures are ignored. */
export function useStored(key, initial) {
  const k = `${APP_KEY}.${key}`;
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(k); return s == null ? initial : JSON.parse(s); } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }, [k, v]);
  return [v, setV];
}
