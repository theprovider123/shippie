import type { HabitCue } from '../types.ts';

/**
 * Pick a cue. Two pathways:
 *  - **Intent anchor** — pick from intents this user's other apps
 *    actually broadcast. Eligible intents come from the parent (the
 *    container's `apps.list` overlap).
 *  - **Anchor phrase** — free text "after I make morning coffee".
 *
 * The auto-check toggle is only shown when an intent is selected,
 * since anchor-phrase cues can't fire programmatically.
 *
 * Voice-doc note: cue selection is the UX the user sees, *not* a
 * checkbox in settings. Cues are the load-bearing scaffolding of the
 * habit; they deserve first-class real estate.
 */
export function CueAnchorPicker({
  value,
  eligibleIntents,
  onChange,
}: {
  value: HabitCue | undefined;
  /** [{intent, label}] — intents the user's other installed apps broadcast. */
  eligibleIntents: ReadonlyArray<{ intent: string; label: string }>;
  onChange: (next: HabitCue | undefined) => void;
}) {
  const cue = value ?? {};
  return (
    <div className="cue-picker">
      <label className="cue-label">
        <span>Anchor to another app</span>
        <select
          value={cue.intent ?? ''}
          onChange={(e) => {
            const intent = e.target.value;
            if (!intent) {
              onChange(cue.anchor ? { anchor: cue.anchor } : undefined);
            } else {
              onChange({ ...cue, intent, autoCheck: cue.autoCheck ?? true });
            }
          }}
        >
          <option value="">— none —</option>
          {eligibleIntents.map(({ intent, label }) => (
            <option key={intent} value={intent}>
              {label} ({intent})
            </option>
          ))}
        </select>
      </label>

      <label className="cue-label">
        <span>Or anchor in plain words</span>
        <input
          type="text"
          placeholder="after I make morning coffee"
          value={cue.anchor ?? ''}
          onChange={(e) => {
            const anchor = e.target.value.trim();
            if (!anchor && !cue.intent) {
              onChange(undefined);
            } else {
              onChange({ ...cue, anchor: anchor || undefined });
            }
          }}
        />
      </label>

      {cue.intent ? (
        <label className="cue-label cue-label-row">
          <input
            type="checkbox"
            checked={cue.autoCheck !== false}
            onChange={(e) => onChange({ ...cue, autoCheck: e.target.checked })}
          />
          <span>Auto-tick when the other app fires the cue</span>
        </label>
      ) : null}
    </div>
  );
}
