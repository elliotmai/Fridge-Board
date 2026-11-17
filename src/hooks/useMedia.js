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

/** Phones get the stacked layout with links out to each app. Tablets in landscape,
 *  including an 8-inch Fire (about 853 to 962 points wide), get the full board. */
export const useIsPhone = () => useMedia('(max-width: 759px)');
