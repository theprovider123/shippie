import { useState } from 'react';
import { createEntry } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { analyzeSentiment } from '../ai/sentiment.ts';
import { embed } from '../ai/embed.ts';
import { classifyTopic } from '../ai/classify.ts';
import { MoodBadge } from '../components/MoodBadge.tsx';
import type { SentimentLabel, Topic } from '../db/schema.ts';
import { haptic } from '@shippie/sdk/wrapper';

interface WriteEntryProps {
  onSaved: () => void;
}

export function WriteEntry({ onSaved }: WriteEntryProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sentiment, setSentiment] = useState<{ label: SentimentLabel; score: number } | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleBlur = async () => {
    if (!body.trim()) {
      setSentiment(null);
      setTopic(null);
      return;
    }
    setAnalyzing(true);
    try {
      const [s, c] = await Promise.all([analyzeSentiment(body), classifyTopic(body)]);
      setSentiment({ label: s.label, score: s.score });
      setTopic(c.topic);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      const [s, c, vector] = await Promise.all([
        sentiment ? Promise.resolve(sentiment) : analyzeSentiment(body),
        topic ? Promise.resolve({ topic }) : classifyTopic(body),
        embed(body),
      ]);
      await createEntry(resolveLocalDb(), {
        title: title.trim() || null,
        body: body.trim(),
        sentiment: s.score,
        sentiment_label: s.label,
        topic: c.topic,
        embedding: vector,
      });
      haptic('success');
      setTitle('');
      setBody('');
      setSentiment(null);
      setTopic(null);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="page" onSubmit={handleSave}>
      <header className="page-header">
        <h1>Today</h1>
        <button type="submit" className="primary" disabled={saving || !body.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <input
        className="title-input"
        type="text"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoComplete="off"
      />

      <textarea
        className="body-input"
        placeholder="What happened today?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => void handleBlur()}
        rows={14}
        aria-label="Journal entry body"
      />

      <div className="analysis-row">
        {analyzing ? <span className="muted">Analyzing on-device…</span> : null}
        {sentiment ? <MoodBadge label={sentiment.label} score={sentiment.score} /> : null}
        {topic && topic !== 'unclassified' ? <span className="topic-pill">{topic}</span> : null}
        {!sentiment && !analyzing && body.trim().length > 0 ? (
          <span className="muted">Tap outside to analyze</span>
        ) : null}
      </div>
    </form>
  );
}
