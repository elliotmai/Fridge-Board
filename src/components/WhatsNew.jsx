import { useState } from 'react';
import { WHATS_NEW } from '@/config/whatsNew';
import { APP_KEY } from '@/config/app';

const STORAGE_KEY = `${APP_KEY}.whatsNewSeen`;

// Compare versions like "2026.07.26" and "2026.07.26.2" numerically per segment,
// so same-day increments (.1, .2, … .10) order correctly.
function cmpVersion(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}


// Read the changelog once and return every entry newer than what this device
// last saw. First visit (no stored value) shows only the newest entry.
function unseenEntries() {
  const latest = WHATS_NEW[0];
  if (!latest) return [];
  let seen = null;
  try {
    seen = localStorage.getItem(STORAGE_KEY);
  } catch {
    seen = null;
  }
  // Versions are zero-padded YYYY.MM.DD, so string comparison orders them.
  return seen == null ? [latest] : WHATS_NEW.filter((e) => cmpVersion(e.version, seen) > 0);
}

/**
 * Accumulating "What's New" popup. The next time a person opens the app after
 * one or more updates, it shows EVERY changelog entry newer than what this
 * device has already seen — combined into one popup — then remembers the latest
 * version locally so nothing repeats until the next update.
 */
export function WhatsNew() {
  const latest = WHATS_NEW[0];
  const [entries, setEntries] = useState(unseenEntries);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, latest.version);
    } catch {
      /* ignore storage failures */
    }
    setEntries([]);
  }

  if (!entries.length || !latest) return null;

  const stacked = entries.length > 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 font-sans sm:items-center sm:p-6" onClick={dismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="animate-pop flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-paper text-ink shadow-[var(--shadow-float)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6">
          <h2 id="whats-new-title" className="text-2xl font-extrabold tracking-tight">What&apos;s new in Hive</h2>
          {!stacked && latest.date && <p className="mt-1 text-sm font-semibold text-muted">{latest.date}</p>}
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-4">
          {entries.map((entry) => (
            <div key={entry.version} className="flex flex-col gap-2">
              {stacked && entry.date && <p className="text-sm font-bold text-muted">{entry.date}</p>}
              <ul className="flex flex-col gap-3">
                {entry.items.map((item, i) => (
                  <li key={i} className="border-l-[3px] border-honey pl-3 text-base leading-snug">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="p-4 pt-2">
          <button
            onClick={dismiss}
            className="h-12 w-full rounded-sm bg-ink px-4 font-bold text-paper transition-transform duration-75 active:scale-[0.98]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
