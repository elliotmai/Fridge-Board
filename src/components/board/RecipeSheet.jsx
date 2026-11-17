import { appLink } from '@/config/apps';
import { dayFrom, fmt } from '@/lib/dates';
import { Play } from './Icons';

export function RecipeSheet({ meal, recipe, onClose, onCook, phone }) {
  return (
    <div className="fb-layer">
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
        <div className="grab" />
        <span className="when">{fmt(dayFrom(meal.d), { weekday: 'long' })} dinner</span>
        <h3 id="sheetTitle">{recipe.name}</h3>
        <span className="sub">{recipe.sub}</span>
        <div className="facts"><span className="fact">{recipe.time}</span><span className="fact">Serves {recipe.serves}</span><span className="fact">{recipe.cal} calories each</span></div>
        <ul>{recipe.ingredients.map((i) => <li key={i}>{i}</li>)}</ul>
        <div className="sheet-actions">
          {phone
            ? <a className="secondary" href={appLink('kitchenhub', 'recipe', meal.recipe)} target="_blank" rel="noopener noreferrer">Open in KitchenHub</a>
            : <button className="secondary" onClick={onClose}>Close</button>}
          <button className="primary" onClick={() => onCook(meal.recipe)}><Play />Start cooking</button>
        </div>
      </div>
    </div>
  );
}
