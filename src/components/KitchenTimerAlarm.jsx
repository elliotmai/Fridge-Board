import { useKitchenTimers } from '@/context/KitchenTimers';
import { audioReady } from '@/lib/ringer';
import { timeLeft } from '@/lib/kitchenTimers';
import { Timer } from '@/components/board/Icons';

/**
 * Over everything in Hive: the alarm for a finished KitchenHub timer, with a
 * big Stop (which stops it on every screen in the household), and, away from
 * the fridge board (it shows its own), the timers still counting down.
 */
export function KitchenTimerAlarm() {
  const kt = useKitchenTimers();
  if (!kt) return null;
  const { ringing, timers, now, stop } = kt;
  const boardShown = typeof document !== 'undefined' && document.querySelector('.fb')?.offsetParent != null;
  const running = timers.filter((t) => t.endsAt > now);

  return (
    <>
      {!boardShown && running.length > 0 && (
        <div className="board-timers fb-layer hive-timers" aria-label="Kitchen timers">
          {running.map((t) => (
            <button key={t.id} className="timer-chip" onClick={() => { if (window.confirm(`Stop the ${t.label} timer?`)) stop(t.id); }}>
              <Timer /><span>{t.label}</span><b>{timeLeft(t, now)}</b>
            </button>
          ))}
        </div>
      )}
      {ringing.length > 0 && (
        <div className="timer-alarm fb-layer" role="alertdialog" aria-modal="true" aria-labelledby="timer-alarm-title">
          <div className="timer-alarm-card">
            <Timer />
            <h2 id="timer-alarm-title">{ringing.length === 1 ? `${ringing[0].label} is done` : `${ringing.length} timers are done`}</h2>
            {ringing.length > 1 && (
              <ul>
                {ringing.map((t) => (
                  <li key={t.id}><span>{t.label}</span><button onClick={() => stop(t.id)}>Stop</button></li>
                ))}
              </ul>
            )}
            <button className="timer-alarm-stop" onClick={() => ringing.forEach((t) => stop(t.id))}>{ringing.length === 1 ? 'Stop' : 'Stop all'}</button>
            {!audioReady() && <p>Tap anywhere on this screen so it can ring out loud next time.</p>}
          </div>
        </div>
      )}
    </>
  );
}
