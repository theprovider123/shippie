import { useState } from "react";
import { ZONE_OPTIONS, zoneLabel } from "../lib/zones";
import { tap } from "../lib/haptics";

/**
 * Compact "Watching from {city}" chip that opens a zone picker. Lets a viewer
 * override the auto-detected timezone so kick-offs show in their local time.
 */
export function WatchFrom({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (zone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = value && value !== "auto" ? value : "auto";

  return (
    <>
      <button
        className="watch-chip"
        onClick={() => {
          tap();
          setOpen(true);
        }}
      >
        <span aria-hidden>📍</span>
        <span className="watch-chip-label">{zoneLabel(value)}</span>
        <span className="watch-chip-caret" aria-hidden>
          ⌄
        </span>
      </button>

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-label="Watching from"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-grab" aria-hidden />
            <h2 className="sheet-title">Watching from</h2>
            <p className="sheet-sub">Kick-off times show in this timezone.</p>
            <ul className="zone-list">
              {ZONE_OPTIONS.map((z) => (
                <li key={z.id}>
                  <button
                    className={`zone-row ${z.id === current ? "is-sel" : ""}`}
                    onClick={() => {
                      tap();
                      onChange(z.id);
                      setOpen(false);
                    }}
                  >
                    <span className="zone-row-label">{z.label}</span>
                    {z.hint && <span className="zone-row-hint">{z.hint}</span>}
                    {z.id === current && (
                      <span className="zone-row-check" aria-hidden>
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <button className="sheet-close" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
