import { useState } from "react";
import { team } from "../data/teams";
import { championOf, completion } from "../lib/bracket";
import { decodeShare } from "../lib/codec";
import { hasResults, scorePrediction } from "../lib/scoring";
import { shareBracket } from "../lib/share";
import { useStore } from "../state";
import type { Pool, Prediction } from "../lib/types";
import { Flag, teamVars } from "../ui/atoms";
import { confirmBuzz, tap } from "../lib/haptics";
import { Sweepstakes } from "./Sweepstakes";

interface Row {
  uid: string;
  name: string;
  favTeam?: string;
  prediction: Prediction;
  isMe: boolean;
}

export function Pools() {
  const store = useStore();
  const { profile, pools } = store;
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [sweepMembers, setSweepMembers] = useState<string[] | null>(null);

  if (sweepMembers) {
    return (
      <Sweepstakes
        initialMembers={sweepMembers}
        onBack={() => setSweepMembers(null)}
      />
    );
  }

  const selected = pools.find((p) => p.code === open) ?? null;
  if (selected) {
    return (
      <PoolDetail
        pool={selected}
        onBack={() => setOpen(null)}
        onSweep={(members) => setSweepMembers(members)}
      />
    );
  }

  function create() {
    const p = store.createPool(newName);
    setNewName("");
    tap();
    setOpen(p.code);
  }
  function join() {
    if (!joinCode.trim()) return;
    const p = store.joinPool(joinCode);
    setJoinCode("");
    tap();
    setOpen(p.code);
  }

  return (
    <div className="pools">
      <div className="section-head">
        <div>
          <h2 className="section-title">Pools</h2>
          <p className="section-hint">Settle it with your mates. No accounts.</p>
        </div>
      </div>

      {pools.length === 0 && (
        <div className="empty-pools">
          <span className="empty-pools-emoji" aria-hidden>🏟️</span>
          <p>Start a pool, share your link, and watch the table fill up as your
          friends call it.</p>
        </div>
      )}

      <ul className="pool-list">
        {pools.map((p) => (
          <li key={p.code}>
            <button className="pool-row" onClick={() => { tap(); setOpen(p.code); }}>
              <span className="pool-row-name">{p.name}</span>
              <span className="pool-row-meta">
                <span className="pool-code">{p.code}</span>
                <span className="pool-count">{p.entries.length + 1} in</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="pool-forms">
        <div className="pool-form">
          <span className="field-label">Start a pool</span>
          <div className="pool-form-row">
            <input
              className="field-input"
              value={newName}
              placeholder="Office Cup, The Lads, Family…"
              onChange={(e) => setNewName(e.target.value.slice(0, 28))}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button className="cta sm" onClick={create}>
              Create
            </button>
          </div>
        </div>
        <div className="pool-form">
          <span className="field-label">Join with a code</span>
          <div className="pool-form-row">
            <input
              className="field-input mono"
              value={joinCode}
              placeholder="ABCDE"
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
            <button className="cta sm" onClick={join} disabled={!joinCode.trim()}>
              Join
            </button>
          </div>
        </div>
      </div>

      <button
        className="ghost-btn wide"
        style={{ marginTop: 18 }}
        onClick={() => { tap(); setSweepMembers([]); }}
      >
        🎲 Run a sweepstake
      </button>

      {profile && (
        <p className="pools-tip">
          Tip: a pool is your private table — add friends by pasting the link
          they send you. Your picks stay on this phone until you choose to share.
        </p>
      )}
    </div>
  );
}

function PoolDetail({
  pool,
  onBack,
  onSweep,
}: {
  pool: Pool;
  onBack: () => void;
  onSweep: (members: string[]) => void;
}) {
  const store = useStore();
  const { profile, prediction, results } = store;
  const [link, setLink] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);

  function copyCode() {
    tap();
    navigator.clipboard
      ?.writeText(pool.code)
      .then(() => {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 1400);
      })
      .catch(() => {});
  }
  const [err, setErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [rename, setRename] = useState(pool.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const memberNames = [
    ...(profile ? [profile.name] : []),
    ...pool.entries.map((e) => e.name),
  ];

  const rows: Row[] = [
    ...(profile
      ? [{
          uid: profile.uid,
          name: profile.name,
          favTeam: profile.favTeam,
          prediction,
          isMe: true,
        }]
      : []),
    ...pool.entries.map((e) => ({
      uid: e.uid,
      name: e.name,
      favTeam: e.favTeam,
      prediction: e.prediction,
      isMe: false,
    })),
  ];

  const scored = hasResults(results);
  const ranked = [...rows].sort((a, b) => {
    if (scored) {
      return (
        scorePrediction(b.prediction, results).total -
        scorePrediction(a.prediction, results).total
      );
    }
    return completion(b.prediction) - completion(a.prediction);
  });

  function addLink() {
    setErr(null);
    const m = /[#&?]b=([^&]+)/.exec(link.trim());
    const code = m ? m[1] : link.trim();
    const payload = decodeShare(code);
    if (!payload) {
      setErr("That doesn't look like a Golazo link.");
      return;
    }
    store.addEntryToPool(pool.code, payload);
    setLink("");
    tap();
  }

  async function invite() {
    if (!profile) return;
    tap();
    await shareBracket(profile, prediction, "story");
  }

  return (
    <div className="pool-detail">
      <div className="pool-detail-head">
        <button className="back-btn" onClick={() => { tap(); onBack(); }}>
          ← Pools
        </button>
        <button className="pool-code lg copyable" onClick={copyCode} title="Copy join code">
          {codeCopied ? "Copied ✓" : pool.code}
        </button>
      </div>
      <h2 className="pool-detail-name">{pool.name}</h2>

      <ol className="board">
        {ranked.map((r, i) => {
          const champ = championOf(r.prediction);
          const sc = scored ? scorePrediction(r.prediction, results).total : null;
          return (
            <li
              key={r.uid}
              className={`board-row ${r.isMe ? "is-me" : ""}`}
              style={champ ? teamVars(team(champ)) : undefined}
            >
              <span className="board-rank">{i + 1}</span>
              <span className="board-id">
                <span className="board-name">
                  {r.name}
                  {r.isMe && <em className="you-tag">you</em>}
                </span>
                <span className="board-champ">
                  {champ ? (
                    <>
                      <Flag id={champ} size={16} /> {team(champ).short}
                    </>
                  ) : (
                    "no champion yet"
                  )}
                </span>
              </span>
              <span className="board-score">
                {sc !== null ? (
                  <>
                    <strong>{sc}</strong>
                    <small>pts</small>
                  </>
                ) : (
                  <small>{Math.round(completion(r.prediction) * 100)}%</small>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {!scored && (
        <p className="board-note">
          Ranked by progress until kick-off. Once matches start, the table
          re-sorts by points.
        </p>
      )}

      <div className="pool-add">
        <button className="cta wide" onClick={invite}>
          Invite — share my link
        </button>
        <span className="field-label">Add a friend's bracket</span>
        <div className="pool-form-row">
          <input
            className="field-input"
            value={link}
            placeholder="Paste their Golazo link"
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
          />
          <button className="cta sm" onClick={addLink} disabled={!link.trim()}>
            Add
          </button>
        </div>
        {err && <p className="form-err">{err}</p>}
      </div>

      <div className="pool-manage">
        <button
          className="ghost-btn wide"
          onClick={() => { tap(); onSweep(memberNames); }}
        >
          🎲 Sweepstake this group
        </button>

        {renaming ? (
          <div className="pool-form-row">
            <input
              className="field-input"
              autoFocus
              value={rename}
              onChange={(e) => setRename(e.target.value.slice(0, 28))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  store.renamePool(pool.code, rename);
                  setRenaming(false);
                }
              }}
            />
            <button
              className="cta sm"
              onClick={() => {
                store.renamePool(pool.code, rename);
                setRenaming(false);
                tap();
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <div className="pool-detail-actions">
            <button
              className="ghost-btn"
              onClick={() => { tap(); setRename(pool.name); setRenaming(true); }}
            >
              Rename
            </button>
            {confirmDelete ? (
              <button
                className="danger-btn"
                onClick={() => {
                  confirmBuzz();
                  store.removePool(pool.code);
                  onBack();
                }}
              >
                Tap again to delete
              </button>
            ) : (
              <button
                className="danger-btn"
                onClick={() => { tap(); setConfirmDelete(true); }}
              >
                Delete group
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
