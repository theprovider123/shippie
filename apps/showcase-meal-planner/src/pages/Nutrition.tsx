import { useMemo } from 'react';
import { NutritionRollup } from '../components/NutritionRollup.tsx';
import { BudgetOverlay } from '../components/BudgetOverlay.tsx';
import { rollupWeek } from '../lib/nutrition-rollup.ts';
import { estimateWeekCost, statusForBudget } from '../lib/cost-estimate.ts';
import type { Plan } from '../lib/types.ts';

interface NutritionPageProps {
  plan: Plan;
  budgetCap: number | null;
  fallbackPerServing: number;
  currency?: string;
}

export function Nutrition({ plan, budgetCap, fallbackPerServing, currency }: NutritionPageProps) {
  const rollup = useMemo(() => rollupWeek(plan), [plan]);
  const cost = useMemo(
    () => estimateWeekCost(plan, fallbackPerServing),
    [plan, fallbackPerServing],
  );
  const status = statusForBudget(cost.weekTotal, budgetCap);

  return (
    <div>
      <header>
        <h1>Nutrition + cost</h1>
        <p className="muted">Honest totals — no scoring, no grades, no streaks.</p>
      </header>

      <section className="card" aria-label="Weekly nutrition">
        <h2>Nutrition this week</h2>
        <NutritionRollup rollup={rollup} />
      </section>

      <section className="card" aria-label="Estimated cost">
        <h2>Cost estimate</h2>
        <BudgetOverlay
          status={status}
          taggedSlots={cost.taggedSlots}
          estimatedSlots={cost.estimatedSlots}
          filledSlots={cost.filledSlots}
          currency={currency}
        />
      </section>
    </div>
  );
}
