import { useEffect, useState } from 'react';
import { PHONE_QUERY } from '@/hive/device';

export function useMedia(query) {
  const [match, setMatch] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia(query), on = () => setMatch(m.matches);
    m.addEventListener('change', on); on();
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Phones get the stacked layout with links out to each app. Tablets, including the
 *  fridge's 8-inch Fire either way up, get the full board (the rule: src/hive/device.js).
 *  Live: turning the tablet re-lays it out. */
export const useIsPhone = () => useMedia(PHONE_QUERY);
