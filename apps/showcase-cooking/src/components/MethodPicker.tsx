import { METHOD_LABEL, type Method } from '../data.ts';

interface MethodPickerProps {
  available: ReadonlyArray<Method>;
  active: Method;
  onPick(method: Method): void;
}

/** Horizontal chip row of methods. The container shows whatever the
 *  current cut supports; the active method is highlighted. */
export function MethodPicker({ available, active, onPick }: MethodPickerProps) {
  return (
    <section className="method-row" aria-label="Cooking method">
      {available.map((m) => (
        <button
          key={m}
          type="button"
          className={`method-chip ${m === active ? 'active' : ''}`}
          onClick={() => onPick(m)}
        >
          {METHOD_LABEL[m]}
        </button>
      ))}
    </section>
  );
}
