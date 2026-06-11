// palate. — The Rail (home screen)
// Expo tickets sorted by remaining time; hero is most urgent non-long item.

import { useState } from 'react';
import type { Timer, Ferment } from '../lib/types.ts';
import { remainingSeconds, q10Remaining, fmtSeconds } from '../lib/engine.ts';
import { newId } from '../lib/store.ts';

export interface RailItem {
  id: string;
  title: string;
  sub?: string;
  remaining_s: number;
  kind: 'timer' | 'ferment';
  isHeat: boolean;
  isLong: boolean;
}

interface Props {
  timers: Timer[];
  ferments: Ferment[];
  now: number;
  onAddTimer: (label: string, duration_s: number, context?: string) => void;
  onExtendTimer: (id: string) => void;
  onClearTimer: (id: string) => void;
  onStartTimer: (id: string) => void;
}

function buildItems(timers: Timer[], ferments: Ferment[], now: number): RailItem[] {
  const timerItems: RailItem[] = timers
    .filter((t) => t.status !== 'done')
    .map((t) => ({
      id: t.id,
      title: t.label,
      sub: t.context ?? undefined,
      remaining_s: remainingSeconds(t, now),
      kind: 'timer' as const,
      isHeat: t.context === 'oven',
      isLong: false,
    }));

  const fermentItems: RailItem[] = ferments
    .filter((f) => f.status === 'active')
    .map((f) => {
      const elapsed_s = (now - f.started_at) / 1000;
      const remaining_s = f.dough_temp_c != null
        ? q10Remaining(f.target_duration_s, elapsed_s, f.dough_temp_c)
        : Math.max(0, f.target_duration_s - elapsed_s);
      const dayCount = Math.floor(elapsed_s / 86400) + 1;
      const totalDays = Math.ceil(f.target_duration_s / 86400);
      const isLong = f.target_duration_s >= 3 * 3600; // 3h+ is "long"
      return {
        id: f.id,
        title: f.name,
        sub: isLong ? `day ${dayCount} of ${totalDays} · burp the jar` : f.notes ?? undefined,
        remaining_s,
        kind: 'ferment' as const,
        isHeat: false,
        isLong,
      };
    });

  const allItems = [...timerItems, ...fermentItems];
  // Sort: short timers first, long ferments sink to bottom
  allItems.sort((a, b) => {
    if (a.isLong && !b.isLong) return 1;
    if (!a.isLong && b.isLong) return -1;
    return a.remaining_s - b.remaining_s;
  });
  return allItems;
}

interface AddSheetState {
  label: string;
  hours: string;
  minutes: string;
  context: string;
}

export function Rail({ timers, ferments, now, onAddTimer, onExtendTimer, onClearTimer, onStartTimer }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddSheetState>({ label: '', hours: '0', minutes: '5', context: '' });

  const items = buildItems(timers, ferments, now);
  const shortItems = items.filter((i) => !i.isLong);
  const longItems = items.filter((i) => i.isLong);

  const hero = shortItems[0] ?? null;
  const tickets = shortItems.slice(1);
  const allTickets = [...tickets, ...longItems];

  const heroTimer = hero ? timers.find((t) => t.id === hero.id) : null;

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleAddSubmit() {
    const h = parseInt(addForm.hours) || 0;
    const m = parseInt(addForm.minutes) || 0;
    const duration_s = h * 3600 + m * 60;
    if (!addForm.label.trim() || duration_s <= 0) return;
    onAddTimer(addForm.label.trim(), duration_s, addForm.context || undefined);
    setShowAdd(false);
    setAddForm({ label: '', hours: '0', minutes: '5', context: '' });
  }

  return (
    <div className="rail-screen">
      <div className="rail-header">
        <span className="rail-count">{items.length > 0 ? `${items.length} on the rail` : 'nothing on the rail'}</span>
      </div>

      <div className="rail-body">
        {/* Hero card */}
        {hero && (
          <div
            className={`hero-card${hero.remaining_s === 0 ? ' hero-done' : ''}`}
            onClick={() => {
              if (hero.kind === 'timer' && heroTimer?.status === 'idle') {
                onStartTimer(hero.id);
              } else if (hero.remaining_s === 0) {
                onClearTimer(hero.id);
              }
            }}
          >
            <div className="hero-notch hero-notch-left" />
            <div className="hero-notch hero-notch-right" />
            <div className="hero-top">
              <span className="hero-title">{hero.title}</span>
              <span className="hero-tag">{hero.remaining_s === 0 ? 'now' : 'next up'}</span>
            </div>
            {hero.sub && <div className="hero-sub">{hero.sub}</div>}
            <div className="hero-divider" />
            <div className="hero-time">{fmtSeconds(hero.remaining_s)}</div>
            <div className="hero-caption">
              {hero.remaining_s === 0 ? 'needs you — tap to clear' : 'tap to clear when handled'}
            </div>
          </div>
        )}

        {/* Tickets */}
        {allTickets.map((item) => {
          const expanded = expandedId === item.id;
          const ticketTimer = item.kind === 'timer' ? timers.find((t) => t.id === item.id) : null;
          return (
            <div
              key={item.id}
              className={`ticket${item.isHeat ? ' ticket-heat' : ''}${item.isLong ? ' ticket-long' : ''}`}
              onClick={() => toggleExpand(item.id)}
            >
              <div className="ticket-row">
                <div className="ticket-left">
                  <div className="ticket-title">{item.title}</div>
                  {item.sub && <div className="ticket-sub">{item.sub}</div>}
                </div>
                <div className={`ticket-time${item.isHeat ? ' ticket-time-heat' : item.isLong ? ' ticket-time-long' : ''}`}>
                  {fmtSeconds(item.remaining_s)}
                </div>
              </div>
              {expanded && (
                <div className="ticket-actions">
                  <button
                    className="ticket-btn ticket-btn-extend"
                    onClick={(e) => { e.stopPropagation(); onExtendTimer(item.id); }}
                  >
                    +1:00
                  </button>
                  <button
                    className="ticket-btn ticket-btn-done"
                    onClick={(e) => { e.stopPropagation(); onClearTimer(item.id); }}
                  >
                    done
                  </button>
                </div>
              )}
              {expanded && ticketTimer?.status === 'idle' && (
                <button
                  className="ticket-btn ticket-btn-start"
                  onClick={(e) => { e.stopPropagation(); onStartTimer(item.id); }}
                >
                  start
                </button>
              )}
            </div>
          );
        })}

        {/* Add timer row */}
        {!showAdd && (
          <button className="add-ticket-row" onClick={() => setShowAdd(true)}>
            + a ticket
          </button>
        )}

        {showAdd && (
          <div className="add-sheet">
            <input
              className="add-input"
              placeholder="what is it?"
              value={addForm.label}
              onChange={(e) => setAddForm((s) => ({ ...s, label: e.target.value }))}
              autoFocus
            />
            <div className="add-duration-row">
              <input
                className="add-input add-input-short"
                type="number"
                min="0"
                max="23"
                value={addForm.hours}
                onChange={(e) => setAddForm((s) => ({ ...s, hours: e.target.value }))}
              />
              <span className="add-unit">h</span>
              <input
                className="add-input add-input-short"
                type="number"
                min="0"
                max="59"
                value={addForm.minutes}
                onChange={(e) => setAddForm((s) => ({ ...s, minutes: e.target.value }))}
              />
              <span className="add-unit">min</span>
            </div>
            <input
              className="add-input"
              placeholder="context (optional — 'oven' for heat tint)"
              value={addForm.context}
              onChange={(e) => setAddForm((s) => ({ ...s, context: e.target.value }))}
            />
            <div className="add-sheet-actions">
              <button className="ticket-btn ticket-btn-extend" onClick={() => setShowAdd(false)}>cancel</button>
              <button className="ticket-btn ticket-btn-done" onClick={handleAddSubmit}>add</button>
            </div>
          </div>
        )}

        {/* Kitchen note slot (mobile) */}
        <div className="rail-footer">
          tickets fall away as you clear them · long ferments sink to the bottom
        </div>
      </div>
    </div>
  );
}

// ─── Rail sort helpers (exported for tests) ───────────────────

export function sortRailItems(items: RailItem[]): RailItem[] {
  return [...items].sort((a, b) => {
    if (a.isLong && !b.isLong) return 1;
    if (!a.isLong && b.isLong) return -1;
    return a.remaining_s - b.remaining_s;
  });
}

export function heroFromItems(items: RailItem[]): RailItem | null {
  const sorted = sortRailItems(items);
  return sorted.find((i) => !i.isLong) ?? null;
}

export { newId };
