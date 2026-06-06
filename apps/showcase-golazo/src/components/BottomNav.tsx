import { tap } from "../lib/haptics";

export type Tab = "home" | "predict" | "pools" | "play";

// Line icons, slightly human weight — matched to the Your Call design.
const ITEMS: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: "play",
    label: "Play",
    icon: (
      <>
        <circle cx="11" cy="11" r="9" />
        <path d="M9 8.5 L15 11 L9 13.5 Z" strokeLinejoin="round" fill="none" />
      </>
    ),
  },
  {
    id: "predict",
    label: "Predict",
    icon: (
      <>
        <circle cx="11" cy="11" r="8.5" />
        <circle cx="11" cy="11" r="4" />
        <circle cx="11" cy="11" r="1" fill="currentColor" stroke="none" />
        <path d="M11 1.5v2M11 18.5v2M1.5 11h2M18.5 11h2" />
      </>
    ),
  },
  {
    id: "pools",
    label: "Your Lot",
    icon: (
      <>
        <circle cx="8.5" cy="5.5" r="3.5" />
        <path d="M1 21 C1.5 16 4.5 13 8.5 13 C12.5 13 15.5 16 16 21" fill="none" />
        <circle cx="16" cy="5" r="2.5" />
        <path d="M15 13.5 C18 13.5 21.5 15.5 23 21" fill="none" />
      </>
    ),
  },
  {
    id: "home",
    label: "You",
    icon: (
      <>
        <circle cx="11" cy="6.5" r="4" />
        <path d="M2.5 21 C3 16.5 6.5 13 11 13 C15.5 13 19 16.5 19.5 21" fill="none" />
      </>
    ),
  },
];

export function BottomNav({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          className={`nav-item ${active === it.id ? "is-active" : ""}`}
          aria-current={active === it.id ? "page" : undefined}
          onClick={() => {
            if (active !== it.id) tap();
            onChange(it.id);
          }}
        >
          <svg
            viewBox="0 0 22 22"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            {it.icon}
          </svg>
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
