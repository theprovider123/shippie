import { CHAT_PRESETS, CHAT_PRESET_LABEL, type ChatPreset } from '../lib/chat-presets';
import type { GroupEvent } from '../lib/group-events';

interface GroupChatCardProps {
  events: GroupEvent[];
  onSignal: (preset: ChatPreset) => void;
  localSourceId: string;
  displayName: string;
  supporterTag: string;
}

/**
 * Chat card — the lean inbox inside the Group Hub. An activity feed at the
 * top (newest first, max 20 rows shown), preset chips at the bottom. Optional
 * short-text input is a v1.1 add behind a `text` toggle.
 */
export function GroupChatCard({
  events,
  onSignal,
  localSourceId,
  displayName,
  supporterTag,
}: GroupChatCardProps) {
  const shown = events.slice(0, 20);

  return (
    <div className="panel group-chat">
      <h2>Chat</h2>
      <div className="chat-activity" aria-live="polite">
        {shown.length === 0 ? (
          <p className="chat-activity__empty">
            Tap a quick signal. It stays here on this phone.
          </p>
        ) : (
          <ul className="chat-activity__list">
            {shown.map((event) => {
              const isLocal = event.source_id === localSourceId;
              const rowName = isLocal ? displayName : event.display_name;
              const rowTag = isLocal ? supporterTag : event.supporter_tag;
              return (
                <li className="chat-activity__row" key={event.id}>
                  <span className="chat-activity__chip" aria-hidden>
                    {initialsOf(rowName)}
                  </span>
                  <div className="chat-activity__meta">
                    <strong>
                      {rowName}
                      {rowTag ? <em>#{rowTag}</em> : null}
                    </strong>
                    <small>{messageFor(event)}</small>
                  </div>
                  <span className="chat-activity__age">{ageLabel(event.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="chat-presets" role="group" aria-label="Quick signals">
        {CHAT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="chat-preset"
            onClick={() => onSignal(preset)}
          >
            {CHAT_PRESET_LABEL[preset]}
          </button>
        ))}
      </div>
    </div>
  );
}

function messageFor(event: GroupEvent): string {
  if (event.preset) return CHAT_PRESET_LABEL[event.preset];
  if (event.text) return event.text;
  if (event.kind === 'join') return 'joined the group';
  if (event.kind === 'plan_changed') return 'updated the plan';
  return '—';
}

function initialsOf(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2 && parts[1]) {
    return `${(parts[0]?.[0] ?? '').toUpperCase()}${(parts[1][0] ?? '').toUpperCase()}`;
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function ageLabel(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds)) return 'just now';
  if (seconds < 90) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}
