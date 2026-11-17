import { useState } from 'react';
import { dayFrom, wd } from '@/lib/dates';
import { CheckRow, Fold, Freshness, OpenIn } from './bits';
import { Play, Plus, Right } from './Icons';

export function Meals({ meals, recipes, expiring, onCook, onPeek, phone, status }) {
  const today = meals.filter((m) => m.d === 0);
  const dinner = today.find((m) => m.type === 'Dinner');
  const r = dinner?.recipe && recipes[dinner.recipe];
  return (
    <div className="kcol">
      <div className="zh"><h2>Meals</h2><Freshness s={status} />{phone && <OpenIn app="kitchenhub" path="mealPlan" />}</div>
      <div className="scroll" data-scroll>
        {dinner && (
          <div className="tonight">
            <span className="when">Tonight</span>
            <h3>{dinner.name}</h3>
            {r && (
              <>
                <span className="sub">{r.sub}</span>
                <div className="facts"><span className="fact">{r.time}</span><span className="fact">Serves {r.serves}</span></div>
                <button className="go" onClick={() => onCook(dinner.recipe)}><Play />Start cooking</button>
              </>
            )}
          </div>
        )}
        <div className="sh">Also today</div>
        {today.filter((m) => m.type !== 'Dinner').map((m) => (
          <div className="meal-line" key={m.type}><span>{m.type}</span><span>{m.name}</span></div>
        ))}
        <div className="sh">This week</div>
        <div className="days">
          {[1, 2, 3, 4, 5, 6].map((i) => {
            const m = meals.find((x) => x.d === i && x.type === 'Dinner');
            const d = wd(dayFrom(i));
            return m?.recipe ? (
              <button className="day" key={i} onClick={() => onPeek(i)}><span className="dn">{d}</span><span className="mn">{m.name}</span><Right /></button>
            ) : (
              <div className={`day ${m ? '' : 'empty'}`} key={i}><span className="dn">{d}</span><span className="mn">{m ? m.name : 'Nothing planned'}</span></div>
            );
          })}
        </div>
        <div className="sh">Use soon</div>
        <div className="soon">
          {expiring.map((e) => (
            <span key={e.name} className={e.days <= 1 ? 'urgent' : ''}>{e.name}<b>{e.days <= 1 ? 'today' : `${e.days} days`}</b></span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Shopping({ items, quick, bought, onToggle, onAdd, onClear, folds, onFold, phone, status }) {
  const [text, setText] = useState('');
  const open = items.filter((i) => !bought.includes(i.id));
  const inCart = items.filter((i) => bought.includes(i.id));
  const names = new Set(items.map((i) => i.name.toLowerCase()));
  const offers = quick.filter(([n]) => !names.has(n.toLowerCase())).slice(0, 3);
  const sections = [...new Set(open.map((i) => i.section))];
  const submit = (e) => { e.preventDefault(); const v = text.trim(); if (!v) return; onAdd(v); setText(''); };
  return (
    <div className="kcol">
      <div className="zh">
        <h2>Shopping</h2><Freshness s={status} /><span className="count"><b>{open.length}</b> to get</span>
        {phone && <OpenIn app="kitchenhub" path="shopping" />}
      </div>
      <form className="add" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item" autoComplete="off" aria-label="Add an item" />
        <button aria-label="Add"><Plus /></button>
      </form>
      {offers.length > 0 && (
        <div className="quick">
          {offers.map(([n, s]) => <button key={n} onClick={() => onAdd(n, s)}><Plus />{n}</button>)}
        </div>
      )}
      <div className="scroll" data-scroll>
        {!open.length && <p className="empty-note">Nothing left to buy. Add an item above.</p>}
        {sections.map((s) => (
          <div key={s}>
            <div className="sh">{s}</div>
            {open.filter((i) => i.section === s).map((i) => (
              <CheckRow key={i.id} checked={false} onToggle={() => onToggle(i)} end={i.why && <span className="tag">{i.why}</span>}>
                {i.name}{i.qty && <span className="qty">{i.qty}</span>}
              </CheckRow>
            ))}
          </div>
        ))}
        {inCart.length > 0 && (
          <Fold open={folds.includes('cart')} onToggle={() => onFold('cart')} label="In the cart" count={inCart.length}
            actions={<div className="fold-actions"><button className="text-btn" onClick={onClear}>Clear the cart</button></div>}>
            {inCart.map((i) => <CheckRow key={i.id} checked onToggle={() => onToggle(i)}>{i.name}</CheckRow>)}
          </Fold>
        )}
      </div>
    </div>
  );
}
