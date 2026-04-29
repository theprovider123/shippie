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

import { mealPlanningStrategy } from './strategies/meal-planning.ts';
import { scheduleAwarenessStrategy } from './strategies/schedule-awareness.ts';
import { budgetAwarenessStrategy } from './strategies/budget-awareness.ts';
import type { AgentStrategy } from './types.ts';

/** Three-strategy default bundle. */
export const builtinStrategies: readonly AgentStrategy[] = [
  mealPlanningStrategy,
  scheduleAwarenessStrategy,
  budgetAwarenessStrategy,
];
