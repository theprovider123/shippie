import { useState } from "react";
import { team } from "../data/teams";
import { championOf, completion, resolveBracket } from "../lib/bracket";
import type { SharePayload } from "../lib/codec";
import { useStore } from "../state";
import { Flag, teamVars } from "../ui/atoms";
import { confirmBuzz, tap } from "../lib/haptics";

export function IncomingShare({
  payload,
  onClose,
}: {
  payload: SharePayload;
  onClose: () => void;
}) {
  const store = useStore();
  const { pools } = store;
  const [added, setAdded] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [poolName, setPoolName] = useState("");

  const champId = championOf(payload.prediction);
  const champ = champId ? team(champId) : null;
  const { participants } = resolveBracket(
    payload.prediction.groups,
    payload.prediction.knockout,
  );
  const [fa, fb] = participants["F-0"] ?? [null, null];
  const pct = Math.round(completion(payload.prediction) * 100);

  function addTo(code: string, label: string) {
    store.addEntryToPool(code, payload);
    confirmBuzz();
    setAdded(label);
  }
  function createAndAdd() {
    const p = store.createPool(poolName || `${payload.name}'s pool`);
    store.addEntryToPool(p.code, payload);
    confirmBuzz();
    setAdded(p.name);
    setNaming(false);
  }

  return (
    <div className="incoming" style={champ ? teamVars(champ) : undefined}>
      <div className="incoming-glow" aria-hidden />
      <button className="incoming-x" onClick={() => { tap(); onClose(); }}>
        ✕
      </button>

      <p className="incoming-kicker">A challenger appears</p>
      <h1 className="incoming-name">{payload.name}</h1>
      <p className="incoming-sub">called the 2026 World Cup. {pct}% locked in.</p>

      {champ ? (
        <div className="incoming-champ">
          <span className="incoming-champ-flag">{champ.flag}</span>
          <span className="incoming-champ-label">to lift the cup</span>
          <span className="incoming-champ-name">{champ.name}</span>
        </div>
      ) : (
        <div className="incoming-champ">
          <span className="incoming-champ-flag">🏆</span>
          <span className="incoming-champ-name">Champion TBD</span>
        </div>
      )}

      {(fa || fb) && (
        <div className="incoming-final">
          <Side id={fa} />
          <span className="incoming-final-v">v</span>
          <Side id={fb} />
        </div>
      )}

      {added ? (
        <div className="incoming-done">
          <p>Added to <strong>{added}</strong>.</p>
          <button className="cta" onClick={() => { tap(); onClose(); }}>
            Beat their bracket →
          </button>
        </div>
      ) : (
        <div className="incoming-actions">
          <button className="cta" onClick={() => { tap(); onClose(); }}>
            Make your own call →
          </button>

          {!naming ? (
            <div className="incoming-pools">
              <span className="field-label">Add {payload.name} to a pool</span>
              <div className="incoming-pool-btns">
                {pools.map((p) => (
                  <button
                    key={p.code}
                    className="ghost-btn"
                    onClick={() => addTo(p.code, p.name)}
                  >
                    {p.name}
                  </button>
                ))}
                <button
                  className="ghost-btn dashed"
                  onClick={() => { tap(); setNaming(true); }}
                >
                  + New pool
                </button>
              </div>
            </div>
          ) : (
            <div className="pool-form-row">
              <input
                className="field-input"
                autoFocus
                value={poolName}
                placeholder={`${payload.name}'s pool`}
                onChange={(e) => setPoolName(e.target.value.slice(0, 28))}
                onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
              />
              <button className="cta sm" onClick={createAndAdd}>
                Create
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Side({ id }: { id: string | null }) {
  const t = id ? team(id) : null;
  return (
    <span className="incoming-side" style={t ? teamVars(t) : undefined}>
      <Flag id={id} size={28} />
      <span>{t ? t.short : "TBD"}</span>
    </span>
  );
}
