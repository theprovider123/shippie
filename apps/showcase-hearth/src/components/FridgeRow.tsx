import type { FridgeItem } from '../sync/hearth-doc.ts';

interface Props {
  item: FridgeItem;
  addedByName: string | null;
  onRemove: (id: string) => void;
}

export function FridgeRow({ item, addedByName, onRemove }: Props) {
  return (
    <li className="hearth-fridge-row">
      <div className="hearth-fridge-text">
        <strong>{item.label}</strong>
        {item.qty_text ? <span className="hearth-fridge-qty"> · {item.qty_text}</span> : null}
        {addedByName ? <span className="hearth-fridge-by"> · {addedByName}</span> : null}
      </div>
      <button type="button" className="hearth-btn hearth-btn-ghost" onClick={() => onRemove(item.id)}>
        Remove
      </button>
    </li>
  );
}
