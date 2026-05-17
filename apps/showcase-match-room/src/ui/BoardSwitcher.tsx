import { useState } from 'react';
import { removeRoomShortcut, type SavedRoom } from '../shared/local-store.ts';

export function BoardSwitcher(props: {
  rooms: SavedRoom[];
  activeRoomId?: string | null;
  onChange: (rooms: SavedRoom[]) => void;
}) {
  const [sharedRoomId, setSharedRoomId] = useState<string | null>(null);
  const rooms = uniqueRooms(props.rooms, props.activeRoomId);

  if (rooms.length === 0) return null;
  const homeUrl = `${window.location.origin}${window.location.pathname}`;

  const shareRoom = async (room: SavedRoom) => {
    const title = `${room.title} on Shippie Match Room`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: 'Join this private match room.', url: room.url });
      } else {
        await navigator.clipboard?.writeText(room.url);
      }
      setSharedRoomId(room.id);
      window.setTimeout(() => setSharedRoomId((current) => (current === room.id ? null : current)), 1800);
    } catch {
      // Sharing can be cancelled by the user; the room tile stays unchanged.
    }
  };

  return (
    <section className="board-switcher" aria-label="Saved rooms">
      <div className="panel-head">
        <div>
          <h2>Your rooms</h2>
          <p>Each room is its own board. Enter one, share one, or start another.</p>
        </div>
        <span>{rooms.length} saved</span>
      </div>
      <div className="board-switcher-actions">
        <a href={homeUrl}>New room</a>
      </div>
      <div className="board-list">
        {rooms.map((room) => (
          <article key={`${room.role}:${room.id}`} className={`room-tile ${room.id === props.activeRoomId ? 'active' : ''}`.trim()}>
            <a className="room-tile-main" href={room.url} aria-label={`Enter ${room.title}`}>
              <span className="room-tile-mark" aria-hidden="true">
                <i />
              </span>
              <span>
                <strong>{room.title}</strong>
                <em>{room.id === props.activeRoomId ? 'Current room' : `${room.template} board`}</em>
              </span>
            </a>
            <div className="room-tile-actions">
              <a href={room.url}>Enter</a>
              <button type="button" onClick={() => void shareRoom(room)}>
                {sharedRoomId === room.id ? 'Copied' : 'Share'}
              </button>
              <button
                type="button"
                aria-label={`Remove ${room.title}`}
                onClick={() => props.onChange(removeRoomShortcut(room.id))}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function uniqueRooms(rooms: SavedRoom[], activeRoomId?: string | null): SavedRoom[] {
  const byId = new Map<string, SavedRoom>();
  for (const room of rooms) {
    const existing = byId.get(room.id);
    if (!existing || room.id === activeRoomId || new Date(room.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      byId.set(room.id, room);
    }
  }
  return Array.from(byId.values());
}
