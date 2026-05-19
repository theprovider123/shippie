import type { Shoutout } from '../shared/types.ts';
import { ShoutoutForm } from '../guest/ShoutoutForm.tsx';

export function RoomFeed(props: {
  title?: string;
  disabled: boolean;
  approved: readonly Shoutout[];
  pending?: readonly Shoutout[];
  canModerate?: boolean;
  onSubmit: (text: string) => Promise<boolean>;
  onApprove?: (id: string) => Promise<void>;
}) {
  const approved = props.approved.slice(0, 8);
  const pending = props.pending?.slice(0, 4) ?? [];

  return (
    <section className="room-feed" aria-label="Room chat">
      <div className="section-head">
        <div>
          <span>People</span>
          <h2>{props.title ?? 'Room chat'}</h2>
        </div>
        <strong>{approved.length + pending.length}</strong>
      </div>

      <div className="feed-list">
        {approved.map((item) => (
          <article key={item.id} className="feed-item approved">
            <p>{item.text}</p>
            <span>On screen</span>
          </article>
        ))}
        {pending.map((item) => (
          <article key={item.id} className="feed-item pending">
            <p>{item.text}</p>
            {props.canModerate && props.onApprove ? (
              <button type="button" onClick={() => void props.onApprove?.(item.id)}>Approve</button>
            ) : (
              <span>Queued</span>
            )}
          </article>
        ))}
        {approved.length === 0 && pending.length === 0 ? (
          <article className="feed-empty">
            <p>No messages yet.</p>
          </article>
        ) : null}
      </div>

      <ShoutoutForm disabled={props.disabled} onSubmit={props.onSubmit} />
    </section>
  );
}
