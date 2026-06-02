import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import { Sweepstakes } from "./components/Sweepstakes";
import { StoreProvider } from "./state";
import { GROUPS } from "./data/tournament";

// Tell React this is a proper act() environment (silences jsdom warnings).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// Minimal integration smoke: mount the real app in jsdom and drive the
// primary screens. Catches render-time crashes (bad hooks, undefined access)
// that a type/build check can't. Inputs are controlled (hard to drive in raw
// jsdom), so we seed state via localStorage and navigate by clicking buttons.

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    );
  });
}

function clickButton(text: string) {
  const btn = [...container.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").toLowerCase().includes(text.toLowerCase()),
  );
  if (!btn) throw new Error(`button not found: ${text}`);
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

describe("App smoke", () => {
  it("shows onboarding when there is no profile", () => {
    localStorage.clear();
    mount();
    expect(container.textContent).toContain("GOLAZO");
    expect(container.textContent).toContain("Call the");
    expect(container.textContent).toContain("Play now");
    expect(container.querySelector(".team-grid")).not.toBeNull();
  });

  it("lets a fresh visitor jump straight into arcade play", () => {
    localStorage.clear();
    mount();
    clickButton("Play now");
    expect(container.textContent).toContain("Keepy Uppy");
    expect(container.textContent).toContain("Top Bins");
    expect(localStorage.getItem("golazo:profile")).toContain("Player");
  });

  it("renders the main shell + every tab once a profile exists", () => {
    localStorage.setItem(
      "golazo:profile",
      JSON.stringify({ name: "Tester", favTeam: "BRA", uid: "u-test" }),
    );
    // A partial prediction so MyCall renders progress + a final strip.
    localStorage.setItem(
      "golazo:prediction",
      JSON.stringify({
        v: 1,
        groups: { A: [...GROUPS.A], B: [...GROUPS.B] },
        knockout: {},
        createdAt: 0,
      }),
    );
    mount();

    // Lands on home with the user's name + bottom nav.
    expect(container.textContent).toContain("Tester");
    expect(container.querySelector(".bottom-nav")).not.toBeNull();

    // Predict → group builder.
    clickButton("Predict");
    expect(container.textContent).toContain("Group stage");

    // Pools → empty-state copy.
    clickButton("Pools");
    expect(container.textContent).toContain("Pools");

    // Back home — Match day is now folded into the home screen (Live tab removed).
    clickButton("My Call");
    expect(container.querySelector(".home")).not.toBeNull();
    expect(container.textContent).toContain("Match day");
  });

  it("opens an incoming shared bracket from the URL hash", () => {
    // Build a share link, put it in the hash, mount fresh (no profile).
    localStorage.clear();
    const code =
      "b=" +
      btoa(
        JSON.stringify({
          v: 1,
          n: "Mate",
          u: "friend1",
          f: "ARG",
          g: { A: [...GROUPS.A] },
          k: { "F-0": "ARG" },
          c: 0,
        }),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    window.location.hash = code;
    mount();
    expect(container.textContent).toContain("Mate");
    expect(container.textContent).toContain("Argentina");
    window.location.hash = "";
  });

  it("runs a sweepstake draw across the entered people", () => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <StoreProvider>
          <Sweepstakes initialMembers={["Sam", "Mo"]} onBack={() => {}} />
        </StoreProvider>,
      );
    });
    clickButton("Draw for 2");
    // Default mode is the classic office sweep: one nation each.
    expect(container.textContent).toContain("Sam");
    expect(container.textContent).toContain("Mo");
    expect(container.textContent).toContain("One nation each");
    expect(container.querySelectorAll(".sweeps-team")).toHaveLength(2);
  });
});
