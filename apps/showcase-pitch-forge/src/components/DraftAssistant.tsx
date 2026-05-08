import { useState } from 'react';
import { draftSection, type DraftProgress, type DraftResult } from '../lib/draft-assist.ts';
import type { SectionKind } from '../lib/templates.ts';

export interface DraftAssistantProps {
  brief: string;
  kind: SectionKind;
  title: string;
  /** Existing body. The user can choose to replace or append. */
  currentBody: string;
  onApply: (text: string, source: 'ai' | 'fallback') => void;
}

/**
 * "Draft from brief" button + progress UI.
 *
 * On click: try the on-device summariser first; fall back to the
 * heuristic key-sentence extractor if the runtime can't load. We
 * always tell the user which path produced the result so "AI" never
 * becomes a brand for our heuristic.
 */
export function DraftAssistant({ brief, kind, title, currentBody, onApply }: DraftAssistantProps) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<DraftProgress | null>(null);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(forceFallback: boolean) {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress({ phase: 'init' });
    try {
      const out = await draftSection(
        brief,
        { kind, title, forceFallback },
        (p) => setProgress(p),
      );
      if (out.text.trim().length === 0) {
        setError('Your brief is empty — paste some context first.');
      } else {
        setResult(out);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setRunning(false);
    }
  }

  function apply(mode: 'replace' | 'append') {
    if (!result) return;
    const next = mode === 'replace'
      ? result.text
      : currentBody.trim().length === 0
        ? result.text
        : `${currentBody.trim()}\n\n${result.text}`;
    onApply(next, result.source);
    setResult(null);
    setProgress(null);
  }

  return (
    <div className="draft-assistant">
      <div className="draft-actions">
        <button
          type="button"
          className="primary"
          onClick={() => run(false)}
          disabled={running || brief.trim().length === 0}
        >
          {running ? 'Drafting…' : 'Draft from brief'}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => run(true)}
          disabled={running || brief.trim().length === 0}
          title="Skip the AI runtime; use heuristic extraction"
        >
          Quick extract
        </button>
      </div>
      {brief.trim().length === 0 ? (
        <p className="muted small">
          Add a brief on the pitch overview first — drafts pull from there.
        </p>
      ) : null}
      {progress && running ? <DraftProgressLine progress={progress} /> : null}
      {error ? <p className="draft-error">{error}</p> : null}
      {result ? (
        <div className="draft-preview">
          <p className="eyebrow">
            {result.source === 'ai'
              ? 'Drafted on this device'
              : 'Key sentences from your brief'}
          </p>
          <pre className="draft-text">{result.text}</pre>
          <div className="draft-apply">
            <button type="button" className="primary" onClick={() => apply('replace')}>
              Use this
            </button>
            <button type="button" className="ghost" onClick={() => apply('append')}>
              Append
            </button>
            <button type="button" className="ghost" onClick={() => setResult(null)}>
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DraftProgressLine({ progress }: { progress: DraftProgress }) {
  const text = (() => {
    switch (progress.phase) {
      case 'init':
        return 'Loading runtime…';
      case 'download':
        return progress.file
          ? `Downloading ${progress.file} (${Math.round(progress.progress)}%)`
          : `Downloading model (${Math.round(progress.progress)}%)`;
      case 'compile':
        return 'Compiling model…';
      case 'inference':
        return 'Drafting…';
      case 'fallback':
        return `Falling back to heuristic (${progress.reason})`;
      case 'done':
        return 'Done.';
      case 'error':
        return `Error: ${progress.message}`;
    }
  })();
  return <p className="draft-progress muted small">{text}</p>;
}
