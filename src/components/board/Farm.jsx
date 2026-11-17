import { SLOTS } from '@/lib/derive';
import { CheckRow, Fold, OpenIn } from './bits';
import { DoneCircle } from './Icons';

const byText = (k, by) => (k === 'owed' ? '' : by === 24 ? 'by bedtime' : `by ${by > 12 ? by - 12 : by} ${by >= 12 ? 'pm' : 'am'}`);

export function Farm({ chores, done, onToggle, now, folds, onFold, phone, sitter }) {
  const hour = now.getHours() + now.getMinutes() / 60;
  const total = chores.length;
  const doneItems = chores.filter((c) => done.includes(c.id));
  let nowSlot = null;
  for (const [k, [, by]] of Object.entries(SLOTS)) {
    if (k !== 'owed' && hour < by && chores.some((c) => c.slot === k && !done.includes(c.id))) { nowSlot = k; break; }
  }
  return (
    <section className="zone farm" aria-label="Farm chores">
      <div className="zh">
        <h2>Chores</h2>
        <span className="count"><b>{doneItems.length}</b> of {total} done</span>
        {phone && <OpenIn app="galaxyfarm" path={sitter ? 'housesitter' : 'chores'} />}
      </div>
      <div className="meter"><i style={{ width: `${(doneItems.length / total) * 100}%` }} /></div>
      <div className="scroll" data-scroll>
        {doneItems.length === total && <div className="slot-done"><DoneCircle /><b>Every chore is done.</b></div>}
        {Object.entries(SLOTS).map(([k, [label, by]]) => {
          const items = chores.filter((c) => c.slot === k);
          if (!items.length) return null;
          const open = items.filter((c) => !done.includes(c.id));
          const late = k === 'owed' || hour >= by;
          if (!open.length) return k === 'owed' ? null : <div className="slot-done" key={k}><DoneCircle /><b>{label}</b> all done</div>;
          return (
            <div key={k}>
              <div className={`sh ${k === nowSlot ? 'is-now' : ''}`}>
                {label}
                {k === nowSlot && <span className="badge now">Now</span>}
                {late && <span className="badge late">Late</span>}
                <span className="by">{byText(k, by)}</span>
              </div>
              {open.map((c) => (
                <CheckRow key={c.id} checked={false} late={late} onToggle={() => onToggle(c)}>
                  {c.title}{c.detail && <small>{c.detail}</small>}
                </CheckRow>
              ))}
            </div>
          );
        })}
        {doneItems.length > 0 && (
          <Fold open={folds.includes('chores')} onToggle={() => onFold('chores')} label="Done today" count={doneItems.length}>
            {doneItems.map((c) => <CheckRow key={c.id} checked onToggle={() => onToggle(c)}>{c.title}</CheckRow>)}
          </Fold>
        )}
      </div>
    </section>
  );
}
