import { useEffect, useState } from 'react';

export function useMedia(query) {
  const [match, setMatch] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia(query), on = () => setMatch(m.matches);
    m.addEventListener('change', on); on();
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Phones and narrow screens get the stacked layout with links out to each app. */
export const useIsPhone = () => useMedia('(max-width: 1000px)');
