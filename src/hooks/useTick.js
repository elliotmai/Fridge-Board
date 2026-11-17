import { useEffect, useState } from 'react';

/** Re-render every `ms` milliseconds while `active`. Returns the current time. */
export function useTick(ms, active = true) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return t;
}
