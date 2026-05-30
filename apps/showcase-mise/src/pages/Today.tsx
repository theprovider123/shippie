import type { Food } from '../lib/foods-data';
import type { Entry, Goals, Meal, Nutrients, Slot } from '../lib/types';
import type { QuickItem } from '../lib/store';
import type { Insight } from '../lib/insights';
import { DataBand } from '../components/DataBand';
import { QuickAdd, type ImportSuggestion } from '../components/QuickAdd';
import { MealTimeline } from '../components/MealTimeline';
import { InsightCard } from '../components/InsightCard';

interface Props {
  todayEntries: Entry[];
  totals: Nutrients;
  goals: Goals;
  recents: QuickItem[];
  frequents: QuickItem[];
  favorites: Food[];
  meals: Meal[];
  foods: Food[];
  imports: ImportSuggestion[];
  hasYesterday: boolean;
  insights: Insight[];
  currentSlot: Slot;
  onSlotChange: (s: Slot) => void;
  onQuickLog: (item: QuickItem) => void;
  onFoodTap: (food: Food) => void;
  onMealLog: (meal: Meal) => void;
  onImportLog: (s: ImportSuggestion) => void;
  onParsed: (text: string) => void;
  onCopyYesterday: () => void;
  onEditEntry: (e: Entry) => void;
}

export function Today(props: Props) {
  return (
    <div className="stack">
      <DataBand totals={props.totals} targets={props.goals.targets} />

      {props.insights.slice(0, 2).map((ins) => (
        <InsightCard key={ins.id} insight={ins} />
      ))}

      <QuickAdd
        currentSlot={props.currentSlot}
        onSlotChange={props.onSlotChange}
        recents={props.recents}
        frequents={props.frequents}
        favorites={props.favorites}
        meals={props.meals}
        foods={props.foods}
        imports={props.imports}
        hasYesterday={props.hasYesterday}
        onQuickLog={props.onQuickLog}
        onFoodTap={props.onFoodTap}
        onMealLog={props.onMealLog}
        onImportLog={props.onImportLog}
        onParsed={props.onParsed}
        onCopyYesterday={props.onCopyYesterday}
      />

      <div>
        <div className="section-title">Today's log</div>
        <MealTimeline entries={props.todayEntries} onEdit={props.onEditEntry} />
      </div>
    </div>
  );
}
