import { Timer } from './Icons';

export const timerLeft = (t, now) => {
  const s = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
  return s === 0 ? 'Done' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function TimerChips({ timers, now, onJump }) {
  return Object.entries(timers).map(([k, t]) => (
    <button key={k} className={`timer-chip ${now >= t.endsAt ? 'done' : ''}`} onClick={() => onJump(k)}>
      <Timer /><span>{t.label}</span><b>{timerLeft(t, now)}</b>
    </button>
  ));
}
