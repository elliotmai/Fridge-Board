import { useEffect, useRef, useState } from 'react';
import { clockParts } from './Home';
import { glance, smartPick } from './smart';
import { StackView } from './Stack';
import { WIDGETS } from './widgets';

export const DEFAULT_REST = {
  face: 'stacks', // stacks: the clock and two widget stacks | clock: the clock alone
  night: true, // red and dim from 9 pm to 6 am
  slots: [['today', 'calendar', 'trip'], ['chores', 'dinner', 'shopping', 'tasks']],
};

const isNight = (now) => now.getHours() >= 21 || now.getHours() < 6;
const MANUAL_MS = 30 * 60 * 1000;

/**
 * The clock screen, for a wall display left alone: the time as big as it can
 * be, and (if chosen) two widget stacks that turn to what matters by the hour.
 * Widgets still work (tick a chore on the way past). Tap the clock or any
 * empty space, or press a key, to go back.
 *
 * Landscape puts the clock beside the stacks, portrait above them. At night it
 * turns dim red, so it doesn't light up the kitchen. Everything shifts a few
 * pixels each minute, so a screen that's always on doesn't burn in.
 */
export function ClockScreen({ data, now, sig, rest, custom, onOpenWidget, onClose }) {
  const r = { ...DEFAULT_REST, ...rest };
  const slots = (r.slots || []).map((s) => s.filter((w) => WIDGETS[w])).filter((s) => s.length);
  const showStacks = r.face === 'stacks' && slots.length > 0;
  const [sel, setSel] = useState({}); // slot → { i, at, dir }
  const ref = useRef(null);
  const { t, ap } = clockParts(now);
  const m = now.getHours() * 60 + now.getMinutes();
  const shift = `translate3d(${((m * 7) % 13) - 6}px, ${((m * 5) % 11) - 5}px, 0)`;
  const line = glance(sig);

  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    const key = (e) => { if (e.key !== 'Tab' && !e.target.closest?.('.rest-stack')) { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.({ preventScroll: true }); };
  }, [onClose]);

  const indexOf = (n, ws) => {
    const s = sel[n];
    return s && Date.now() - s.at < MANUAL_MS ? Math.min(s.i, ws.length - 1) : smartPick(ws, sig);
  };
  const turn = (n, ws, dir) => setSel((s) => ({ ...s, [n]: { i: (indexOf(n, ws) + dir + ws.length) % ws.length, at: Date.now(), dir } }));

  return (
    <div ref={ref} tabIndex={-1} className={`rest hive-layer ${r.night && isNight(now) ? 'night' : ''} ${showStacks ? 'with-stacks' : 'clock-only'}`}
      role="dialog" aria-modal="true" aria-label="Clock screen. Tap or press any key to go back."
      onClick={(e) => { if (!e.target.closest('.rest-stack')) onClose(); }}>
      <div className="rest-shift" style={{ transform: shift }}>
        <div className="rest-clock">
          <b className="clock-digits">{t}{ap && <small>{ap}</small>}</b>
          <span>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          {line && <em>{line.text}</em>}
        </div>
        {showStacks && (
          <div className="rest-stacks">
            {slots.slice(0, 2).map((ws, n) => (
              <div className="rest-stack" key={n}>
                <StackView widgets={ws} index={indexOf(n, ws)} dir={sel[n]?.dir} size="l" data={data} now={now} custom={custom} swipe
                  onTurn={(d) => turn(n, ws, d)} onOpen={(to) => onOpenWidget(ws[indexOf(n, ws)], to)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
