/**
 * Single-line suggestion banner. Renders nothing when there's no
 * suggestion to show, so the layout doesn't reserve dead space.
 */
import type { Suggestion } from '../lib/suggestions.ts';

interface SmartSuggestionProps {
  suggestion: Suggestion | null;
}

export function SmartSuggestion({ suggestion }: SmartSuggestionProps) {
  if (!suggestion) return null;
  return (
    <p className={`suggestion suggestion-${suggestion.tone}`} role="status">
      {suggestion.text}
    </p>
  );
}
