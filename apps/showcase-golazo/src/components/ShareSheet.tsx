import { useEffect, useRef, useState } from "react";
import { drawCard } from "../lib/sharecard";
import { copyLink, downloadCard, shareBracket } from "../lib/share";
import type { Prediction, Profile } from "../lib/types";
import { championOf } from "../lib/bracket";
import { tap } from "../lib/haptics";

export function ShareSheet({
  profile,
  prediction,
  onClose,
}: {
  profile: Profile;
  prediction: Prediction;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const hasChamp = Boolean(championOf(prediction));

  useEffect(() => {
    if (canvasRef.current) {
      drawCard(canvasRef.current, prediction, profile, "story");
    }
  }, [prediction, profile]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function onShare() {
    tap();
    const res = await shareBracket(profile, prediction, "story");
    if (res.method === "clipboard") flash("Link copied — paste it to your group chat.");
    else if (res.method === "failed") flash("Couldn't open share — try Save image.");
  }

  async function onSave() {
    tap();
    const res = await downloadCard(profile, prediction, "story");
    flash(res.method === "download" ? "Saved to your photos." : "Save failed.");
  }

  async function onCopy() {
    tap();
    const ok = await copyLink(profile, prediction);
    flash(ok ? "Link copied." : "Copy failed.");
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-label="Share your call"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grab" aria-hidden />
        <h2 className="sheet-title">Show them your call</h2>
        {!hasChamp && (
          <p className="sheet-warn">
            Pick a champion first to make the card sing — but you can still share.
          </p>
        )}
        <div className="card-frame">
          <canvas ref={canvasRef} className="card-canvas" />
        </div>
        <div className="sheet-actions">
          <button className="cta" onClick={onShare}>
            Share my call
          </button>
          <div className="sheet-actions-row">
            <button className="ghost-btn wide" onClick={onSave}>
              Save image
            </button>
            <button className="ghost-btn wide" onClick={onCopy}>
              Copy link
            </button>
          </div>
        </div>
        <button className="sheet-close" onClick={onClose}>
          Done
        </button>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
