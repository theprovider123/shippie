/**
 * Single shopping-list row. Tap the box to toggle (the headline
 * action). Tap the body to expand inline controls — assignee picker,
 * quantity edit, price log, photo/voice preview.
 *
 * The row keeps its own `expanded` state so multiple rows can be open
 * at once; the parent never needs to know which is open.
 */
import { useState } from 'react';
import type { ListItem } from '../lib/types.ts';
import { formatPence, latestPerStore } from '../lib/price-track.ts';

interface ItemRowProps {
  item: ListItem;
  members: readonly string[];
  activeStoreId: string;
  storeName: string;
  onToggle: (id: string) => void;
  onSetAssignee: (id: string, assignee: string | null) => void;
  onSetQty: (id: string, qty: string) => void;
  onLogPrice: (id: string, raw: string) => void;
  onRemove: (id: string) => void;
}

export function ItemRow(props: ItemRowProps) {
  const { item, members, activeStoreId, storeName, onToggle, onSetAssignee, onSetQty, onLogPrice, onRemove } = props;
  const [expanded, setExpanded] = useState(false);
  const [priceDraft, setPriceDraft] = useState('');
  const [qtyDraft, setQtyDraft] = useState(item.qty ?? '');

  const latest = latestPerStore(item.prices);
  const activePence = latest[activeStoreId];

  return (
    <li className={item.checked ? 'done' : ''}>
      <div className="row-main">
        <button
          type="button"
          className="check-target"
          onClick={() => onToggle(item.id)}
          aria-pressed={item.checked}
          aria-label={`Toggle ${item.name}`}
        >
          <span className="box">{item.checked ? '✓' : ''}</span>
          <span className="row-text">
            <span className="name">
              {item.name}
              {item.qty && <span className="qty"> {item.qty}</span>}
            </span>
            <span className="meta">
              {item.assignee ? (
                <span className="assignee" data-name={item.assignee}>{item.assignee}</span>
              ) : null}
              {activePence !== undefined ? (
                <span className="price-pill">{formatPence(activePence)}</span>
              ) : null}
              {item.media?.kind === 'photo' && item.media.dataUrl ? (
                <img className="thumb" src={item.media.dataUrl} alt="" />
              ) : null}
              {item.media?.kind === 'voice' ? <span className="voice-pill">voice</span> : null}
              <span className="src" data-src={item.source}>{item.source}</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          className="expand-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? '−' : '+'}
        </button>
      </div>

      {expanded && (
        <div className="row-detail">
          {members.length > 0 && (
            <label className="detail-row">
              <span>For</span>
              <select
                value={item.assignee ?? ''}
                onChange={(e) => onSetAssignee(item.id, e.target.value || null)}
              >
                <option value="">anyone</option>
                {members.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          )}

          <label className="detail-row">
            <span>Qty</span>
            <input
              type="text"
              value={qtyDraft}
              onChange={(e) => setQtyDraft(e.target.value)}
              onBlur={() => onSetQty(item.id, qtyDraft.trim())}
              placeholder="× 2, 500g"
            />
          </label>

          <label className="detail-row">
            <span>Price at {storeName}</span>
            <input
              type="text"
              inputMode="decimal"
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              placeholder="£2.40"
            />
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (priceDraft.trim()) {
                  onLogPrice(item.id, priceDraft);
                  setPriceDraft('');
                }
              }}
            >
              Log
            </button>
          </label>

          {item.prices && item.prices.length > 0 && (
            <div className="price-history">
              {Object.entries(latest).map(([storeId, pence]) => (
                <span key={storeId} className="price-pill">
                  {storeId}: {formatPence(pence)}
                </span>
              ))}
            </div>
          )}

          <button
            type="button"
            className="ghost danger"
            onClick={() => onRemove(item.id)}
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
}
