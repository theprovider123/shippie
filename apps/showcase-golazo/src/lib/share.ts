// Cross-platform sharing: native share sheet where available (with the image
// when the platform allows files), graceful fall back to clipboard + download.

import { cardBlob, type CardFormat } from "./sharecard";
import { shareUrl, type SharePayload } from "./codec";
import type { Prediction, Profile } from "./types";

export interface ShareResult {
  method: "native-files" | "native-text" | "clipboard" | "download" | "failed";
}

function payloadFrom(profile: Profile, prediction: Prediction): SharePayload {
  return {
    name: profile.name,
    uid: profile.uid,
    favTeam: profile.favTeam,
    prediction,
  };
}

export async function shareBracket(
  profile: Profile,
  prediction: Prediction,
  format: CardFormat = "story",
): Promise<ShareResult> {
  const url = shareUrl(payloadFrom(profile, prediction));
  const text = `My 2026 World Cup call is locked on Golazo. Prove me wrong.`;

  // 1) Native share with the image file (best — Instagram/WhatsApp/X friendly).
  try {
    const blob = await cardBlob(prediction, profile, format);
    if (blob && typeof navigator !== "undefined" && navigator.canShare) {
      const file = new File([blob], "golazo-bracket.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, url });
        return { method: "native-files" };
      }
    }
  } catch {
    /* user cancelled or unsupported — fall through */
  }

  // 2) Native share, text + link only.
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: "Golazo", text, url });
      return { method: "native-text" };
    }
  } catch {
    /* fall through */
  }

  // 3) Clipboard.
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${text} ${url}`);
      return { method: "clipboard" };
    }
  } catch {
    /* fall through */
  }

  return { method: "failed" };
}

export async function downloadCard(
  profile: Profile,
  prediction: Prediction,
  format: CardFormat = "story",
): Promise<ShareResult> {
  try {
    const blob = await cardBlob(prediction, profile, format);
    if (!blob) return { method: "failed" };
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `golazo-bracket-${format}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { method: "download" };
  } catch {
    return { method: "failed" };
  }
}

export async function copyLink(
  profile: Profile,
  prediction: Prediction,
): Promise<boolean> {
  const url = shareUrl(payloadFrom(profile, prediction));
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
