import { useEffect, useRef } from 'react';
import { CheckRow } from './bits';
import { Close, Left, Right, Timer } from './Icons';
import { TimerChips, timerLeft } from './timers';

export function CookMode({ cook, recipe, timers, now, onGo, onClose, onToggleTimer, onJump, onGather }) {
  const { id, page: p, seen, gathered } = cook;
  const last = recipe.steps.length;
  const startX = useRef(null);

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'ArrowRight') onGo(p + 1);
      if (e.key === 'ArrowLeft') onGo(p - 1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [p, onGo, onClose]);

  let body;
  if (p === 0) {
    body = (
      <>
        <div className="main">
          <span className="stepno">{[recipe.time, recipe.serves && `serves ${recipe.serves}`].filter(Boolean).join(', ') || 'Ingredients'}</span>
          <h3>{recipe.name}</h3>
          <div className="text">{recipe.sub && <p>{recipe.sub}.</p>}<p>Gather everything on the right, then start step 1. Tap an ingredient once you have it out.</p></div>
        </div>
        <aside>
          <h4>Gather {gathered.length} of {recipe.ingredients.length}</h4>
          <div>{recipe.ingredients.map((ing, n) => <CheckRow key={ing} checked={gathered.includes(n)} onToggle={() => onGather(n)}>{ing}</CheckRow>)}</div>
        </aside>
      </>
    );
  } else {
    const s = recipe.steps[p - 1], key = `${id}:${p}`, t = timers[key], finished = t && now >= t.endsAt;
    body = (
      <>
        <div className="main">
          <span className="stepno">Step {p} of {last}</span>
          <h3>{s.title}</h3>
          <div className="text">{s.text.map((x) => <p key={x}>{x}</p>)}</div>
          {s.timer && (
            <button className={`timer-btn ${t ? (finished ? 'done' : 'running') : ''}`} onClick={() => onToggleTimer(key, s.timer, s.title)}>
              <Timer />
              <span>{t ? (finished ? "Time's up. Tap to clear" : <><b>{timerLeft(t, now)}</b> left. Tap to stop</>) : `Start a ${s.timer} minute timer`}</span>
            </button>
          )}
        </div>
        <aside><h4>For this step</h4><ul>{s.uses.length ? s.uses.map((u) => <li key={u}>{u}</li>) : <li>Nothing new</li>}</ul></aside>
      </>
    );
  }

  return (
    <div className="cook fb-layer" role="dialog" aria-modal="true" aria-labelledby="cookTitle"
      onPointerDown={(e) => { if (e.target.closest('.card')) startX.current = e.clientX; }}
      onPointerUp={(e) => { if (startX.current == null) return; const dx = e.clientX - startX.current; startX.current = null; if (Math.abs(dx) > 70) onGo(p + (dx < 0 ? 1 : -1)); }}>
      <div className="cook-top">
        <h2 id="cookTitle">{recipe.name}</h2>
        <div className="tray"><TimerChips timers={timers} now={now} onJump={onJump} /></div>
        <button className="round" aria-label="Close recipe" onClick={onClose}><Close /></button>
      </div>
      <div className="segs">
        {Array.from({ length: last + 1 }, (_, i) => (
          <button key={i} aria-label={i ? `Step ${i}` : 'Ingredients'} aria-current={i === p ? 'step' : undefined} className={seen.includes(i) ? 'seen' : ''} onClick={() => onGo(i)}><i /></button>
        ))}
      </div>
      <div className="card">{body}</div>
      <div className="cook-nav">
        <button disabled={p === 0} onClick={() => onGo(p - 1)}><Left />Back</button>
        {p < last
          ? <button className="primary" onClick={() => onGo(p + 1)}>{p === 0 ? 'Start step 1' : 'Next step'}<Right /></button>
          : <button className="primary" onClick={onClose}>Done cooking</button>}
      </div>
    </div>
  );
}
