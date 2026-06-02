import { tap } from "../lib/haptics";

export type Tab = "home" | "predict" | "pools" | "play";

const ITEMS: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: "play",
    label: "Play",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 0 0 18M3.6 9h16.8M3.6 15h16.8M9 3.6 12 12l-3 8.4M15 3.6 12 12l3 8.4" />
      </>
    ),
  },
  {
    id: "predict",
    label: "Picks",
    icon: <path d="M4 6h6v4M4 18h6v-4M10 8h4v8h-4M14 12h6" />,
  },
  {
    id: "pools",
    label: "Mates",
    icon: <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5L12 21l-5-2.9 1-5.5-4-3.9 5.5-.8z" />,
  },
  {
    id: "home",
    label: "You",
    icon: <path d="M3 11.5 12 4l9 7.5M5.5 10v9h13v-9" />,
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
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {it.icon}
          </svg>
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
