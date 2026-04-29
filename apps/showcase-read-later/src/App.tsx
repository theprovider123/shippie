import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { extractReadable, type ReadableArticle } from './readability.ts';

const shippie = createShippieIframeSdk({ appId: 'app_read_later' });

const STORAGE_KEY = 'shippie.read-later.v1';
const PROXY_URL = '/__shippie/proxy?url=';

interface SavedArticle {
  id: string;
  url: string;
  title: string;
  /** Sanitised HTML (stripped of nav/footer/script). */
  contentHtml: string;
  readMinutes: number;
  savedAt: string;
  read?: boolean;
}

function load(): SavedArticle[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedArticle[];
    return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
  } catch {
    return [];
  }
}

export function App() {
  const [articles, setArticles] = useState<SavedArticle[]>(() => load());
  const [draftUrl, setDraftUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
    } catch {
      /* quota errors non-fatal */
    }
  }, [articles]);

  // P3-adjacent — subscribe to mood-logged so the suggestion ribbon
  // can hint "you marked low mood; here's a 3-min read you saved".
  const [moodHint, setMoodHint] = useState<string | null>(null);
  useEffect(() => {
    shippie.requestIntent('mood-logged');
    return shippie.intent.subscribe('mood-logged', ({ rows }) => {
      const head = rows[0] as { score?: number } | undefined;
      if (typeof head?.score !== 'number') return;
      if (head.score < 5) setMoodHint('Low mood — try a short read first.');
      else if (head.score > 7) setMoodHint(null);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!moodHint) return articles;
    // Sort short reads first when low-mood hint is active.
    return [...articles].sort((a, b) => a.readMinutes - b.readMinutes);
  }, [articles, moodHint]);

  async function saveUrl(e: React.FormEvent) {
    e.preventDefault();
    const url = draftUrl.trim();
    if (!url) return;
    setBusy(true);
    setError(null);
    try {
      const proxied = `${PROXY_URL}${encodeURIComponent(url)}`;
      const response = await fetch(proxied);
      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status}`);
      }
      const html = await response.text();
      const article: ReadableArticle = extractReadable(html);
      const saved: SavedArticle = {
        id: `a_${Date.now()}`,
        url,
        title: article.title,
        contentHtml: article.contentHtml,
        readMinutes: article.readMinutes,
        savedAt: new Date().toISOString(),
      };
      setArticles((prev) => [saved, ...prev].slice(0, 200));
      setDraftUrl('');
      shippie.feel.texture('install');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch.');
      shippie.feel.texture('error');
    } finally {
      setBusy(false);
    }
  }

  function toggleRead(id: string) {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, read: !a.read } : a)));
    shippie.feel.texture('toggle');
  }

  function remove(id: string) {
    setArticles((prev) => prev.filter((a) => a.id !== id));
    shippie.feel.texture('delete');
    if (openId === id) setOpenId(null);
  }

  const openArticle = articles.find((a) => a.id === openId) ?? null;

  if (openArticle) {
    return (
      <article className="reader" aria-label={openArticle.title}>
        <header>
          <button onClick={() => setOpenId(null)} className="ghost" aria-label="Back to list">
            ← Back
          </button>
          <h1>{openArticle.title}</h1>
          <p className="meta">
            {openArticle.readMinutes} min read ·{' '}
            <a href={openArticle.url} target="_blank" rel="noopener noreferrer">
              source
            </a>
          </p>
        </header>
        <div
          className="reader-body"
          // Content is sanitised to text + img + lists by extractReadable.
          // The iframe sandbox provides the additional defence-in-depth
          // boundary so even a missed XSS can't escape this app's origin.
          dangerouslySetInnerHTML={{ __html: openArticle.contentHtml }}
        />
      </article>
    );
  }

  return (
    <main>
      <header>
        <h1>Read Later</h1>
        <p>{articles.length} saved · {articles.filter((a) => !a.read).length} unread</p>
      </header>

      <form onSubmit={saveUrl}>
        <input
          type="url"
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          placeholder="https://example.com/article"
          aria-label="Article URL"
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {moodHint && <p className="hint">{moodHint}</p>}

      {filtered.length === 0 ? (
        <p className="empty">Paste a URL above. We fetch via the SSRF-guarded proxy and store the article locally.</p>
      ) : (
        <ul>
          {filtered.map((a) => (
            <li key={a.id} className={a.read ? 'done' : ''}>
              <button onClick={() => setOpenId(a.id)} className="open" aria-label={`Open ${a.title}`}>
                <strong>{a.title}</strong>
                <small>
                  {a.readMinutes} min · {new URL(a.url).hostname}
                </small>
              </button>
              <div className="actions">
                <button onClick={() => toggleRead(a.id)} aria-label={a.read ? 'Mark unread' : 'Mark read'}>
                  {a.read ? '↶' : '✓'}
                </button>
                <button onClick={() => remove(a.id)} aria-label="Remove">
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
