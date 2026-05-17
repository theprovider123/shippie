/**
 * The main List page — the surface most users live on.
 *
 * Layout (top → bottom):
 *   - Heading + remaining count + active store name + running total
 *   - Mesh status (start/join code)
 *   - Quick-tap chips for one-tap adds + Photo/Voice
 *   - Add input (with optional assignee picker)
 *   - Household filter tabs
 *   - Aisle-grouped item list (sorted for the active store)
 *   - "Clear checked" footer
 *
 * The page is mostly a layout composer; all state lives in App.tsx
 * and is passed in via props. Keeps it free of side-effects so we
 * can swap pages without leaking subscriptions.
 */
import { useMemo, useState } from 'react';
import type { ListItem, StoreProfile } from '../lib/types.ts';
import type { Aisle } from '../AisleClassifier.tsx';
import { AisleSection } from '../components/AisleSection.tsx';
import { ItemRow } from '../components/ItemRow.tsx';
import { QuickTapChips } from '../components/QuickTapChips.tsx';
import { HouseholdFilter, applyHouseholdFilter } from '../components/HouseholdFilter.tsx';
import { PhotoVoiceItem } from '../components/PhotoVoiceItem.tsx';
import { groupByAisleForStore } from '../lib/aisle-sort.ts';
import { formatPence, runningTotal } from '../lib/price-track.ts';
import type { MediaRef } from '../lib/types.ts';

interface ListPageProps {
  items: readonly ListItem[];
  members: readonly string[];
  profile: StoreProfile;
  classifierMap: Readonly<Record<string, Aisle>>;
  classifierAvailable: boolean | null;
  classifierPending: number;
  groupByAisle: boolean;
  onToggleGroup: (next: boolean) => void;
  quickTapChips: readonly string[];
  onAdd: (name: string, opts?: { assignee?: string | null; media?: MediaRef }) => void;
  onToggle: (id: string) => void;
  onSetAssignee: (id: string, assignee: string | null) => void;
  onSetQty: (id: string, qty: string) => void;
  onLogPrice: (id: string, raw: string) => void;
  onRemove: (id: string) => void;
  onClearChecked: () => void;
  meshSlot: React.ReactNode;
  storeSwitcherSlot: React.ReactNode;
}

export function ListPage(props: ListPageProps) {
  const {
    items,
    members,
    profile,
    classifierMap,
    classifierAvailable,
    classifierPending,
    groupByAisle,
    onToggleGroup,
    quickTapChips,
    onAdd,
    onToggle,
    onSetAssignee,
    onSetQty,
    onLogPrice,
    onRemove,
    onClearChecked,
    meshSlot,
    storeSwitcherSlot,
  } = props;

  const [draft, setDraft] = useState('');
  const [assigneeDraft, setAssigneeDraft] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = useMemo(
    () => applyHouseholdFilter(items, filter, members),
    [items, filter, members],
  );

  const remaining = filtered.filter((i) => !i.checked).length;
  const totals = useMemo(
    () => runningTotal(filtered, profile.id),
    [filtered, profile.id],
  );

  const grouped = useMemo(() => {
    if (!groupByAisle) return null;
    return groupByAisleForStore(filtered, classifierMap, profile);
  }, [groupByAisle, filtered, classifierMap, profile]);

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    onAdd(name, { assignee: assigneeDraft });
    setDraft('');
    // Keep assigneeDraft sticky — most users add a few items in a row for the same housemate.
  }

  return (
    <main>
      <header>
        <h1>Shopping</h1>
        <p>
          {remaining} of {filtered.length} still to get
          {totals.totalPence > 0 ? (
            <>
              {' · '}
              <strong className="total">{formatPence(totals.totalPence)} at {profile.name}</strong>
              {(totals.estimatedCount + totals.unknownCount) > 0 ? (
                <span className="estimate-hint">
                  {' '}({totals.estimatedCount} estimated{totals.unknownCount > 0 ? `, ${totals.unknownCount} unpriced` : ''})
                </span>
              ) : null}
            </>
          ) : null}
        </p>
      </header>

      {storeSwitcherSlot}
      {meshSlot}

      <QuickTapChips
        chips={quickTapChips}
        onTap={(name) => onAdd(name, { assignee: assigneeDraft })}
        trailing={
          <PhotoVoiceItem
            onCapture={(media, suggestedName) =>
              onAdd(suggestedName, { assignee: assigneeDraft, media })
            }
          />
        }
      />

      <form onSubmit={submitAdd}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an item"
          aria-label="New item"
        />
        {members.length > 0 && (
          <select
            value={assigneeDraft ?? ''}
            onChange={(e) => setAssigneeDraft(e.target.value || null)}
            aria-label="For"
          >
            <option value="">anyone</option>
            {members.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        <button type="submit">Add</button>
      </form>

      {classifierAvailable !== false && (
        <div className="aisle-toggle">
          <label>
            <input
              type="checkbox"
              checked={groupByAisle}
              onChange={(e) => onToggleGroup(e.target.checked)}
            />
            Group by {profile.name} aisles
            {classifierPending > 0 && <small> (classifying {classifierPending}…)</small>}
          </label>
        </div>
      )}

      <HouseholdFilter
        members={members}
        items={items}
        selected={filter}
        onSelect={setFilter}
      />

      {filtered.length === 0 ? (
        <p className="empty">When the meal planner shares its shopping list, items show up here automatically.</p>
      ) : grouped ? (
        grouped.map(({ aisle, items: list }) => (
          <AisleSection key={aisle} aisle={aisle} count={list.length}>
            {list.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                members={members}
                activeStoreId={profile.id}
                storeName={profile.name}
                onToggle={onToggle}
                onSetAssignee={onSetAssignee}
                onSetQty={onSetQty}
                onLogPrice={onLogPrice}
                onRemove={onRemove}
              />
            ))}
          </AisleSection>
        ))
      ) : (
        <ul>
          {filtered.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              members={members}
              activeStoreId={profile.id}
              storeName={profile.name}
              onToggle={onToggle}
              onSetAssignee={onSetAssignee}
              onSetQty={onSetQty}
              onLogPrice={onLogPrice}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      <div className="actions">
        <button
          type="button"
          className="ghost"
          onClick={onClearChecked}
          disabled={items.every((i) => !i.checked)}
        >
          Clear checked
        </button>
      </div>
    </main>
  );
}
