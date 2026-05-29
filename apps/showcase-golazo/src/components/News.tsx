import type { NewsItem } from "../lib/feed";

/** Compact tournament news ticker. Renders nothing when there's no news. */
export function News({
  items,
  online,
  max = 3,
}: {
  items: NewsItem[];
  online: boolean;
  max?: number;
}) {
  if (!items || items.length === 0) return null;
  const shown = items.slice(0, max);
  return (
    <div className="news">
      <div className="news-head">
        <span className="news-live-dot" aria-hidden />
        {online ? "Tournament news" : "News (offline — last synced)"}
      </div>
      {shown.map((n, i) => (
        <p className="news-item" key={`${n.at}-${i}`}>
          {n.text}
        </p>
      ))}
    </div>
  );
}
