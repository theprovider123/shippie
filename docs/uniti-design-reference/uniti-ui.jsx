// uniti-ui.jsx — shared primitives
const { useState: useStateUI, useEffect: useEffectUI } = React;

// ── Icons ────────────────────────────────────────────────────────────────
const ICONS = {
  home:       ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z","M9 22V12h6v10"],
  lessons:    ["M4 19.5A2.5 2.5 0 016.5 17H20","M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"],
  pupils:     ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2","M9 11a4 4 0 100-8 4 4 0 000 8"],
  progress:   ["M22 12h-4l-3 9L9 3l-3 9H2"],
  leadership: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"],
  admin:      ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  check:      ["M20 6L9 17l-5-5"],
  x:          ["M18 6L6 18","M6 6l12 12"],
  plus:       ["M12 5v14","M5 12h14"],
  chevron_r:  ["M9 18l6-6-6-6"],
  chevron_l:  ["M15 18l-6-6 6-6"],
  chevron_d:  ["M6 9l6 6 6-6"],
  mic:        ["M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z","M19 10v2a7 7 0 01-14 0v-2","M12 19v4","M8 23h8"],
  sparkle:    ["M12 3l2.2 5.6L20 12l-5.8 3.4L12 21l-2.2-5.6L4 12l5.8-3.4z"],
  shield:     ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  back:       ["M19 12H5","M12 19l-7-7 7-7"],
  edit:       ["M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7","M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"],
  cloud:      ["M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"],
  bell:       ["M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9","M13.73 21a2 2 0 01-3.46 0"],
  sync_icon:  ["M23 4v6h-6","M1 20v-6h6","M3.51 9a9 9 0 0114.85-3.36L23 10","M1 14l4.64 4.36A9 9 0 0020.49 15"],
  clock:      ["M12 22a10 10 0 100-20 10 10 0 000 20z","M12 6v6l4 2"],
  send:       ["M22 2L11 13","M22 2L15 22 11 13 2 9l20-7z"],
  zap:        ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
  calendar:   ["M8 2v4","M16 2v4","M3 8h18","M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"]
};

function Icon({ name, size = 18, color, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}>
      {(ICONS[name] || []).map((d, i) => <path key={i} d={d}/>)}
    </svg>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["#2EAD73","#3A8FCC","#E8953A","#8B6BD6","#D95A57","#0891B2","#CA8A04","#16A34A"];
function Avatar({ initials = "?", size = 40, statusColor, style }) {
  const bg = AVATAR_COLORS[(initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % AVATAR_COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: bg + "22", color: bg, border: `2px solid ${bg}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.3, fontWeight: 700, flexShrink: 0, letterSpacing: "-0.01em",
      outline: statusColor ? `3px solid ${statusColor}` : "none",
      outlineOffset: statusColor ? "2px" : "0",
      transition: "outline 0.15s",
      ...style
    }}>{initials}</div>
  );
}

// ── Group Badge ───────────────────────────────────────────────────────────
const GROUP_CFG = {
  SEND: { bg: "#FEE2E2", color: "#B91C1C" },
  EAL:  { bg: "#DBEAFE", color: "#1D4ED8" },
  FSM:  { bg: "#FEF9C3", color: "#854D0E" }
};
function GroupBadge({ group }) {
  const c = GROUP_CFG[group] || { bg: "#F3F4F6", color: "#374151" };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
      padding: "2px 5px", borderRadius: 4, background: c.bg, color: c.color,
      textTransform: "uppercase"
    }}>{group}</span>
  );
}

// ── Status Pill ───────────────────────────────────────────────────────────
function StatusPill({ status, small }) {
  const cfg = (window.UnitiData.feedbackConfig || {})[status];
  if (!cfg) return null;
  return (
    <span style={{
      fontSize: small ? 11 : 12, fontWeight: 600,
      padding: small ? "2px 7px" : "3px 9px", borderRadius: 20,
      background: cfg.bg, color: cfg.color,
      display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap"
    }}>
      <span>{cfg.emoji}</span><span>{cfg.label}</span>
    </span>
  );
}

// ── Progress Ring ─────────────────────────────────────────────────────────
function ProgressRing({ pct = 0, size = 56, stroke = 6, color = "var(--primary)", label }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E8E6E3" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}/>
      </svg>
      {label && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.21, fontWeight: 700, color: "var(--text)"
        }}>{label}</div>
      )}
    </div>
  );
}

// ── Sync Chip ─────────────────────────────────────────────────────────────
function SyncChip({ status = "synced", lastSync, pending = 0 }) {
  const cfgMap = {
    synced:  { bg: "#E8F6EF", color: "#2EAD73", icon: "check",     label: `Synced · ${lastSync || "just now"}` },
    syncing: { bg: "#FEF0DC", color: "#E8953A", icon: "sync_icon",  label: "Syncing..." },
    pending: { bg: "#FEF0DC", color: "#E8953A", icon: "cloud",      label: `${pending} event${pending!==1?"s":""} pending` },
    offline: { bg: "#F1F3F6", color: "#8B93A1", icon: "cloud",      label: "Saved locally" }
  };
  const c = cfgMap[status] || cfgMap.synced;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
      borderRadius: 20, background: c.bg, color: c.color, fontSize: 12, fontWeight: 600
    }}>
      <Icon name={c.icon} size={12}/>
      <span>{c.label}</span>
      {status === "synced" && <span style={{ opacity: 0.65, fontSize: 10, fontWeight: 500 }}>· School Cloud</span>}
    </div>
  );
}

// ── Button ────────────────────────────────────────────────────────────────
function Btn({ children, variant = "primary", icon, onClick, style, small, disabled }) {
  const [hov, setHov] = useStateUI(false);
  const base = {
    display: "inline-flex", alignItems: "center", gap: 7,
    border: "none", borderRadius: "var(--radius-sm)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit", fontWeight: 600,
    fontSize: small ? 12 : 14,
    padding: small ? "6px 12px" : "9px 16px",
    opacity: disabled ? 0.45 : 1,
    transition: "all 0.14s ease", whiteSpace: "nowrap",
    letterSpacing: "-0.01em"
  };
  const variants = {
    primary:   { background: hov ? "var(--primary-dark)" : "var(--primary)", color: "#fff" },
    secondary: { background: hov ? "var(--primary-light)" : "transparent", color: "var(--primary)", border: "1.5px solid var(--primary)" },
    ghost:     { background: hov ? "var(--surface-2)" : "transparent", color: "var(--text-muted)", border: "1.5px solid var(--border)" },
    danger:    { background: hov ? "#BE2525" : "#D95A57", color: "#fff" }
  };
  return (
    <button onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...base, ...(variants[variant] || variants.primary), ...style }}>
      {icon && <Icon name={icon} size={small ? 13 : 15}/>}
      {children}
    </button>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────
function Card({ children, style, onClick, hover: hoverEnabled, noPad }) {
  const [hov, setHov] = useStateUI(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => hoverEnabled && setHov(true)}
      onMouseLeave={() => hoverEnabled && setHov(false)}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", padding: noPad ? 0 : 20,
        boxShadow: hov ? "var(--shadow-md)" : "var(--shadow)",
        transform: hov && hoverEnabled ? "translateY(-1px)" : "none",
        transition: "all 0.14s ease",
        cursor: onClick ? "pointer" : "default",
        ...style
      }}>{children}</div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────
function AppShell({ screen, setScreen, lesson, syncStatus, lastSync, children }) {
  const [collapsed, setCollapsed] = useStateUI(false);
  const sw = collapsed ? 58 : 220;

  const nav = [
    { id: "home",       label: "Today",          icon: "home" },
    { id: "lesson",     label: "Class",          icon: "lessons" },
    { id: "timeline",   label: "Pupil Progress", icon: "pupils" },
    { id: "leadership", label: "School",         icon: "leadership" },
    { id: "admin",      label: "Settings",       icon: "admin" }
  ];

  const topLabel = {
    home: "Today",
    lesson: lesson?.topic || "Class",
    ai: "Try this next",
    adaptations: "Adaptations",
    timeline: "Pupil Progress",
    leadership: "School",
    admin: "Settings"
  }[screen] || "Uniti";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{
        width: sw, flexShrink: 0, background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        transition: "width 0.2s ease", overflow: "hidden"
      }}>
        {/* Logo */}
        <div style={{
          minHeight: 60, padding: collapsed ? "0 12px" : "0 16px",
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          borderBottom: "1px solid var(--border)", gap: 8
        }}>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "var(--primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>uniti</div>
              <div style={{ fontSize: 10, color: "var(--text-subtle)", fontWeight: 500, letterSpacing: "0.03em" }}>School Cloud</div>
            </div>
          )}
          {collapsed && (
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 800 }}>u</div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-subtle)", borderRadius: 6, padding: 4, display: "flex" }}>
            <Icon name={collapsed ? "chevron_r" : "chevron_l"} size={15}/>
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {nav.map(item => {
            const active = screen === item.id || (screen === "ai" && item.id === "lesson") || (screen === "adaptations" && item.id === "timeline");
            return (
              <button key={item.id} onClick={() => setScreen(item.id)} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: collapsed ? "10px 0" : "9px 10px",
                justifyContent: collapsed ? "center" : "flex-start",
                border: "none", background: active ? "var(--primary-light)" : "transparent",
                borderRadius: 8, cursor: "pointer", width: "100%",
                color: active ? "var(--primary)" : "var(--text-muted)",
                fontFamily: "inherit", fontSize: 13, fontWeight: active ? 600 : 500,
                transition: "all 0.12s"
              }}>
                <Icon name={item.icon} size={17}/>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom: school + user */}
        {!collapsed ? (
          <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
              St Jude's &amp; St Paul's
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar initials="SM" size={28}/>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>Sarah Mitchell</div>
                <div style={{ fontSize: 10, color: "var(--text-subtle)" }}>Year 4 Teacher</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "12px 0", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "center" }}>
            <Avatar initials="SM" size={30}/>
          </div>
        )}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Topbar */}
        <div style={{
          height: 52, background: "var(--surface)", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", padding: "0 22px", gap: 12, flexShrink: 0
        }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {topLabel}
            </span>
            {screen === "lesson" && lesson && (
              <span style={{ fontSize: 13, color: "var(--text-subtle)", marginLeft: 10 }}>
                {lesson.yearGroup} · {lesson.cls} · {lesson.time}
              </span>
            )}
          </div>
          <SyncChip status={syncStatus} lastSync={lastSync}/>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-subtle)", display: "flex", padding: 4, borderRadius: 6 }}>
            <Icon name="bell" size={17}/>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Icon, Avatar, GroupBadge, StatusPill, ProgressRing, SyncChip, Btn, Card, AppShell });
