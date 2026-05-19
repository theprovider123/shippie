/**
 * Groups list page. Lists existing split-the-bill groups, opens an
 * "+New group" inline editor, and routes into a Group detail screen.
 *
 * One member of every new group is flagged `is_me` so the detail page
 * can render "you owe £X" rather than "Alex owes £X" when Alex is you.
 */
import { useEffect, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  createGroup,
  deleteGroup,
  listGroups,
} from '../db/groups-queries.ts';
import type { Group, GroupMember } from '../db/groups-schema.ts';
import { SUPPORTED_CURRENCIES, formatMoney } from '../lib/fx.ts';

export interface GroupsProps {
  db: ShippieLocalDb;
  defaultCurrency: string;
  onOpenGroup(group: Group): void;
  onToast(message: string): void;
}

interface GroupDraft {
  name: string;
  base_currency: string;
  meName: string;
  otherNames: string[];
}

function emptyDraft(currency: string): GroupDraft {
  return { name: '', base_currency: currency, meName: 'Me', otherNames: [''] };
}

function memberId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function Groups({ db, defaultCurrency, onOpenGroup, onToast }: GroupsProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [draft, setDraft] = useState<GroupDraft | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listGroups(db);
      if (!cancelled) setGroups(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, refresh]);

  async function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    const meName = draft.meName.trim() || 'Me';
    const others = draft.otherNames.map((n) => n.trim()).filter(Boolean);
    if (!name || others.length === 0) return;
    const members: GroupMember[] = [
      { id: memberId('me'), name: meName, is_me: true },
      ...others.map((n) => ({ id: memberId('mem'), name: n })),
    ];
    const group = await createGroup(db, { name, base_currency: draft.base_currency, members });
    setDraft(null);
    setRefresh((n) => n + 1);
    onToast(`Group "${group.name}" created.`);
    onOpenGroup(group);
  }

  async function remove(group: Group) {
    if (!window.confirm(`Delete "${group.name}" and all its expenses?`)) return;
    await deleteGroup(db, group.id);
    setRefresh((n) => n + 1);
    onToast(`Group "${group.name}" deleted.`);
  }

  if (draft) {
    return (
      <section className="page">
        <header className="page-header">
          <h1>New group</h1>
          <p className="muted">Track a trip, a flat, or a one-off split. Add the people first; you can add expenses next.</p>
        </header>

        <div className="group-form">
          <label className="field">
            <span>Group name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Lisbon weekend"
              autoFocus
            />
          </label>

          <label className="field">
            <span>Settle in</span>
            <select
              value={draft.base_currency}
              onChange={(e) => setDraft({ ...draft, base_currency: e.target.value })}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>You</span>
            <input
              type="text"
              value={draft.meName}
              onChange={(e) => setDraft({ ...draft, meName: e.target.value })}
              placeholder="Me"
            />
          </label>

          <fieldset className="field">
            <legend>Others</legend>
            {draft.otherNames.map((name, index) => (
              <div key={index} className="row">
                <input
                  type="text"
                  value={name}
                  placeholder={`Person ${index + 2}`}
                  onChange={(e) => {
                    const next = [...draft.otherNames];
                    next[index] = e.target.value;
                    setDraft({ ...draft, otherNames: next });
                  }}
                />
                {draft.otherNames.length > 1 ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setDraft({ ...draft, otherNames: draft.otherNames.filter((_, i) => i !== index) })}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => setDraft({ ...draft, otherNames: [...draft.otherNames, ''] })}
            >
              + Add person
            </button>
          </fieldset>

          <div className="actions">
            <button type="button" className="ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={saveDraft}
              disabled={!draft.name.trim() || draft.otherNames.every((n) => !n.trim())}
            >
              Create group
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow-row">
            <span>Ledger · Groups</span>
          </div>
          <h1>Groups</h1>
          <p className="muted">
            Split expenses on trips and shared lives. Multi-currency. No accounts — share a signed link to add people.
          </p>
        </div>
        <button type="button" className="primary" onClick={() => setDraft(emptyDraft(defaultCurrency))}>
          + New group
        </button>
      </header>

      {groups.length === 0 ? (
        <p className="empty">No groups yet. Start one for your next trip.</p>
      ) : (
        <ul className="group-list">
          {groups.map((g) => (
            <li key={g.id}>
              <button type="button" className="group-tile" onClick={() => onOpenGroup(g)}>
                <strong>{g.name}</strong>
                <small>
                  {g.members.length} {g.members.length === 1 ? 'person' : 'people'} · settles in {g.base_currency}
                </small>
                <span className="group-cta">Open →</span>
              </button>
              <button type="button" className="ghost danger" onClick={() => void remove(g)} aria-label={`Delete ${g.name}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Format helper kept beside the page for visible co-location with the list.
export const formatGroupMoney = formatMoney;
