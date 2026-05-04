export type {
  AgentContext,
  AgentInstalledApp,
  AgentRow,
  AgentRunResult,
  AgentStrategy,
  AgentUrgency,
  Insight,
  InsightTarget,
} from './types.ts';
export { DEFAULT_INSIGHT_CAP, runAgent, type RunOptions } from './runner.ts';
export { createRateLimiter, type RateLimiter, type RateLimitOptions } from './rate-limiter.ts';
export { mealPlanningStrategy } from './strategies/meal-planning.ts';
export { scheduleAwarenessStrategy } from './strategies/schedule-awareness.ts';
export { budgetAwarenessStrategy } from './strategies/budget-awareness.ts';
export { coffeeVsSleepStrategy } from './strategies/coffee-vs-sleep.ts';
export { kitchenNowStrategy } from './strategies/kitchen-now.ts';
export { breathOnLowMoodStrategy } from './strategies/breath-on-low-mood.ts';

import { mealPlanningStrategy } from './strategies/meal-planning.ts';
import { scheduleAwarenessStrategy } from './strategies/schedule-awareness.ts';
import { budgetAwarenessStrategy } from './strategies/budget-awareness.ts';
import { coffeeVsSleepStrategy } from './strategies/coffee-vs-sleep.ts';
import { kitchenNowStrategy } from './strategies/kitchen-now.ts';
import { breathOnLowMoodStrategy } from './strategies/breath-on-low-mood.ts';
import type { AgentStrategy } from './types.ts';

/** Six-strategy default bundle. The three legacy strategies plus the
 * Phase-4.5 additions that consume the new intents from sip-log /
 * mood-pulse / coffee / cooking. New apps from Phase 5 (pace, breath)
 * plug in via their own strategies in a follow-up. */
export const builtinStrategies: readonly AgentStrategy[] = [
  mealPlanningStrategy,
  scheduleAwarenessStrategy,
  budgetAwarenessStrategy,
  coffeeVsSleepStrategy,
  kitchenNowStrategy,
  breathOnLowMoodStrategy,
];
