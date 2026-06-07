// uniti-screens-a.jsx  — Login · Home · Lesson · PupilDrawer
const { useState: useSA, useEffect: useEffSA } = React;
const { Icon, Avatar, GroupBadge, StatusPill, ProgressRing, Btn, Card } = window;

// ── Login ─────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [mode, setMode] = useSA("sso"); // sso | magic | quickpick
  const [email, setEmail] = useSA("");
  const [loading, setLoading] = useSA(false);
  const [pin, setPin] = useSA("");

  const doLogin = (delay = 700) => {
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(); }, delay);
  };

  const teachers = [
    { name:"Sarah Mitchell", role:"Year 4 Teacher", initials:"SM" },
    { name:"Priya Sharma",   role:"Year 3 Teacher", initials:"PS" },
    { name:"James Thompson", role:"Headteacher",    initials:"JT" },
    { name:"Tom Bridges",    role:"Teaching Asst",  initials:"TB" }
  ];

  const AVATAR_COLORS = ["#2EAD73","#3A8FCC","#E8953A","#8B6BD6"];

  return (
    <div style={{ height:"100vh", display:"flex", fontFamily:"inherit" }}>
      {/* Left brand panel */}
      <div style={{
        width:400, background:"var(--primary)", position:"relative",
        display:"flex", flexDirection:"column", padding:"44px 40px",
        justifyContent:"space-between", overflow:"hidden", flexShrink:0
      }}>
        <svg style={{ position:"absolute", inset:0, opacity:0.07 }} width="100%" height="100%">
          <defs>
            <pattern id="dotgrid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="2" fill="white"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dotgrid)"/>
        </svg>
        <div style={{ position:"relative" }}>
          <div style={{ fontSize:26, fontWeight:800, color:"#fff", letterSpacing:"-0.03em" }}>uniti</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", fontWeight:500, letterSpacing:"0.04em", marginTop:2 }}>School Cloud</div>
        </div>
        <div style={{ position:"relative" }}>
          <div style={{ width:72, height:72, borderRadius:18, marginBottom:20,
            background:"rgba(255,255,255,0.18)", border:"2px solid rgba(255,255,255,0.3)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:14, fontWeight:800, color:"#fff" }}>SJ&amp;P</div>
          <div style={{ fontSize:22, fontWeight:700, color:"#fff", lineHeight:1.25, marginBottom:8 }}>
            St Jude's &amp;<br/>St Paul's
          </div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.72)" }}>CE Primary Academy · London NW3</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", marginTop:4 }}>Summer Term 2026 · Week 8</div>
        </div>
        <div style={{ position:"relative", display:"flex", flexDirection:"column", gap:10 }}>
          {["Private school cloud","GDPR compliant · UK data","Works offline · Wonde MIS sync"].map(t => (
            <div key={t} style={{ display:"flex", alignItems:"center", gap:9, fontSize:12, color:"rgba(255,255,255,0.78)" }}>
              <div style={{ width:18, height:18, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Icon name="check" size={10} color="white"/>
              </div>
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Right form */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:40, background:"var(--bg)" }}>
        <div style={{ width:"100%", maxWidth:360 }}>
          {mode === "sso" && (
            <>
              <h1 style={{ fontSize:24, fontWeight:700, marginBottom:6 }}>Welcome back</h1>
              <p style={{ color:"var(--text-muted)", fontSize:14, marginBottom:28 }}>Sign in to your school workspace</p>

              {/* SSO buttons */}
              <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
                {[
                  { provider:"Google Workspace", color:"#EA4335", letter:"G", bg:"#FEF2F2" },
                  { provider:"Microsoft 365",    color:"#0078D4", letter:"M", bg:"#EFF6FF" }
                ].map(p => (
                  <button key={p.provider} onClick={() => doLogin(900)} style={{
                    width:"100%", padding:"12px 16px", borderRadius:"var(--radius-sm)",
                    border:"1.5px solid var(--border)", background:"var(--surface)",
                    display:"flex", alignItems:"center", gap:12, cursor:"pointer",
                    fontFamily:"inherit", fontSize:14, fontWeight:600, color:"var(--text)",
                    transition:"all 0.14s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--surface)"}>
                    <div style={{ width:28, height:28, borderRadius:6, background:p.bg,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:13, fontWeight:800, color:p.color, flexShrink:0 }}>{p.letter}</div>
                    <span>Continue with {p.provider}</span>
                  </button>
                ))}
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
                <div style={{ flex:1, height:1, background:"var(--border)" }}/>
                <span style={{ fontSize:12, color:"var(--text-subtle)" }}>or</span>
                <div style={{ flex:1, height:1, background:"var(--border)" }}/>
              </div>

              <button onClick={() => setMode("magic")} style={{
                width:"100%", padding:"10px 16px", borderRadius:"var(--radius-sm)",
                border:"1.5px solid var(--border)", background:"transparent",
                fontFamily:"inherit", fontSize:13, fontWeight:600, color:"var(--text-muted)",
                cursor:"pointer", marginBottom:12
              }}>
                Sign in with magic link
              </button>

              <button onClick={() => setMode("quickpick")} style={{
                width:"100%", padding:"10px 16px", borderRadius:"var(--radius-sm)",
                border:"1.5px solid var(--border)", background:"transparent",
                fontFamily:"inherit", fontSize:13, fontWeight:600, color:"var(--text-muted)",
                cursor:"pointer", marginBottom:20,
                display:"flex", alignItems:"center", justifyContent:"center", gap:8
              }}>
                <Icon name="pupils" size={14}/>
                Shared device — quick pick teacher
              </button>

              <div style={{ textAlign:"center" }}>
                <a href="#" onClick={e => { e.preventDefault(); doLogin(); }}
                  style={{ fontSize:12, color:"var(--primary)", textDecoration:"none", fontWeight:500 }}>
                  Demo: sign in as Sarah Mitchell →
                </a>
              </div>
            </>
          )}

          {mode === "magic" && (
            <>
              <button onClick={() => setMode("sso")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:13, fontWeight:600, padding:"0 0 20px 0", display:"flex", alignItems:"center", gap:5 }}>
                <Icon name="back" size={14}/> Back
              </button>
              <h1 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>Magic link</h1>
              <p style={{ color:"var(--text-muted)", fontSize:14, marginBottom:22 }}>We'll send you a secure sign-in link</p>
              <input value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@school.sch.uk"
                style={{ width:"100%", padding:"10px 14px", border:"1.5px solid var(--border)", borderRadius:"var(--radius-sm)", fontSize:14, fontFamily:"inherit", marginBottom:12, outline:"none" }}
                onFocus={e => e.target.style.borderColor="var(--primary)"}
                onBlur={e => e.target.style.borderColor="var(--border)"}/>
              <Btn onClick={() => doLogin(600)} style={{ width:"100%", justifyContent:"center" }}>
                {loading ? "Sending…" : "Send magic link"}
              </Btn>
            </>
          )}

          {mode === "quickpick" && (
            <>
              <button onClick={() => setMode("sso")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:13, fontWeight:600, padding:"0 0 20px 0", display:"flex", alignItems:"center", gap:5 }}>
                <Icon name="back" size={14}/> Back
              </button>
              <h1 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>Who's teaching?</h1>
              <p style={{ color:"var(--text-muted)", fontSize:14, marginBottom:22 }}>Tap your name, then enter your PIN</p>
              <div style={{ display:"flex", flexDirection:"column", gap:9, marginBottom:20 }}>
                {teachers.map((t, i) => (
                  <button key={t.name} onClick={() => doLogin(500)} style={{
                    display:"flex", alignItems:"center", gap:12, padding:"11px 14px",
                    borderRadius:"var(--radius-sm)", border:"1.5px solid var(--border)",
                    background:"var(--surface)", cursor:"pointer", fontFamily:"inherit",
                    transition:"all 0.12s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="var(--surface-2)"}
                  onMouseLeave={e => e.currentTarget.style.background="var(--surface)"}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:AVATAR_COLORS[i]+"22",
                      color:AVATAR_COLORS[i], border:`2px solid ${AVATAR_COLORS[i]}55`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:11, fontWeight:700, flexShrink:0 }}>{t.initials}</div>
                    <div style={{ textAlign:"left" }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{t.name}</div>
                      <div style={{ fontSize:11, color:"var(--text-muted)" }}>{t.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === "sso" && (
            <div style={{ marginTop:20, padding:"11px 13px", background:"var(--surface-2)", borderRadius:"var(--radius-sm)", display:"flex", gap:8, alignItems:"center" }}>
              <Icon name="shield" size={13} color="var(--text-subtle)"/>
              <span style={{ fontSize:12, color:"var(--text-muted)" }}>Your data stays within your school's private cloud</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Home ─────────────────────────────────────────────────────────────────────
function HomeScreen({ setScreen, setLesson, onLessonSave }) {
  const { lessons, preLessonAdaptations } = window.UnitiData;
  const [addOpen,    setAddOpen]   = useSA(false);
  const [dayOffset,  setDayOffset] = useSA(0); // 0 = today (Sat 7 Jun 2026)

  const icons = { Maths:"÷", English:"✎", Science:"⚗" };

  // Date maths
  const BASE = new Date(2026, 5, 7); // 7 Jun 2026
  const cur  = new Date(BASE); cur.setDate(BASE.getDate() + dayOffset);
  const DOW  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MON  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dow  = cur.getDay();
  const isSchoolDay = dow >= 1 && dow <= 5 || isToday; // today always shows lessons in demo
  const isToday = dayOffset === 0;
  const dateLabel = `${DOW[dow]} ${cur.getDate()} ${MON[cur.getMonth()]} 2026`;

  const SUBJECT_CLR = {
    Maths:   { primaryColor:"#2EAD73", lightColor:"#E8F6EF" },
    English: { primaryColor:"#3A8FCC", lightColor:"#E3F2FB" },
    Science: { primaryColor:"#8B6BD6", lightColor:"#F0ECFD" },
    History: { primaryColor:"#E8953A", lightColor:"#FEF0DC" },
    PSHE:    { primaryColor:"#D95A57", lightColor:"#FDECEB" },
    Art:     { primaryColor:"#CA8A04", lightColor:"#FEF9C3" },
    PE:      { primaryColor:"#0891B2", lightColor:"#E0F7FA" }
  };
  const DAILY = {
    1:[{subject:"Maths",  topic:"Fractions — Mixed Numbers",           yearGroup:"Year 4", cls:"4M", time:"9:00 – 9:45am",  room:"12"},
       {subject:"English",topic:"Poetry — Imagery & Metaphor",         yearGroup:"Year 5", cls:"5A", time:"10:30 – 11:15am", room:"7"},
       {subject:"Science",topic:"Electricity — Simple Circuits",       yearGroup:"Year 6", cls:"6B", time:"1:00 – 1:45pm",  room:"8"}],
    2:[{subject:"English",topic:"Persuasive Writing — Draft Review",   yearGroup:"Year 4", cls:"4M", time:"9:00 – 9:45am",  room:"12"},
       {subject:"History",topic:"Ancient Egypt — Mummification",       yearGroup:"Year 4", cls:"4H", time:"11:30 – 12:15pm",room:"14"}],
    3:[{subject:"Maths",  topic:"Decimals — Tenths & Hundredths",     yearGroup:"Year 5", cls:"5A", time:"9:00 – 9:45am",  room:"7"},
       {subject:"Science",topic:"Forces — Friction Experiments",       yearGroup:"Year 3", cls:"3H", time:"10:30 – 11:15am", room:"8"},
       {subject:"PSHE",   topic:"Managing Worry — Coping Strategies",  yearGroup:"Year 3", cls:"3H", time:"2:00 – 2:45pm",  room:"8"}],
    4:[{subject:"Science",topic:"Plants — Life Cycles",               yearGroup:"Year 3", cls:"3H", time:"9:00 – 9:45am",  room:"8"},
       {subject:"Maths",  topic:"Geometry — Angles",                  yearGroup:"Year 6", cls:"6B", time:"1:00 – 1:45pm",  room:"15"}],
    5:[{subject:"English",topic:"Reading — Inference Questions",       yearGroup:"Year 4", cls:"4M", time:"9:00 – 9:45am",  room:"12"},
       {subject:"Art",    topic:"Watercolour Techniques",               yearGroup:"Year 5", cls:"5A", time:"10:30 – 12:00pm",room:"Art"},
       {subject:"Maths",  topic:"Problem Solving — Multi-step",        yearGroup:"Year 4", cls:"4M", time:"1:00 – 1:45pm",  room:"12"}]
  };
  const mockLessons = !isToday && DAILY[dow]
    ? DAILY[dow].map((l,i) => ({ ...l, id:`mock-${dow}-${i}`, status:"upcoming", assessed:0, pupils:28, ...(SUBJECT_CLR[l.subject]||SUBJECT_CLR.Maths) }))
    : [];
  const displayLessons = isToday ? lessons : mockLessons;

  // Group adaptations by lesson
  const adaptGroups = {};
  (preLessonAdaptations||[]).forEach(a => {
    if (!adaptGroups[a.lessonId]) adaptGroups[a.lessonId] = { time:a.lessonTime, lesson:a.lesson, items:[] };
    adaptGroups[a.lessonId].items.push(a);
  });

  const navBtn = (onClick, label) => (
    <button onClick={onClick} style={{
      padding:"5px 10px", borderRadius:20, border:"1px solid var(--border)",
      background:"var(--surface)", cursor:"pointer", fontFamily:"inherit",
      fontSize:12, fontWeight:700, color:"var(--text-muted)", display:"flex",
      alignItems:"center", gap:4, transition:"background 0.12s"
    }} onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
       onMouseLeave={e=>e.currentTarget.style.background="var(--surface)"}>{label}</button>
  );

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* ── Top bar ── */}
      <div style={{ padding:"12px 22px 10px", background:"var(--surface)", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <h1 style={{ fontSize:18, fontWeight:700, color:"var(--text)", margin:0 }}>Good morning, Sarah</h1>
          <Btn small variant="ghost" icon="plus" onClick={() => setAddOpen(true)}>Add lesson</Btn>
        </div>
        {/* Day navigation */}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {navBtn(() => setDayOffset(d => d-1), <><Icon name="chevron_l" size={13}/></>)}
          <div style={{
            padding:"5px 14px", borderRadius:20, background: isToday ? "var(--primary-light)" : "var(--surface-2)",
            border:`1px solid ${isToday ? "var(--primary)" : "var(--border)"}`,
            fontSize:12, fontWeight:700, color: isToday ? "var(--primary)" : "var(--text)"
          }}>
            {isToday ? "Today" : ""} {dateLabel}
          </div>
          {navBtn(() => setDayOffset(d => d+1), <><Icon name="chevron_r" size={13}/></>)}
          {!isToday && (
            <button onClick={() => setDayOffset(0)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,color:"var(--primary)",fontFamily:"inherit",marginLeft:4 }}>
              ← Today
            </button>
          )}
          <span style={{ fontSize:11, color:"var(--text-subtle)", marginLeft:6 }}>Week 8 · Summer Term</span>
        </div>
      </div>

      {/* ── Main: two-column ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* Left: lesson timeline */}
        <div style={{ flex:1, overflow:"auto", padding:"18px 22px", minWidth:0 }}>
          {!isSchoolDay ? (
            <div style={{ padding:"48px 0", textAlign:"center", color:"var(--text-muted)" }}>
              <div style={{ fontSize:28, marginBottom:12 }}>📅</div>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>No school on {DOW[dow]}s</div>
              <button onClick={() => setDayOffset(dow===0 ? 1 : 2)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,color:"var(--primary)",fontFamily:"inherit" }}>
                See Monday →
              </button>
            </div>
          ) : (
            <div style={{ position:"relative" }}>
              {/* Vertical timeline line */}
              <div style={{ position:"absolute", left:36, top:24, bottom:24, width:1, background:"var(--border)" }}/>

              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {(displayLessons || []).map((l, idx) => {
                  const isActive = l.status === "in-progress";
                  const pct = Math.round((l.assessed / l.pupils) * 100);
                  return (
                    <div key={l.id} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                      {/* Time + dot */}
                      <div style={{ width:72, flexShrink:0, textAlign:"right", paddingTop:12 }}>
                        <div style={{ fontSize:11, fontWeight:700, color: isActive ? l.primaryColor : "var(--text-subtle)" }}>
                          {l.time.split(" – ")[0]}
                        </div>
                      </div>
                      <div style={{
                        width:10, height:10, borderRadius:"50%", flexShrink:0, marginTop:14,
                        background: isActive ? l.primaryColor : "var(--border)",
                        border:`2px solid ${isActive ? l.primaryColor : "var(--border)"}`,
                        boxShadow: isActive ? `0 0 0 4px ${l.primaryColor}22` : "none",
                        position:"relative", zIndex:1
                      }}/>
                      {/* Card */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div onClick={() => { setLesson(l); setScreen("lesson"); }} style={{
                          padding:"12px 14px", borderRadius:10,
                          background: isActive ? l.lightColor : "var(--surface)",
                          border:`1px solid ${isActive ? l.primaryColor+"40" : "var(--border)"}`,
                          cursor:"pointer", transition:"all 0.12s"
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform="translateY(-1px)"}
                        onMouseLeave={e => e.currentTarget.style.transform="none"}>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: isActive ? 10 : 0 }}>
                            <div style={{ width:36, height:36, borderRadius:8, background: isActive ? "white" : l.lightColor, color:l.primaryColor, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                              {icons[l.subject] || "📖"}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:14, fontWeight:700, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.topic}</div>
                              <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:1 }}>{l.yearGroup} · Class {l.cls} · {l.time.split(" – ")[1] ? l.time : ""} · Room {l.room}</div>
                            </div>
                            {isActive && (
                              <div style={{ textAlign:"right", flexShrink:0 }}>
                                <ProgressRing pct={pct} size={38} stroke={4} color={l.primaryColor} label={`${pct}%`}/>
                              </div>
                            )}
                            {!isActive && (
                              <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:4, background:"#F1F3F6", color:"#8B93A1", flexShrink:0 }}>Upcoming</span>
                            )}
                          </div>
                          {isActive && (
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                              <div style={{ fontSize:11, color:l.primaryColor, fontWeight:600 }}>{l.assessed}/{l.pupils} pupils assessed</div>
                              <Btn small onClick={(e) => { e.stopPropagation(); setLesson(l); setScreen("lesson"); }} icon="lessons">Open class</Btn>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* No lessons for other school days with no mock data */}
                {!isToday && isSchoolDay && displayLessons.length === 0 && (
                  <div style={{ paddingLeft:86, color:"var(--text-muted)", fontSize:13 }}>
                    <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>No lessons scheduled</div>
                    <p style={{ fontSize:12 }}>Add lessons or check your MIS sync.</p>
                    <Btn small variant="ghost" icon="plus" onClick={() => setAddOpen(true)} style={{ marginTop:10 }}>Add lesson</Btn>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: adaptations panel */}
        <div style={{ width:256, flexShrink:0, borderLeft:"1px solid var(--border)", display:"flex", flexDirection:"column", background:"var(--surface)", overflow:"hidden" }}>
          <div style={{ padding:"12px 14px 10px", borderBottom:"1px solid var(--border)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <Icon name="zap" size={13} color="var(--primary)"/>
              <span style={{ fontSize:13, fontWeight:700 }}>Adaptations</span>
              <span style={{ fontSize:11, color:"var(--text-subtle)", marginLeft:2 }}>· today</span>
            </div>
          </div>
          <div style={{ flex:1, overflow:"auto", padding:"10px 12px" }}>
            {!isToday || !isSchoolDay ? (
              <div style={{ padding:"24px 8px", textAlign:"center", color:"var(--text-subtle)", fontSize:12 }}>
                No adaptations for this day
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {Object.values(adaptGroups).map(g => (
                  <div key={g.lesson}>
                    <div style={{ fontSize:10, fontWeight:700, color:"var(--text-subtle)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>
                      {g.time} · {g.lesson}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      {g.items.map((a, i) => (
                        <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 10px", borderRadius:7, background:"var(--bg)", border:"1px solid var(--border)" }}>
                          <span style={{ fontSize:14, flexShrink:0, lineHeight:1.3 }}>{a.emoji}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:11, fontWeight:600, color:"var(--text)", lineHeight:1.4, marginBottom:2 }}>{a.strategy}</div>
                            <div style={{ fontSize:10, color:"var(--text-subtle)" }}>{a.forLabel}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {addOpen && <AddLessonDrawer onClose={() => setAddOpen(false)} onSave={data => { setAddOpen(false); if(onLessonSave) onLessonSave(data); }}/>}
    </div>
  );
}

// ── Pupil Card ────────────────────────────────────────────────────────────
function PupilCard({ pupil, status, onClick }) {
  const cfg = (window.UnitiData.feedbackConfig || {})[status];
  const [hov, setHov] = useSA(false);
  return (
    <div onClick={() => onClick(pupil)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding: "10px 8px", borderRadius: 10, cursor: "pointer",
        background: cfg ? cfg.bg : "var(--surface)",
        border: `1.5px solid ${cfg ? cfg.color + "50" : "var(--border)"}`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
        transform: hov ? "scale(1.05)" : "scale(1)",
        transition: "all 0.12s ease",
        boxShadow: hov ? "0 4px 14px rgba(0,0,0,0.1)" : "none",
        position: "relative"
      }}>
      <Avatar initials={pupil.initials} size={36} statusColor={cfg?.color}/>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", textAlign: "center", lineHeight: 1.25, width: "100%" }}>
        {pupil.name}
      </div>
      {pupil.groups.length > 0 && (
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
          {pupil.groups.map(g => <GroupBadge key={g} group={g}/>)}
        </div>
      )}
      {cfg && (
        <div style={{
          position: "absolute", top: 4, right: 4,
          width: 15, height: 15, borderRadius: "50%", background: cfg.color,
          color: "#fff", fontSize: 8, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>{cfg.emoji}</div>
      )}
    </div>
  );
}

// ── Pupil Drawer ──────────────────────────────────────────────────────────
function PupilDrawer({ pupil, lesson, status, onClose, onSave }) {
  const { feedbackConfig, defaultNotes } = window.UnitiData;
  const [sel, setSel] = useSA(status || null);
  const [note, setNote] = useSA(defaultNotes?.[pupil?.id] || "");
  const [listening, setListening] = useSA(false);

  const [sgFlag, setSgFlag] = useSA(false);
  const { safeguardingKeywords } = window.UnitiData;
  const checkSG = (text) => setSgFlag((safeguardingKeywords||[]).some(k => text.toLowerCase().includes(k)));

  useEffSA(() => {
    if (pupil) { setSel(status || null); setNote(defaultNotes?.[pupil.id] || ""); setSgFlag(false); }
  }, [pupil?.id]);

  const options = Object.entries(feedbackConfig);
  if (!pupil) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.22)", zIndex: 100, backdropFilter: "blur(3px)" }}/>
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 400,
        background: "var(--surface)", borderLeft: "1px solid var(--border)",
        boxShadow: "var(--shadow-lg)", zIndex: 101,
        display: "flex", flexDirection: "column",
        animation: "slideInDrawer 0.2s ease-out"
      }}>
        <style>{`@keyframes slideInDrawer{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>

        {/* Header */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar initials={pupil.initials} size={40}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{pupil.name}</div>
            <div style={{ display: "flex", gap: 5, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
              {pupil.groups.map(g => <GroupBadge key={g} group={g}/>)}
              {lesson && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>{lesson.subject} · {lesson.yearGroup}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-subtle)", padding: 4, borderRadius: 6, display: "flex" }}>
            <Icon name="x" size={20}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "18px 18px" }}>
          {/* Status */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>How did today's lesson go?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {options.map(([key, cfg]) => {
                const active = sel === key;
                return (
                  <button key={key} onClick={() => setSel(active ? null : key)} style={{
                    padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                    border: `2px solid ${active ? cfg.color : "transparent"}`,
                    background: active ? cfg.bg : "var(--surface-2)",
                    display: "flex", alignItems: "center", gap: 8,
                    transition: "all 0.12s", fontFamily: "inherit", textAlign: "left"
                  }}>
                    <span style={{ fontSize: 17 }}>{cfg.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: active ? cfg.color : "var(--text)" }}>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Notes (optional)</div>
            <div style={{ position: "relative" }}>
              <textarea value={note} onChange={e => { setNote(e.target.value); checkSG(e.target.value); }}
                placeholder="Add a quick observation…" rows={3}
                style={{
                  width: "100%", padding: "10px 38px 10px 12px",
                  border: "1.5px solid var(--border)", borderRadius: 8,
                  fontSize: 13, fontFamily: "inherit", resize: "none",
                  background: "var(--surface)", color: "var(--text)", outline: "none",
                  transition: "border-color 0.15s"
                }}
                onFocus={e => e.target.style.borderColor = "var(--primary)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}/>
              <button onClick={() => setListening(l => !l)} style={{
                position: "absolute", right: 8, top: 8,
                background: listening ? "var(--revisit)" : "none",
                border: "none", cursor: "pointer", padding: 6, borderRadius: 6,
                color: listening ? "#fff" : "var(--text-subtle)", display: "flex"
              }}>
                <Icon name="mic" size={14}/>
              </button>
            </div>
            {sgFlag && (
              <div style={{ fontSize:11, color:"#D95A57", marginTop:6, padding:"8px 10px", background:"#FDECEB", borderRadius:6, display:"flex", gap:7, alignItems:"flex-start" }}>
                <Icon name="shield" size={13} color="#D95A57" style={{ marginTop:1, flexShrink:0 }}/>
                <span><strong>Sensitive note detected.</strong> This won't be shared with AI. Follow your school's safeguarding process if needed.</span>
              </div>
            )}
            {listening && (
              <div style={{ fontSize: 11, color: "#D95A57", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#D95A57", display: "inline-block", animation: "pulse 1s ease infinite" }}/>
                Listening… tap mic to stop
                <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
              </div>
            )}
          </div>

          {/* Recent */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Recent lessons</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {["got_it","nearly_there","got_it","nearly_there","absent"].map((s, i) => {
                const c = (window.UnitiData.feedbackConfig || {})[s];
                if (!c) return null;
                return (
                  <div key={i} title={c.label} style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: c.bg, border: `2px solid ${c.color}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, color: c.color
                  }}>{c.emoji}</div>
                );
              })}
              <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 4 }}>last 5 · Maths</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "13px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex: 1, justifyContent: "center" }}>Cancel</Btn>
          <Btn onClick={() => onSave(pupil.id, sel, note)} style={{ flex: 2, justifyContent: "center" }}>
            Save feedback
          </Btn>
        </div>
      </div>
    </>
  );
}

// ── Lesson Screen (split: grid left | adaptations right) ─────────────────
function LessonScreen({ lesson, feedback, setScreen, onPupilClick }) {
  const { pupils, feedbackConfig, preLessonAdaptations } = window.UnitiData;
  const [filter,     setFilter]     = useSA("all");
  const [showAdapt,  setShowAdapt]  = useSA(true);
  const [timerOn,    setTimerOn]    = useSA(false);
  const [elapsed,    setElapsed]    = useSA(0);
  const [nudge,      setNudge]      = useSA(false);

  useEffSA(() => {
    if (!timerOn) return;
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [timerOn]);
  useEffSA(() => { if (elapsed >= 8 * 60) setNudge(true); }, [elapsed]);

  const mins = String(Math.floor(elapsed / 60)).padStart(2,'0');
  const secs = String(elapsed % 60).padStart(2,'0');

  if (!lesson) return (
    <div style={{ padding:40, textAlign:"center", color:"var(--text-muted)" }}>
      <p>Select a lesson from Today.</p>
      <Btn variant="ghost" onClick={() => setScreen("home")} style={{ marginTop:12 }}>Go home</Btn>
    </div>
  );

  const assessed = pupils.filter(p => feedback[p.id]).length;
  const pct = Math.round(assessed / lesson.pupils * 100);

  const counts = {};
  Object.values(feedback).forEach(s => { if(s) counts[s] = (counts[s]||0)+1; });

  const filterOpts = [
    { key:"all",           label:"All" },
    { key:"unset",         label:`Unassessed (${lesson.pupils - assessed})` },
    { key:"needs_revisit", label:`Needs revisit (${counts.needs_revisit||0})` }
  ];

  const filtered = pupils.filter(p => {
    if (filter==="all") return true;
    if (filter==="unset") return !feedback[p.id];
    return feedback[p.id] === filter;
  });

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* 8-min nudge */}
      {nudge && (
        <div style={{
          position:"absolute", top:10, right:10, zIndex:50, maxWidth:272,
          background:"var(--surface)", border:"2px solid var(--primary)", borderRadius:12,
          padding:"12px 14px", boxShadow:"var(--shadow-md)"
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
            <Icon name="clock" size={14} color="var(--primary)"/>
            <span style={{ fontSize:13, fontWeight:700, color:"var(--primary)" }}>8-min check-in</span>
            <button onClick={() => setNudge(false)} style={{ marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"var(--text-subtle)",display:"flex" }}><Icon name="x" size={14}/></button>
          </div>
          <p style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.5, marginBottom:9 }}>
            Check in with <strong>Harry S., Isla B., Theo W.</strong> — they struggled last lesson.
          </p>
          <Btn small onClick={() => setNudge(false)}>Done ✓</Btn>
        </div>
      )}

      {/* ── Header: minimal ── */}
      <div style={{ padding:"9px 18px", background:"var(--surface)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <button onClick={() => setScreen("home")} style={{ background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5,color:"var(--primary)",fontSize:13,fontWeight:600,padding:"4px 8px",borderRadius:6 }}>
          <Icon name="back" size={14}/>Back
        </button>
        <div style={{ flex:1, fontSize:12, color:"var(--text-muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {lesson.yearGroup} · {lesson.cls} · {lesson.time} · Room {lesson.room}
        </div>
        <ProgressRing pct={pct} size={38} stroke={4} color={lesson.primaryColor} label={`${pct}%`}/>
        <button onClick={() => setShowAdapt(v => !v)} style={{
          padding:"5px 7px", borderRadius:20, border:"1px solid var(--border)",
          background: showAdapt ? "var(--primary-light)" : "var(--surface)",
          color: showAdapt ? "var(--primary)" : "var(--text-muted)",
          cursor:"pointer", display:"flex", alignItems:"center", transition:"all 0.12s"
        }}>
          <Icon name="zap" size={13}/>
        </button>
      </div>

      {/* ── Body: grid + right panel ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative" }}>

        {/* Pupil grid */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
          {/* Filter bar */}
          <div style={{ padding:"8px 20px", borderBottom:"1px solid var(--border)", display:"flex", gap:6, alignItems:"center" }}>
            {filterOpts.map(opt => (
              <button key={opt.key} onClick={() => setFilter(opt.key)} style={{
                padding:"4px 12px", borderRadius:20, border:"none", cursor:"pointer",
                fontFamily:"inherit", fontSize:12, fontWeight:600,
                background: filter===opt.key ? "var(--primary)" : "var(--surface-2)",
                color: filter===opt.key ? "#fff" : "var(--text-muted)", transition:"all 0.12s"
              }}>{opt.label}</button>
            ))}
            <div style={{ marginLeft:"auto", fontSize:11, color:"var(--text-subtle)" }}>{assessed}/{lesson.pupils} assessed</div>
          </div>

          {/* Grid */}
          <div style={{ flex:1, overflow:"auto", padding:"12px 20px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(100px, 1fr))", gap:8 }}>
              {filtered.map(p => <PupilCard key={p.id} pupil={p} status={feedback[p.id]} onClick={onPupilClick}/>)}
            </div>
          </div>
        </div>

        {/* Right panel: Adaptations */}
        {showAdapt && (
          <div style={{
            width:256, flexShrink:0, borderLeft:"1px solid var(--border)",
            display:"flex", flexDirection:"column", background:"var(--surface)",
            overflow:"hidden"
          }}>
            <div style={{ padding:"12px 14px 10px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <Icon name="zap" size={13} color="var(--primary)"/>
                <span style={{ fontSize:13, fontWeight:700 }}>Adaptations</span>
              </div>
              <button onClick={() => setShowAdapt(false)} style={{ background:"none",border:"none",cursor:"pointer",color:"var(--text-subtle)",display:"flex",padding:3,borderRadius:4 }}>
                <Icon name="x" size={13}/>
              </button>
            </div>

            {/* Adaptation rows — for this lesson only */}
            <div style={{ flex:1, overflow:"auto", padding:"10px 12px" }}>
              {(() => {
                const lessonAdapts = (window.UnitiData.preLessonAdaptations || []).filter(a => a.lessonId === lesson?.id);
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {lessonAdapts.map((a, i) => (
                      <div key={i} style={{ padding:"9px 11px", borderRadius:8, background:"var(--bg)", border:"1px solid var(--border)" }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                          <span style={{ fontSize:16, flexShrink:0, lineHeight:1.2 }}>{a.emoji}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:"var(--text)", lineHeight:1.4, marginBottom:3 }}>{a.strategy}</div>
                            <div style={{ fontSize:10, color:"var(--text-subtle)" }}>{a.forLabel}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Timer footer */}
            <div style={{ padding:"10px 12px", borderTop:"1px solid var(--border)", display:"flex", alignItems:"center", gap:8 }}>
              <button onClick={() => setTimerOn(v => !v)} style={{
                flex:1, padding:"7px 10px", borderRadius:8, border:"1px solid var(--border)",
                background: timerOn ? "var(--primary)" : "var(--surface-2)",
                color: timerOn ? "#fff" : "var(--text-muted)",
                fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6
              }}>
                <Icon name="clock" size={13}/>
                {timerOn ? `${mins}:${secs}` : "Start timer"}
              </button>
              {timerOn && (
                <div style={{ width:32, height:32, borderRadius:"50%", flexShrink:0, position:"relative", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width={32} height={32} style={{ transform:"rotate(-90deg)", position:"absolute" }}>
                    <circle cx={16} cy={16} r={12} fill="none" stroke="var(--border)" strokeWidth={3}/>
                    <circle cx={16} cy={16} r={12} fill="none" stroke="var(--primary)" strokeWidth={3}
                      strokeDasharray={75.4} strokeDashoffset={75.4 * (1 - elapsed/(8*60))}
                      strokeLinecap="round" style={{ transition:"stroke-dashoffset 1s linear" }}/>
                  </svg>
                  <span style={{ fontSize:9, fontWeight:700, color:"var(--primary)", position:"relative" }}>8m</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Lesson Drawer ─────────────────────────────────────────────────────
function AddLessonDrawer({ onClose, onSave }) {
  const [subject,  setSubject]  = useSA("Maths");
  const [yearGrp,  setYearGrp]  = useSA("Year 4");
  const [topic,    setTopic]    = useSA("");
  const [timeFrom, setTimeFrom] = useSA("09:00");
  const [timeTo,   setTimeTo]   = useSA("09:45");
  const [room,     setRoom]     = useSA("12");
  const [file,     setFile]     = useSA(null);
  const [saving,   setSaving]   = useSA(false);

  const subjects = ["Maths","English","Science","History","RE","PSHE","PE","Art","Music","Computing"];
  const years    = ["Year 1","Year 2","Year 3","Year 4","Year 5","Year 6"];
  const chip = active => ({ padding:"6px 12px", borderRadius:20, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, transition:"all 0.12s", border:`1px solid ${active ? "transparent" : "var(--border)"}`, background: active ? "var(--primary)" : "var(--surface-2)", color: active ? "#fff" : "var(--text-muted)" });
  const inputStyle = { width:"100%", padding:"9px 12px", border:"1.5px solid var(--border)", borderRadius:"var(--radius-sm)", fontSize:13, fontFamily:"inherit", outline:"none", background:"var(--surface)", color:"var(--text)", transition:"border-color 0.15s" };

  const handleSave = () => {
    if (!topic.trim()) return;
    setSaving(true);
    setTimeout(() => { onSave({ subject, yearGrp, topic, timeFrom, timeTo, room, hasFile:!!file }); setSaving(false); onClose(); }, 700);
  };

  return (
    <>
      <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.22)",zIndex:100,backdropFilter:"blur(3px)" }}/>
      <div style={{ position:"fixed",top:0,right:0,bottom:0,width:460,background:"var(--surface)",borderLeft:"1px solid var(--border)",boxShadow:"var(--shadow-lg)",zIndex:101,display:"flex",flexDirection:"column",animation:"slideInDrawer 0.2s ease-out" }}>
        <div style={{ padding:"16px 20px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:12 }}>
          <div style={{ width:34,height:34,borderRadius:9,background:"var(--primary-light)",color:"var(--primary)",display:"flex",alignItems:"center",justifyContent:"center" }}><Icon name="plus" size={17}/></div>
          <div style={{ flex:1 }}><div style={{ fontSize:15,fontWeight:700 }}>New lesson</div><div style={{ fontSize:11,color:"var(--text-muted)" }}>Add to today's timetable</div></div>
          <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:"var(--text-subtle)",display:"flex" }}><Icon name="x" size={20}/></button>
        </div>
        <div style={{ flex:1,overflow:"auto",padding:20 }}>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:9 }}>Subject</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>{subjects.map(s => <button key={s} onClick={() => setSubject(s)} style={chip(subject===s)}>{s}</button>)}</div>
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:9 }}>Year group</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>{years.map(y => <button key={y} onClick={() => setYearGrp(y)} style={chip(yearGrp===y)}>{y}</button>)}</div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:8 }}>Topic</label>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder={`e.g. ${subject} – new concept`} style={inputStyle} onFocus={e => e.target.style.borderColor="var(--primary)"} onBlur={e => e.target.style.borderColor="var(--border)"}/>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:18 }}>
            {[{label:"Start",val:timeFrom,set:setTimeFrom},{label:"End",val:timeTo,set:setTimeTo}].map(f => (
              <div key={f.label}><label style={{ fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:7 }}>{f.label}</label><input type="time" value={f.val} onChange={e => f.set(e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor="var(--primary)"} onBlur={e => e.target.style.borderColor="var(--border)"}/>  </div>
            ))}
            <div><label style={{ fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:7 }}>Room</label><input value={room} onChange={e => setRoom(e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor="var(--primary)"} onBlur={e => e.target.style.borderColor="var(--border)"}/></div>
          </div>
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8 }}>Lesson plan <span style={{ fontWeight:400,textTransform:"none" }}>(optional)</span></div>
            <label htmlFor="lesson-file" style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"18px 16px",borderRadius:10,cursor:"pointer",border:`2px dashed ${file ? "var(--primary)" : "var(--border)"}`,background:file ? "var(--primary-light)" : "transparent",transition:"all 0.15s",textAlign:"center" }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) setFile(f); }}>
              <span style={{ fontSize:24 }}>{file ? "📄" : "📎"}</span>
              <span style={{ fontSize:13,fontWeight:600,color:file ? "var(--primary)" : "var(--text)" }}>{file ? file.name : "Upload lesson plan"}</span>
              <span style={{ fontSize:11,color:"var(--text-subtle)" }}>{file ? "Adaptations will generate automatically" : "PDF · Word · Google Doc"}</span>
              <input id="lesson-file" type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => setFile(e.target.files[0])} style={{ display:"none" }}/>
            </label>
            {file && <button onClick={() => setFile(null)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:11,color:"var(--text-subtle)",marginTop:5,fontFamily:"inherit" }}>✕ Remove</button>}
          </div>
        </div>
        <div style={{ padding:"13px 20px",borderTop:"1px solid var(--border)",display:"flex",gap:10 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex:1,justifyContent:"center" }}>Cancel</Btn>
          <Btn onClick={handleSave} disabled={!topic.trim()} style={{ flex:2,justifyContent:"center" }}>{saving ? "Saving…" : "Save lesson"}</Btn>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { LoginScreen, HomeScreen, LessonScreen, PupilCard, PupilDrawer, AddLessonDrawer });
