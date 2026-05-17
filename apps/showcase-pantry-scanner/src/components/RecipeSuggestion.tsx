/**
 * Recipe suggestion card. Score-lit ingredient row is the "you've got
 * what you need" payoff — green = matched, dim = missing.
 */
import type { RecipeSuggestion } from '../lib/suggest-recipes.ts';

interface RecipeSuggestionCardProps {
  suggestion: RecipeSuggestion;
  onOpen?: (suggestion: RecipeSuggestion) => void;
}

export function RecipeSuggestionCard({
  suggestion,
  onOpen,
}: RecipeSuggestionCardProps) {
  const { recipe, matched, missing, bonus, score } = suggestion;
  const totalRequired = matched.length + missing.length;
  return (
    <article
      className="recipe-suggestion"
      data-score={Math.round(score * 100)}
    >
      <header>
        <h3>{recipe.title}</h3>
        <span className="match">
          {matched.length}/{totalRequired}
        </span>
      </header>
      <p className="blurb">{recipe.blurb}</p>
      <ul className="ingredient-row">
        {matched.map((m) => (
          <li key={`m-${m}`} className="ing matched">
            {m}
          </li>
        ))}
        {missing.map((m) => (
          <li key={`x-${m}`} className="ing missing">
            {m}
          </li>
        ))}
        {bonus.map((b) => (
          <li key={`b-${b}`} className="ing bonus">
            +{b}
          </li>
        ))}
      </ul>
      {onOpen && (
        <button
          type="button"
          className="row-btn row-btn-primary"
          onClick={() => onOpen(suggestion)}
        >
          open recipe
        </button>
      )}
    </article>
  );
}
