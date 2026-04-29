/**
 * Meal-planning strategy.
 *
 * Cross-app insight generator: fires when the user has a recipe-saving
 * app installed AND a meal-planning app installed AND there's at least
 * one new recipe row in the last 24h. Suggests opening the meal planner
 * to schedule the new recipe.
 *
 * Stays low-urgency by default. Promotes to medium if the user hasn't
 * planned any meals in the last 7 days.
 */
import type { AgentContext, AgentStrategy, Insight } from '../types.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

export const mealPlanningStrategy: AgentStrategy = {
  name: 'meal-planning',
  evaluate(ctx: AgentContext): readonly Insight[] {
    const recipeApp = ctx.apps.find(
      (a) => a.category === 'cooking' || a.provides?.includes('shopping-list'),
    );
    const planner = ctx.apps.find((a) => a.consumes?.includes('shopping-list'));
    if (!recipeApp || !planner || recipeApp.slug === planner.slug) return [];

    const recentRecipes = ctx.rows.filter(
      (r) => r.appSlug === recipeApp.slug && ctx.now - r.createdAt < ONE_DAY_MS,
    );
    if (recentRecipes.length === 0) return [];

    const recentlyPlanned = ctx.rows.some(
      (r) => r.appSlug === planner.slug && ctx.now - r.createdAt < ONE_WEEK_MS,
    );
    const urgency = recentlyPlanned ? 'low' : 'medium';

    return [
      {
        id: `meal-planning:${planner.slug}:${recentRecipes.length}:${dayBucket(ctx.now)}`,
        strategy: 'meal-planning',
        urgency,
        title: `Plan ${recentRecipes.length === 1 ? 'a meal' : 'meals'} from your new ${recentRecipes.length === 1 ? 'recipe' : 'recipes'}`,
        body: `Open ${planner.name} to schedule this week.`,
        target: { app: planner.slug },
        generatedAt: ctx.now,
        expiresAt: ctx.now + ONE_DAY_MS,
      },
    ];
  },
};

function dayBucket(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
