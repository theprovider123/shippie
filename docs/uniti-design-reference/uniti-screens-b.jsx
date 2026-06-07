// uniti-screens-b.jsx  — AI · Timeline · Leadership · Admin
const { useState: useSB, useEffect: useEffSB } = React;
const { Icon, Avatar, GroupBadge, StatusPill, ProgressRing, Btn, Card } = window;

// ── AI Adaptation Screen ──────────────────────────────────────────────────
function AIScreen({ feedback, lesson, setScreen }) {
  const { aiSuggestions: raw, feedbackConfig } = window.UnitiData;
  const [sugs, setSugs] = useSB(raw.map(s => ({ ...s })));
  const [aiOn, setAiOn] = useSB(true);

  const counts = {};
  Object.values(feedback).forEach(s => { if (s) counts[s] = (counts[s] || 0) + 1; });

  const typeColors = {
    activity:  { bg: "#E8F6EF", color: "#2EAD73" },
    grouping:  { bg: "#E3F2FB", color: "#3A8FCC" },
    resource:  { bg: "#FEF0DC", color: "#E8953A" },
    flag:      { bg: "#FDECEB", color: "#D95A57" }
  };
  const typeEmoji = { activity: "🎯", grouping: "👥", resource: "📋", flag: "🔔" };

  const action = (id, act) => setSugs(prev => prev.map(s => s.id === id ? { ...s, status: act } : s));

  return (
    <div style={{ padding: "22px 26px", maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <button onClick={() => setScreen("lesson")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "var(--primary)", fontSize: 13, fontWeight: 600, padding: "0 0 8px 0" }}>
            <Icon name="back" size={14}/> Back to lesson
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>What Year 4 Maths needs next</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {lesson?.topic || "Fractions – Equivalent Fractions"} · {lesson?.yearGroup || "Year 4"}
          </p>
        </div>
        {/* AI toggle */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, flexShrink: 0,
          background: aiOn ? "var(--primary-light)" : "#F1F3F6",
          border: `1px solid ${aiOn ? "var(--primary)" : "var(--border)"}`
        }}>
          <Icon name="sparkle" size={14} color={aiOn ? "var(--primary)" : "var(--text-subtle)"}/>
          <span style={{ fontSize: 12, fontWeight: 600, color: aiOn ? "var(--primary)" : "var(--text-muted)" }}>AI {aiOn ? "ON" : "OFF"}</span>
          <button onClick={() => setAiOn(v => !v)} style={{
            width: 34, height: 20, borderRadius: 10,
            background: aiOn ? "var(--primary)" : "#CBD5E1",
            border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s"
          }}>
            <div style={{
              position: "absolute", top: 3, width: 14, height: 14, borderRadius: "50%",
              background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              left: aiOn ? 17 : 3
            }}/>
          </button>
        </div>
      </div>

      {/* Class snapshot */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {Object.entries(feedbackConfig).map(([key, cfg]) =>
          counts[key] ? (
            <div key={key} style={{ padding: "10px 14px", borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.color}30`, minWidth: 72 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{counts[key]}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: cfg.color, marginTop: 3 }}>{cfg.label}</div>
            </div>
          ) : null
        )}
      </div>

      {/* Trust note */}
      <div style={{ padding: "9px 13px", borderRadius: 8, marginBottom: 20, background: "var(--primary-light)", border: "1px solid var(--primary)", display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="sparkle" size={13} color="var(--primary)"/>
        <span style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>
          Suggested by Uniti AI · Based on today's class feedback · All suggestions are editable · Data stays on school cloud
        </span>
      </div>

      {aiOn ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sugs.map(sug => {
            const tc = typeColors[sug.type] || typeColors.activity;
            const actioned = sug.status === "actioned";
            const skipped  = sug.status === "skipped";
            return (
              <Card key={sug.id} style={{ opacity: skipped ? 0.38 : 1, transition: "opacity 0.2s" }}>
                <div style={{ display: "flex", gap: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: tc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                    {typeEmoji[sug.type]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: tc.bg, color: tc.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{sug.typeLabel}</span>
                      <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>{sug.confidence}% confidence · {sug.affectedPupils} {sug.affectedPupils === 1 ? "pupil" : "pupils"}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{sug.title}</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>{sug.detail}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <Btn small variant={actioned ? "primary" : "secondary"} onClick={() => action(sug.id, actioned ? "pending" : "actioned")}>
                        {actioned ? "✓ Planned" : "Mark as planned"}
                      </Btn>
                      <Btn small variant="ghost" icon="edit" onClick={() => {}}>Edit</Btn>
                      {!skipped && !actioned && (
                        <Btn small variant="ghost" onClick={() => action(sug.id, "skipped")}>Skip</Btn>
                      )}
                      {skipped && (
                        <Btn small variant="ghost" onClick={() => action(sug.id, "pending")}>Restore</Btn>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: "40px 32px", textAlign: "center", color: "var(--text-muted)" }}>
          <Icon name="sparkle" size={36} color="var(--border)"/>
          <p style={{ marginTop: 14, fontSize: 15, fontWeight: 600 }}>AI suggestions are off</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>Turn on AI to see personalised next steps for your class</p>
          <Btn style={{ marginTop: 16 }} onClick={() => setAiOn(true)}>Turn AI on</Btn>
        </div>
      )}
    </div>
  );
}

// ── Radar Chart ──────────────────────────────────────────────────────────
function SubjectTimeline({ subjects }) {
  const [hov, setHov] = useSB(null);

  const W = 340, H = 196;
  const pad = { l:10, r:68, t:18, b:26 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;
  const n  = subjects[0]?.weeks.length || 6;
  const weekLabels = ["5 May","12 May","19 May","26 May","2 Jun","7 Jun"];

  const scoreOf = s => ({ got_it:91, support_worked:76, nearly_there:54, support_not_worked:30, needs_revisit:16, absent:null }[s] ?? null);
  const xAt = i   => pad.l + (cw / (n - 1)) * i;
  const yAt = pct => pad.t + ch * (1 - pct / 100);
  const bot  = pad.t + ch;

  const zones = [
    { from:68, to:100, fill:"#2EAD73", label:"Got it" },
    { from:38, to:68,  fill:"#E8953A", label:"Nearly there" },
    { from:0,  to:38,  fill:"#D95A57", label:"Needs revisit" }
  ];

  // Build smooth bezier curve through a segment of points
  const bezierD = seg => {
    if (seg.length === 1) return `M ${seg[0].x} ${seg[0].y}`;
    let d = `M ${seg[0].x.toFixed(1)} ${seg[0].y.toFixed(1)}`;
    for (let i = 1; i < seg.length; i++) {
      const p0 = seg[i-1], p1 = seg[i];
      const tx = (p1.x - p0.x) * 0.42;
      d += ` C ${(p0.x+tx).toFixed(1)} ${p0.y.toFixed(1)},${(p1.x-tx).toFixed(1)} ${p1.y.toFixed(1)},${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    return d;
  };

  // Area fill path (close to bottom)
  const areaD = seg => {
    if (seg.length < 2) return null;
    let d = `M ${seg[0].x.toFixed(1)} ${bot}`;
    d += ` L ${seg[0].x.toFixed(1)} ${seg[0].y.toFixed(1)}`;
    for (let i = 1; i < seg.length; i++) {
      const p0 = seg[i-1], p1 = seg[i];
      const tx = (p1.x - p0.x) * 0.42;
      d += ` C ${(p0.x+tx).toFixed(1)} ${p0.y.toFixed(1)},${(p1.x-tx).toFixed(1)} ${p1.y.toFixed(1)},${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    d += ` L ${seg[seg.length-1].x.toFixed(1)} ${bot} Z`;
    return d;
  };

  const getSegs = pts => {
    const segs = []; let seg = [];
    pts.forEach(pt => { if (pt) seg.push(pt); else if (seg.length) { segs.push(seg); seg = []; } });
    if (seg.length) segs.push(seg);
    return segs;
  };

  const handleMouseMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(mx - xAt(i)); if (d < bestD) { bestD = d; best = i; } }
    if (bestD < 30) setHov(best); else setHov(null);
  };

  // Tooltip contents
  const tipW = 130, tipH = subjects.length * 19 + 24;
  const tipX = hov !== null && hov > n - 3 ? xAt(hov) - tipW - 8 : hov !== null ? xAt(hov) + 10 : 0;
  const tipY = pad.t + 2;

  return (
    <svg width={W} height={H} style={{ overflow:"visible", display:"block", cursor:"crosshair" }}
      onMouseMove={handleMouseMove} onMouseLeave={() => setHov(null)}>

      {/* Zone bands */}
      {zones.map(z => (
        <rect key={z.label} x={pad.l} y={yAt(z.to)} width={cw}
          height={Math.max(yAt(z.from) - yAt(z.to), 0)} fill={z.fill} fillOpacity="0.07" rx="2"/>
      ))}

      {/* Boundary dashes */}
      {[68,38].map(pct => (
        <line key={pct} x1={pad.l} y1={yAt(pct)} x2={pad.l+cw} y2={yAt(pct)}
          stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3"/>
      ))}

      {/* Zone labels — right of chart */}
      {zones.map(z => (
        <text key={z.label} x={pad.l + cw + 5} y={(yAt(z.from) + yAt(z.to)) / 2}
          dominantBaseline="middle"
          style={{ fontSize:8.5, fill:z.fill, fontFamily:"inherit", fontWeight:700 }}>
          {z.label}
        </text>
      ))}

      {/* Area fills */}
      {subjects.map(s => {
        const pts = s.weeks.map((st,i) => { const sc=scoreOf(st); return sc!==null?{x:xAt(i),y:yAt(sc)}:null; });
        return getSegs(pts).map((seg,si) => {
          const d = areaD(seg);
          return d ? <path key={`${s.name}-a${si}`} d={d} fill={s.color} fillOpacity="0.09"/> : null;
        });
      })}

      {/* Smooth lines */}
      {subjects.map(s => {
        const pts = s.weeks.map((st,i) => { const sc=scoreOf(st); return sc!==null?{x:xAt(i),y:yAt(sc)}:null; });
        return getSegs(pts).map((seg,si) => (
          <path key={`${s.name}-l${si}`} d={bezierD(seg)}
            fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        ));
      })}

      {/* Dots — grow on hover week */}
      {subjects.map(s => {
        const pts = s.weeks.map((st,i) => { const sc=scoreOf(st); return sc!==null?{x:xAt(i),y:yAt(sc)}:null; });
        return pts.map((pt,i) => pt && (
          <circle key={`${s.name}-d${i}`} cx={pt.x} cy={pt.y}
            r={hov === i ? 6 : 4} fill={s.color} stroke="white" strokeWidth="2"
            style={{ transition:"r 0.1s ease" }}/>
        ));
      })}

      {/* Hover crosshair */}
      {hov !== null && (
        <line x1={xAt(hov)} y1={pad.t} x2={xAt(hov)} y2={bot}
          stroke="var(--text-subtle)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6"/>
      )}

      {/* X-axis labels */}
      {weekLabels.map((lbl,i) => (
        <text key={i} x={xAt(i)} y={H-6} textAnchor="middle" style={{
          fontSize:8.5, fontFamily:"inherit",
          fill: hov===i ? "var(--text)" : "var(--text-subtle)",
          fontWeight: hov===i ? 700 : 400,
          transition:"fill 0.1s"
        }}>{lbl}</text>
      ))}

      {/* Tooltip card */}
      {hov !== null && (
        <g style={{ pointerEvents:"none" }}>
          <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="8"
            fill="white" stroke="var(--border)" strokeWidth="1"
            style={{ filter:"drop-shadow(0 3px 12px rgba(0,0,0,0.12))" }}/>
          <text x={tipX+10} y={tipY+14}
            style={{ fontSize:9.5, fontWeight:700, fill:"var(--text-muted)", fontFamily:"inherit" }}>
            {weekLabels[hov]}
          </text>
          {subjects.map((s,i) => {
            const st = s.weeks[hov];
            const lbl = { got_it:"Got it", nearly_there:"Nearly there", needs_revisit:"Needs revisit", absent:"Absent", support_worked:"Support ✓", support_not_worked:"Support ✗" }[st] || "—";
            const cy2 = tipY + 26 + i * 19;
            return (
              <g key={s.name}>
                <circle cx={tipX+12} cy={cy2} r="4" fill={s.color}/>
                <text x={tipX+20} y={cy2} dominantBaseline="middle"
                  style={{ fontSize:10, fontWeight:600, fill:"var(--text)", fontFamily:"inherit" }}>{s.name}</text>
                <text x={tipX+tipW-7} y={cy2} dominantBaseline="middle" textAnchor="end"
                  style={{ fontSize:9.5, fontWeight:700, fill:s.color, fontFamily:"inherit" }}>{lbl}</text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

// ── Timeline Screen ───────────────────────────────────────────────────────
function TimelineScreen() {
  const { pupils, feedbackConfig, timelineWeeks, timelineObjectives, overviewData } = window.UnitiData;
  const [selPupil, setSelPupil] = useSB(pupils[1]);
  const [subject, setSubject] = useSB("What helps");
  const tabs = ["What helps", "Overview", "Maths", "English", "Science", "History"];
  const weekLabels = ["5 May","12 May","19 May","26 May","2 Jun","7 Jun"];

  // Overview content
  const OverviewTab = () => {
    const statusScore = { got_it:100, nearly_there:60, needs_revisit:20, absent:0, support_worked:80, support_not_worked:30 };
    const pctToStatus = pct => pct >= 80 ? "got_it" : pct >= 55 ? "nearly_there" : "needs_revisit";

    const highlights = [
      { emoji:"⭐", title:"Most consistent",  value:"Science",   detail:"Got it in all 6 recent lessons",       color:"#8B6BD6", bg:"#F0ECFD" },
      { emoji:"↑",  title:"Most improved",    value:"Maths",     detail:"Improved from nearly there to got it", color:"#2EAD73", bg:"#E8F6EF" },
      { emoji:"✓",  title:"Watch list",       value:"All clear", detail:"No subjects need urgent attention",    color:"#8B93A1", bg:"#F1F3F6" }
    ];

    return (
      <div>
        {/* Composite + subject rings */}
        <Card style={{ marginBottom: 16, padding: "20px 24px" }}>
          <div style={{ display:"flex", gap:28, alignItems:"center", flexWrap:"wrap" }}>
            {/* Big ring */}
            <div style={{ textAlign:"center", flexShrink:0 }}>
              <ProgressRing pct={overviewData.composite} size={90} stroke={9} color="var(--primary)" label={`${overviewData.composite}%`}/>
              <div style={{ fontSize:12, fontWeight:600, color:"var(--text-muted)", marginTop:7 }}>Overall</div>
              <div style={{ fontSize:11, fontWeight:700, color:"#2EAD73", marginTop:2 }}>On track</div>
            </div>

            {/* Divider */}
            <div style={{ width:1, height:80, background:"var(--border)", flexShrink:0 }}/>

            {/* Subject mini-rings */}
            <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
              {overviewData.subjects.map(s => (
                <div key={s.name} style={{ textAlign:"center", cursor:"pointer" }} onClick={() => setSubject(s.name)}>
                  <ProgressRing pct={s.pct} size={56} stroke={6} color={s.color} label={`${s.pct}%`}/>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--text-muted)", marginTop:6 }}>{s.name}</div>
                  <div style={{ fontSize:10, fontWeight:700, color: s.trend==="up" ? "#2EAD73" : "#E8953A", marginTop:1 }}>
                    {s.trend==="up" ? "↑ Improving" : "→ Stable"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Radar + bar chart */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display:"flex", gap:24, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ flexShrink:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--text-muted)", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>Subject timeline</div>
              <SubjectTimeline subjects={overviewData.subjects}/>
              <div style={{ display:"flex", gap:12, marginTop:9, flexWrap:"wrap" }}>
                {overviewData.subjects.map(s=>(
                  <div key={s.name} style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <div style={{ width:22, height:3, borderRadius:2, background:s.color }}/>
                    <span style={{ fontSize:11, fontWeight:600, color:"var(--text-muted)" }}>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex:1, minWidth:180 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--text-muted)", marginBottom:14, textTransform:"uppercase", letterSpacing:"0.06em" }}>Breakdown</div>
              {overviewData.subjects.map(s => (
                <div key={s.name} style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>{s.name}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:s.color }}>{s.pct}%</span>
                  </div>
                  <div style={{ height:7, background:"var(--border)", borderRadius:4 }}>
                    <div style={{ height:"100%", width:`${s.pct}%`, background:s.color, borderRadius:4, transition:"width 0.5s ease" }}/>
                  </div>
                  <div style={{ fontSize:10, color: s.trend==="up" ? "#2EAD73" : "#E8953A", marginTop:3, fontWeight:600 }}>
                    {s.trend==="up" ? "↑ Improving this term" : "→ Holding steady"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Week grid — last 6 lessons per subject */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:16 }}>Last 6 lessons across subjects</div>
          <div style={{ overflowX:"auto" }}>
            {/* Week labels */}
            <div style={{ display:"flex", gap:0, marginBottom:8, paddingLeft:72 }}>
              {weekLabels.map(w => (
                <div key={w} style={{ width:44, fontSize:9, fontWeight:600, color:"var(--text-subtle)", textAlign:"center", flexShrink:0 }}>{w}</div>
              ))}
            </div>
            {overviewData.subjects.map(s => (
              <div key={s.name} style={{ display:"flex", alignItems:"center", gap:0, marginBottom:8 }}>
                <div style={{ width:70, fontSize:11, fontWeight:600, color:"var(--text-muted)", flexShrink:0, textAlign:"right", paddingRight:10 }}>{s.name}</div>
                {s.weeks.map((status, wi) => {
                  const cfg = feedbackConfig[status];
                  return (
                    <div key={wi} title={`${weekLabels[wi]}: ${cfg?.label}`} style={{
                      width:44, display:"flex", justifyContent:"center", flexShrink:0
                    }}>
                      <div style={{
                        width:30, height:30, borderRadius:"50%",
                        background: cfg?.bg || "#eee",
                        border: `2.5px solid ${cfg?.color || "#ccc"}`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:12, cursor:"default"
                      }}>{cfg?.emoji}</div>
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div style={{ display:"flex", gap:12, marginTop:12, paddingLeft:72, flexWrap:"wrap" }}>
              {["got_it","nearly_there","needs_revisit","absent"].map(key => {
                const cfg = feedbackConfig[key];
                return (
                  <div key={key} style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <div style={{ width:12, height:12, borderRadius:"50%", background:cfg.bg, border:`2px solid ${cfg.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:7 }}>{cfg.emoji}</div>
                    <span style={{ fontSize:10, color:"var(--text-subtle)", fontWeight:500 }}>{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Highlights */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          {highlights.map(h => (
            <div key={h.title} style={{ padding:"14px 16px", borderRadius:"var(--radius)", background:h.bg, border:`1px solid ${h.color}30` }}>
              <div style={{ fontSize:20, marginBottom:6 }}>{h.emoji}</div>
              <div style={{ fontSize:11, fontWeight:700, color:h.color, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>{h.title}</div>
              <div style={{ fontSize:14, fontWeight:700, color:"var(--text)", marginBottom:3 }}>{h.value}</div>
              <div style={{ fontSize:11, color:"var(--text-muted)", lineHeight:1.4 }}>{h.detail}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: "22px 26px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Pupil Progress</h1>

      {/* Pupil selector */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 22, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500, flexShrink: 0 }}>Viewing:</span>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {pupils.slice(0, 9).map(p => (
            <button key={p.id} onClick={() => setSelPupil(p)} style={{
              padding: "5px 11px", borderRadius: 20, cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 600,
              background: selPupil?.id === p.id ? "var(--primary)" : "var(--surface)",
              color: selPupil?.id === p.id ? "#fff" : "var(--text-muted)",
              border: `1px solid ${selPupil?.id === p.id ? "var(--primary)" : "var(--border)"}`,
              transition: "all 0.12s"
            }}>{p.name}</button>
          ))}
          <button style={{ padding: "5px 11px", borderRadius: 20, border: "1px solid var(--border)", background: "none", cursor: "pointer", fontSize: 12, color: "var(--text-subtle)", fontFamily: "inherit" }}>+ More</button>
        </div>
      </div>

      {/* Pupil header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius)" }}>
        <Avatar initials={selPupil?.initials || "BC"} size={42}/>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700 }}>{selPupil?.name || "Ben C."}</div>
          <div style={{ display:"flex", gap:6, marginTop:3, alignItems:"center" }}>
            {(selPupil?.groups||[]).map(g => <GroupBadge key={g} group={g}/>)}
            <span style={{ fontSize:12, color:"var(--text-muted)" }}>Year 4 · Summer Term 2026</span>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {overviewData.subjects.map(s => (
            <div key={s.name} title={`${s.name}: ${s.pct}%`} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:s.color }}/>
              <div style={{ width:4, height: Math.round(s.pct / 10), background:s.color, borderRadius:2, opacity:0.6 }}/>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--border)", marginBottom: 22 }}>
        {tabs.map(s => (
          <button key={s} onClick={() => setSubject(s)} style={{
            padding: "8px 18px", border: "none", background: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            color: subject === s ? "var(--primary)" : "var(--text-muted)",
            borderBottom: `2px solid ${subject === s ? "var(--primary)" : "transparent"}`,
            marginBottom: -2, transition: "all 0.12s"
          }}>{s}</button>
        ))}
      </div>

      {/* Tab content */}
      {subject === "What helps" ? (() => {
        const profile = (window.UnitiData.pupilProfiles || {})[selPupil?.id];
        const trajectoryColor = { improving:"#2EAD73", plateaued:"#E8953A", regressing:"#D95A57" };
        const trajectoryLabel = { improving:"Improving ↑", plateaued:"Holding steady →", regressing:"Needs attention ↓" };

        if (!profile) return (
          <div style={{ padding:"40px 0", textAlign:"center", color:"var(--text-muted)" }}>
            <Icon name="sparkle" size={32} color="var(--border)"/>
            <p style={{ marginTop:14, fontWeight:600 }}>Nothing here yet for {selPupil?.name}</p>
            <p style={{ fontSize:13, marginTop:6 }}>Builds automatically after a few lessons of feedback</p>
          </div>
        );

        return (
          <div>
            {/* Profile header */}
            <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:16, padding:"12px 14px", background:"var(--primary-light)", borderRadius:"var(--radius)", border:"1px solid var(--primary)30" }}>
              <Icon name="sparkle" size={14} color="var(--primary)"/>
              <span style={{ fontSize:12, color:"var(--primary)", fontWeight:600, flex:1 }}>
                Based on recent lessons · Teacher-owned · Updated {profile.lastUpdated}
              </span>
              <span style={{ fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:20, background:"white",
                color: trajectoryColor[profile.trajectory] }}>
                {trajectoryLabel[profile.trajectory]}
              </span>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
              {/* Works for them */}
              <Card style={{ gridColumn:"1 / -1" }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>What's worked before</div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:14 }}>
                  Teaching moves that help — pre-loaded before each lesson
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                  {profile.standingAdaptations.map((a,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 13px",
                      background:"var(--surface-2)", borderRadius:9, border:"1px solid var(--border)" }}>
                      <span style={{ fontSize:20, flexShrink:0 }}>{a.emoji}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{a.strategy}</div>
                        <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{a.basedOn} · {a.subject}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                        <div style={{ height:4, width:40, background:"var(--border)", borderRadius:2 }}>
                          <div style={{ height:"100%", width:`${a.confidence}%`, background:"#2EAD73", borderRadius:2 }}/>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, color:"#2EAD73" }}>{a.confidence}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Patterns noticed */}
              <Card>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>Patterns we've noticed</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {profile.barriers.map((b,i) => (
                    <div key={i} style={{ paddingBottom:10, borderBottom: i<profile.barriers.length-1?"1px solid var(--border)":"none" }}>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:5 }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", marginTop:4, flexShrink:0,
                          background: b.status==="established" ? "#D95A57" : "#E8953A" }}/>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:"var(--text)", lineHeight:1.4 }}>{b.label}</div>
                          <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:2 }}>
                            {b.subjects.join(", ")} · {b.freq} occurrences
                          </div>
                        </div>
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:4, flexShrink:0,
                          background: b.status==="established" ? "#FDECEB" : "#FEF0DC",
                          color: b.status==="established" ? "#D95A57" : "#E8953A",
                          textTransform:"uppercase", letterSpacing:"0.05em" }}>
                          {b.status==="established" ? "Regular pattern" : "Emerging"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* What's helped */}
              <Card>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>What's helped</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {profile.whatWorks.map((w,i) => (
                    <div key={i} style={{ paddingBottom:10, borderBottom: i<profile.whatWorks.length-1?"1px solid var(--border)":"none" }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"var(--text)", marginBottom:5, lineHeight:1.4 }}>{w.strategy}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ flex:1, height:5, background:"var(--border)", borderRadius:3 }}>
                          <div style={{ height:"100%", width:`${w.successRate}%`, background:"#2EAD73", borderRadius:3 }}/>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:"#2EAD73", flexShrink:0 }}>{w.successRate}%</span>
                      </div>
                      <div style={{ fontSize:10, color:"var(--text-subtle)", marginTop:3 }}>
                        {w.count} lessons · {w.subjects.join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Strengths */}
            <Card style={{ marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Strengths</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {profile.strengths.map(s => (
                  <span key={s} style={{ padding:"5px 12px", borderRadius:20, background:"#E8F6EF",
                    color:"#2EAD73", fontSize:12, fontWeight:600 }}>⭐ {s}</span>
                ))}
              </div>
            </Card>

            {/* GDPR note */}
            <div style={{ padding:"10px 13px", borderRadius:8, background:"var(--surface-2)",
              border:"1px solid var(--border)", display:"flex", gap:8, alignItems:"center" }}>
              <Icon name="shield" size={13} color="var(--text-subtle)"/>
              <span style={{ fontSize:11, color:"var(--text-muted)", lineHeight:1.5 }}>
                This is a memory of what helps {selPupil?.name?.split(" ")[0]} learn — not a fixed label. Evidence-linked, teacher-owned, and deleted when the pupil moves on.
              </span>
            </div>
          </div>
        );
      })() : subject === "Overview" ? <OverviewTab/> : (
        <div>
          {/* Timeline card */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <Avatar initials={selPupil?.initials || "BC"} size={36}/>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{selPupil?.name || "Ben C."}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{subject} · Fractions – Equivalent Fractions</div>
              </div>
            </div>
            <div style={{ overflowX: "auto", paddingBottom: 4 }}>
              <div style={{ display: "flex", gap: 0, minWidth: "max-content", position: "relative" }}>
                <div style={{ position: "absolute", top: 18, left: 20, right: 20, height: 2, background: "var(--border)", zIndex: 0 }}/>
                {timelineWeeks.map((week, i) => {
                  const cfg = feedbackConfig[week.status];
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 90, position: "relative", zIndex: 1 }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: cfg?.bg || "#eee", border: `3px solid ${cfg?.color || "#ccc"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{cfg?.emoji}</div>
                      <div style={{ fontSize: 10, color: "var(--text-subtle)", textAlign: "center", fontWeight: 600 }}>{week.label}</div>
                      {week.note && <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.3, maxWidth: 84 }}>{week.note}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: 18, padding: "10px 13px", background: "#E8F6EF", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#2EAD73", fontSize: 18 }}>↑</span>
              <span style={{ fontSize: 13, color: "#2EAD73", fontWeight: 600 }}>Improving trend over 6 lessons · Confident in most recent session</span>
            </div>
          </Card>

          {/* Objectives */}
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Objectives this term — {subject}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {timelineObjectives.map((item, i) => {
              const cfg = feedbackConfig[item.status];
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg?.color || "#ccc", flexShrink: 0 }}/>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.obj}</div>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", marginRight: 6 }}>{item.lessons > 0 ? `${item.lessons} lessons` : "Not started"}</div>
                  <StatusPill status={item.status} small/>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Leadership Screen ─────────────────────────────────────────────────────
function LeadershipScreen() {
  const { leadershipSubjects, leadershipGroups, leadershipAdapt, school } = window.UnitiData;
  const [yearFilter, setYearFilter] = useSB("All years");

  const subColors = { Maths: "#2EAD73", English: "#3A8FCC", Science: "#8B6BD6", History: "#E8953A", PSHE: "#D95A57" };

  return (
    <div style={{ padding: "22px 26px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 3 }}>School Overview</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{school.name} · {school.term} · {school.week}</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["All years","Year 3","Year 4","Year 5","Year 6"].map(y => (
            <button key={y} onClick={() => setYearFilter(y)} style={{
              padding: "5px 12px", borderRadius: 20, cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 600,
              background: yearFilter === y ? "var(--primary)" : "var(--surface)",
              color: yearFilter === y ? "#fff" : "var(--text-muted)",
              border: `1px solid ${yearFilter === y ? "transparent" : "var(--border)"}`,
              transition: "all 0.12s"
            }}>{y}</button>
          ))}
        </div>
      </div>

      {/* Subject cards */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Progress by subject</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 12 }}>
          {leadershipSubjects.map(sub => {
            const color = subColors[sub.name] || "var(--primary)";
            const diff = Math.abs(sub.pct - sub.prev);
            const up = sub.trend === "up";
            return (
              <Card key={sub.name} style={{ padding: "16px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{sub.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: up ? "#2EAD73" : "#D95A57" }}>
                    {up ? "↑" : "↓"} {diff}%
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ProgressRing pct={sub.pct} size={68} stroke={7} color={color} label={`${sub.pct}%`}/>
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-subtle)" }}>
                  {sub.classes} classes · was {sub.prev}%
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Inclusion groups */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Inclusion groups</div>
        <Card noPad>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["Group","Pupils","On track","Needs support","Exceeding"].map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: h === "Group" ? "left" : "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leadershipGroups.map((grp, i) => (
                  <tr key={grp.label} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "var(--surface-2)" : "transparent" }}>
                    <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600 }}>{grp.label}</td>
                    <td style={{ padding: "11px 16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>{grp.n}</td>
                    <td style={{ padding: "11px 16px", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                        <div style={{ height: 5, width: Math.max(grp.on * 0.7, 8), background: "#2EAD73", borderRadius: 3 }}/>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#2EAD73" }}>{grp.on}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "11px 16px", textAlign: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: grp.support > 28 ? "#D95A57" : "#E8953A" }}>{grp.support}%</span>
                    </td>
                    <td style={{ padding: "11px 16px", textAlign: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>{grp.exc}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Adaptation impact */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>AI adaptation impact this term</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[
            { val: leadershipAdapt.suggested, label: "Suggestions made",           note: "This term",                    color: "var(--primary)" },
            { val: leadershipAdapt.actioned,  label: "Actioned by teachers",        note: `${Math.round(leadershipAdapt.actioned/leadershipAdapt.suggested*100)}% of suggestions`, color: "var(--accent)" },
            { val: `+${leadershipAdapt.impact}%`, label: "Measured improvement", note: "In needs-revisit pupils",     color: "#2EAD73" }
          ].map(s => (
            <Card key={s.label}>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginTop: 5 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 2 }}>{s.note}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Admin Screen ──────────────────────────────────────────────────────────
function AdminScreen() {
  const [tab, setTab] = useSB("overview");
  const [aiOn, setAiOn] = useSB(true);
  const [consent, setConsent] = useSB(true);
  const [retention, setRetention] = useSB("7-years");

  const tabs = [
    { id:"overview", label:"Overview" },
    { id:"mis",      label:"MIS Sync" },
    { id:"staff",    label:"Staff Roles" },
    { id:"ai",       label:"AI & Privacy" },
    { id:"branding", label:"Branding" }
  ];

  const Toggle = ({ on, onToggle, label, sub }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: "1px solid var(--border)" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 2 }}>{sub}</div>}
      </div>
      <button onClick={onToggle} style={{ width: 44, height: 24, borderRadius: 12, background: on ? "var(--primary)" : "#CBD5E1", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", left: on ? 23 : 3, boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}/>
      </button>
    </div>
  );

  return (
    <div style={{ padding: "22px 26px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>School Settings</h1>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "2px solid var(--border)", marginBottom: 24, gap: 0, overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 18px", border: "none", background: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
            color: tab === t.id ? "var(--primary)" : "var(--text-muted)",
            borderBottom: `2px solid ${tab === t.id ? "var(--primary)" : "transparent"}`,
            marginBottom: -2, transition: "all 0.12s"
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 580 }}>
        {tab === "overview" && (
          <div>
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
                <div style={{ width: 54, height: 54, borderRadius: 14, background: "#2B5FA6", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>SJ&amp;P</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>St Jude's &amp; St Paul's</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>CE Primary Academy · London NW3</div>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 2 }}>Active since September 2024</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[{v:"342",l:"Pupils"},{v:"28",l:"Staff"},{v:"47",l:"Classes"}].map(s => (
                  <div key={s.l} style={{ textAlign: "center", padding: "10px 8px", background: "var(--surface-2)", borderRadius: 8 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)" }}>{s.v}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { label:"MIS Sync",    status:"Connected – SIMS",          ok:true },
                { label:"School Cloud",status:"Encrypted · UK data centre", ok:true },
                { label:"AI Features", status: aiOn ? "Active with parental consent" : "Disabled", ok: aiOn },
                { label:"Offline mode",status:"Available on all devices",  ok:true }
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: item.ok ? "#2EAD73" : "#D95A57" }}>
                    {item.ok ? "✓ " : "✗ "}{item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "mis" && (
          <Card>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>MIS Integration</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#E8F6EF", borderRadius: 8, marginBottom: 16, gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#2EAD73" }}>✓ Connected to SIMS</div>
                <div style={{ fontSize: 12, color: "#2EAD73", opacity: 0.85, marginTop: 2 }}>Last synced today at 8:15am · 342 pupils, 28 staff</div>
              </div>
              <Btn small variant="secondary">Sync now</Btn>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.65 }}>
              Pupil data, groups (SEND, EAL, FSM), and class lists are automatically synced each morning. Changes in SIMS appear within 24 hours or after a manual sync.
            </p>
          </Card>
        )}

        {tab === "staff" && (
          <Card>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Staff &amp; Roles</div>
            {[
              { name:"Sarah Mitchell",  role:"Year 4 Teacher · SENCO Lead", level:"Teacher" },
              { name:"James Thompson",  role:"Headteacher",                  level:"Leadership" },
              { name:"Priya Sharma",    role:"Year 3 Teacher",               level:"Teacher" },
              { name:"Tom Bridges",     role:"Teaching Assistant",           level:"TA" },
              { name:"Linda Osei",      role:"SENCO",                        level:"SENCO" }
            ].map((s, i, arr) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
                <Avatar initials={s.name.split(" ").map(n => n[0]).join("")} size={34}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.role}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "var(--surface-2)", color: "var(--text-muted)" }}>{s.level}</span>
              </div>
            ))}
          </Card>
        )}

        {tab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>AI Settings</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Pupil data is never shared with third parties. AI runs within your school cloud.</p>
              <Toggle on={aiOn}     onToggle={() => setAiOn(v => !v)}   label="Enable AI suggestions" sub="Shown to teachers as editable next steps"/>
              <Toggle on={consent}  onToggle={() => setConsent(v => !v)} label="Parental consent collected" sub="Required to use AI features with pupil data"/>
              <Toggle on={true}     onToggle={() => {}}                  label="Show AI transparency notes" sub="Teachers see a badge on all AI-generated content"/>
            </Card>
            <Card>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Data &amp; Privacy</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>All data is stored in your private school cloud on UK servers.</p>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>Data retention period</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {["7-years","3-years","1-year"].map(opt => (
                  <button key={opt} onClick={() => setRetention(opt)} style={{
                    padding: "6px 14px", borderRadius: 20, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                    background: retention === opt ? "var(--primary)" : "var(--surface-2)",
                    color: retention === opt ? "#fff" : "var(--text-muted)",
                    border: `1px solid ${retention === opt ? "transparent" : "var(--border)"}`,
                    transition: "all 0.12s"
                  }}>{opt}</button>
                ))}
              </div>
              <div style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Icon name="shield" size={13} color="var(--text-subtle)" style={{ marginTop: 1 }}/>
                <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55 }}>GDPR compliant · UK GDPR · DPA 2018 · Data never leaves your school cloud</span>
              </div>
            </Card>
          </div>
        )}

        {tab === "branding" && (
          <Card>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>School Branding</div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
              <div style={{ width: 72, height: 72, borderRadius: 16, background: "#2B5FA6", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>SJ&amp;P</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>St Jude's &amp; St Paul's</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>CE Primary Academy</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn small variant="secondary">Upload logo</Btn>
                  <Btn small variant="ghost">Change colour</Btn>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8, lineHeight: 1.55 }}>
              Your school branding appears on the login screen and in printed reports. The Uniti wordmark remains on all screens.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}




// ── Adaptations Screen ─────────────────────────────────────────────────────
function AdaptationsScreen({ generating, setGenerating }) {
  const { adaptations: raw, generatedAdaptations, feedbackConfig } = window.UnitiData;
  const [adaptations,  setAdaptations]  = useSB(raw.map(a => ({ ...a })));
  const [expanded,     setExpanded]     = useSB(null);
  const [filter,       setFilter]       = useSB("all");
  const [notes,        setNotes]        = useSB({});
  const [selectedObj,  setSelectedObj]  = useSB(null);
  const [genPhase,     setGenPhase]     = useSB(generating ? "loading" : "idle");
  const [genCards,     setGenCards]     = useSB([]);

  useEffSB(() => {
    if (!generating) return;
    setGenPhase("loading");
    const t = setTimeout(() => {
      setGenPhase("done");
      setGenCards(generatedAdaptations.map(a => ({ ...a })));
      if (setGenerating) setGenerating(false);
    }, 2600);
    return () => clearTimeout(t);
  }, [generating]);

  const OUTCOMES = [
    { key:"worked",    emoji:"✓",  label:"Worked",       color:"#2EAD73", bg:"#E8F6EF" },
    { key:"nearly",    emoji:"≈",  label:"Nearly",       color:"#E8953A", bg:"#FEF0DC" },
    { key:"didnt",     emoji:"✗",  label:"Didn't work",  color:"#D95A57", bg:"#FDECEB" },
    { key:"surprised", emoji:"⭐", label:"Surprised me", color:"#8B6BD6", bg:"#F0ECFD" },
    { key:"revisit",   emoji:"↩",  label:"Try again",    color:"#3A8FCC", bg:"#E3F2FB" }
  ];

  const TYPE_COLOR = {
    "Vocabulary support": { color:"#3A8FCC", bg:"#E3F2FB" },
    "Concrete resources": { color:"#2EAD73", bg:"#E8F6EF" },
    "Worked example":     { color:"#E8953A", bg:"#FEF0DC" },
    "Stretch challenge":  { color:"#8B6BD6", bg:"#F0ECFD" },
    "Peer grouping":      { color:"#3A8FCC", bg:"#E3F2FB" },
    "Early check-in":     { color:"#D95A57", bg:"#FDECEB" },
    "Retrieval starter":  { color:"#2EAD73", bg:"#E8F6EF" },
    "Live modelling":     { color:"#E8953A", bg:"#FEF0DC" },
    "Exit check":         { color:"#8B6BD6", bg:"#F0ECFD" }
  };
  const tc = label => TYPE_COLOR[label] || { color:"var(--primary)", bg:"var(--primary-light)" };

  const setOutcome    = (id, o) => setAdaptations(prev => prev.map(a => a.id===id ? { ...a, status:"done", outcome:o } : a));
  const setGenOutcome = (id, o) => setGenCards(prev => prev.map(a => a.id===id ? { ...a, status:"done", outcome:o } : a));
  const skip    = id => setAdaptations(prev => prev.map(a => a.id===id ? { ...a, status:"skipped" } : a));
  const restore = id => setAdaptations(prev => prev.map(a => a.id===id ? { ...a, status:"planned", outcome:null } : a));
  const toggle  = id => setExpanded(e => e===id ? null : id);

  const allCards = [...genCards, ...adaptations];
  const filtered = filter==="all" ? allCards : allCards.filter(a => a.status===filter);

  // Group by objective — preserve insertion order
  const byObj = {};
  filtered.forEach(a => {
    if (!byObj[a.objective]) byObj[a.objective] = { items:[], lesson:a.lesson };
    byObj[a.objective].items.push(a);
  });

  const objKeys = Object.keys(byObj);

  // Auto-select first obj on mount / when filter changes
  useEffSB(() => {
    if (objKeys.length > 0 && (!selectedObj || !byObj[selectedObj])) {
      setSelectedObj(objKeys[0]);
    }
  }, [filter, genPhase]);

  const selItems = selectedObj && byObj[selectedObj] ? byObj[selectedObj].items : [];
  const pupilMap = {};
  (window.UnitiData.pupils||[]).forEach(p => { pupilMap[p.id]=p; });

  const planned = allCards.filter(a=>a.status==="planned").length;
  const done    = allCards.filter(a=>a.status==="done").length;

  // ── Single adaptation card ──────────────────────────────────────────────
  const AdaptCard = ({ adap, onOutcome, onSkip, onRestore }) => {
    const isOpen    = expanded === adap.id;
    const isDone    = adap.status === "done";
    const isSkipped = adap.status === "skipped";
    const c         = tc(adap.typeLabel);
    const selOutc   = OUTCOMES.find(o => o.key === adap.outcome);
    const noteVal   = notes[adap.id] ?? (adap.outcomeNote || "");

    return (
      <div style={{
        borderRadius:10,
        border:`1px solid ${isOpen ? c.color+"45" : "var(--border)"}`,
        background: isSkipped ? "var(--surface-2)" : "var(--surface)",
        opacity: isSkipped ? 0.5 : 1,
        overflow:"hidden", transition:"border-color 0.15s",
        animation: adap.id.startsWith("gen") ? "fadeSlideIn 0.4s ease" : "none"
      }}>
        <style>{`@keyframes fadeSlideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>

        {/* Header row */}
        <button onClick={() => !isSkipped && toggle(adap.id)} style={{
          width:"100%", padding:"12px 14px",
          display:"flex", alignItems:"flex-start", gap:10,
          background:"none", border:"none", cursor: isSkipped ? "default" : "pointer",
          fontFamily:"inherit", textAlign:"left"
        }}>
          <span style={{ fontSize:18, lineHeight:1.2, flexShrink:0, marginTop:1 }}>{adap.emoji}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color: isSkipped ? "var(--text-muted)" : "var(--text)", lineHeight:1.45, marginBottom:3 }}>
              {adap.try}
            </div>
            <div style={{ fontSize:11, color:"var(--text-subtle)" }}>For {adap.forLabel}</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
            {isDone && selOutc && (
              <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20, background:selOutc.bg, color:selOutc.color, whiteSpace:"nowrap" }}>
                {selOutc.emoji} {selOutc.label}
              </span>
            )}
            {!isDone && !isSkipped && (
              <span style={{ fontSize:10, fontWeight:600, padding:"2px 7px", borderRadius:20, background:c.bg, color:c.color }}>{adap.typeLabel}</span>
            )}
            {!isSkipped && (
              <Icon name={isOpen ? "chevron_d" : "chevron_r"} size={13} color="var(--text-subtle)"/>
            )}
          </div>
        </button>

        {/* Expanded */}
        {isOpen && (
          <div style={{ borderTop:`1px solid ${c.color}20`, padding:"12px 14px 14px" }}>
            {/* Pupils */}
            {adap.forPupils?.length > 0 && (
              <div style={{ display:"flex", gap:7, marginBottom:12, flexWrap:"wrap" }}>
                {adap.forPupils.slice(0,6).map(pid => {
                  const p = pupilMap[pid];
                  if (!p) return null;
                  return (
                    <div key={pid} style={{ textAlign:"center" }}>
                      <Avatar initials={p.initials} size={28}/>
                      <div style={{ fontSize:9, color:"var(--text-subtle)", marginTop:2 }}>{p.name.split(" ")[0]}</div>
                    </div>
                  );
                })}
                {adap.forPupils.length > 6 && <span style={{ fontSize:11, color:"var(--text-subtle)", alignSelf:"center" }}>+{adap.forPupils.length-6}</span>}
              </div>
            )}

            {/* Evidence */}
            <p style={{ fontSize:12, color:"var(--text-muted)", fontStyle:"italic", lineHeight:1.55, marginBottom:14 }}>{adap.evidence}</p>

            {/* Outcome buttons */}
            <div style={{ fontSize:10, fontWeight:700, color:"var(--text-subtle)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>
              {isDone ? "Outcome" : "After the lesson"}
            </div>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:12 }}>
              {OUTCOMES.map(o => {
                const active = adap.outcome === o.key;
                return (
                  <button key={o.key} onClick={() => onOutcome(adap.id, o.key)} style={{
                    padding:"6px 11px", borderRadius:20, cursor:"pointer",
                    border:`1.5px solid ${active ? o.color : "var(--border)"}`,
                    background: active ? o.bg : "transparent",
                    fontFamily:"inherit", fontSize:11, fontWeight:600,
                    color: active ? o.color : "var(--text-muted)", transition:"all 0.1s"
                  }}>{o.emoji} {o.label}</button>
                );
              })}
            </div>

            <textarea value={noteVal}
              onChange={e => setNotes(prev => ({...prev, [adap.id]: e.target.value}))}
              placeholder="Add a note…" rows={2}
              style={{ width:"100%", padding:"7px 10px", border:"1.5px solid var(--border)", borderRadius:7,
                fontSize:12, fontFamily:"inherit", resize:"none", background:"var(--surface-2)",
                color:"var(--text)", outline:"none", marginBottom:9 }}
              onFocus={e => e.target.style.borderColor=c.color}
              onBlur={e => e.target.style.borderColor="var(--border)"}/>

            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <div>
                {!isDone && !isSkipped && onSkip && (
                  <button onClick={() => onSkip(adap.id)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:11,color:"var(--text-subtle)",fontFamily:"inherit" }}>Skip</button>
                )}
                {(isDone || isSkipped) && onRestore && (
                  <button onClick={() => onRestore(adap.id)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:11,color:"var(--primary)",fontFamily:"inherit",fontWeight:600 }}>Restore</button>
                )}
              </div>
              <button onClick={() => toggle(adap.id)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:11,color:"var(--text-subtle)",fontFamily:"inherit" }}>Close</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>

      {/* ── Left rail ── */}
      <div style={{
        width:232, flexShrink:0,
        borderRight:"1px solid var(--border)",
        display:"flex", flexDirection:"column",
        overflow:"hidden", background:"var(--surface)"
      }}>
        {/* Header */}
        <div style={{ padding:"16px 16px 12px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"var(--text)", marginBottom:10 }}>Teaching moves</div>
          <div style={{ display:"flex", gap:5 }}>
            {[
              {key:"all",     label:"All",     val: allCards.length },
              {key:"planned", label:"Planned", val: planned },
              {key:"done",    label:"Done",    val: done }
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                padding:"4px 9px", borderRadius:20, border:"none", cursor:"pointer",
                fontFamily:"inherit", fontSize:11, fontWeight:600,
                background: filter===f.key ? "var(--primary)" : "var(--surface-2)",
                color: filter===f.key ? "#fff" : "var(--text-muted)", transition:"all 0.12s"
              }}>{f.label} {f.val}</button>
            ))}
          </div>
        </div>

        {/* Generating indicator */}
        {genPhase === "loading" && (
          <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:8, background:"var(--primary-light)", borderBottom:"1px solid var(--primary)20" }}>
            <div style={{ width:14, height:14, borderRadius:"50%", border:"2px solid var(--primary)", borderTopColor:"transparent", animation:"spin 0.8s linear infinite", flexShrink:0 }}/>
            <span style={{ fontSize:11, fontWeight:600, color:"var(--primary)" }}>Generating…</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {genPhase === "done" && (
          <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:8, background:"#E8F6EF", borderBottom:"1px solid #2EAD7325" }}>
            <span style={{ fontSize:14 }}>✅</span>
            <span style={{ fontSize:11, fontWeight:600, color:"#2EAD73" }}>Moves ready</span>
          </div>
        )}

        {/* Objective list */}
        <div style={{ flex:1, overflow:"auto" }}>
          {objKeys.length === 0 ? (
            <div style={{ padding:"24px 16px", textAlign:"center", color:"var(--text-subtle)", fontSize:12 }}>
              No adaptations yet
            </div>
          ) : (
            objKeys.map(obj => {
              const { items, lesson } = byObj[obj];
              const isActive = selectedObj === obj;
              const planCount = items.filter(a=>a.status==="planned").length;
              const doneCount = items.filter(a=>a.status==="done").length;
              return (
                <button key={obj} onClick={() => setSelectedObj(obj)} style={{
                  width:"100%", padding:"11px 14px", textAlign:"left",
                  background: isActive ? "var(--primary-light)" : "transparent",
                  border:"none", cursor:"pointer", fontFamily:"inherit",
                  borderBottom:"1px solid var(--border)", transition:"background 0.12s"
                }}>
                  <div style={{ fontSize:12, fontWeight:600, color: isActive ? "var(--primary)" : "var(--text)", marginBottom:4, lineHeight:1.35 }}>{obj}</div>
                  <div style={{ fontSize:10, color:"var(--text-subtle)", marginBottom:6 }}>{lesson}</div>
                  <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                    {planCount > 0 && (
                      <span style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:20, background:"#E3F2FB", color:"#3A8FCC" }}>{planCount} planned</span>
                    )}
                    {doneCount > 0 && (
                      <span style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:20, background:"#E8F6EF", color:"#2EAD73" }}>{doneCount} done</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right detail panel ── */}
      <div style={{ flex:1, overflow:"auto", minWidth:0 }}>
        {!selectedObj || !byObj[selectedObj] ? (
          <div style={{ padding:"48px 32px", textAlign:"center", color:"var(--text-subtle)" }}>
            <Icon name="zap" size={32} color="var(--border)"/>
            <p style={{ marginTop:12, fontSize:14 }}>Select an objective to see teaching moves</p>
          </div>
        ) : (
          <div style={{ padding:"20px 24px" }}>
            {/* Objective header */}
            <div style={{ marginBottom:18 }}>
              <h2 style={{ fontSize:16, fontWeight:700, color:"var(--text)", marginBottom:3 }}>{selectedObj}</h2>
              <div style={{ fontSize:12, color:"var(--text-muted)" }}>{byObj[selectedObj].lesson}</div>
            </div>

            {/* Skeleton while generating */}
            {genPhase === "loading" && selectedObj === "Equivalent Fractions" && (
              <div style={{ display:"flex", flexDirection:"column", gap:7, marginBottom:14 }}>
                {[1,2,3].map(i => (
                  <div key={i} style={{ borderRadius:10, border:"1px solid var(--border)", padding:"12px 14px", background:"var(--surface)" }}>
                    <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                      <div style={{ width:18, height:18, borderRadius:4, background:"var(--border)", animation:"shimmer 1.2s ease infinite", flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ height:12, background:"var(--border)", borderRadius:4, marginBottom:7, width:"68%", animation:"shimmer 1.2s ease infinite" }}/>
                        <div style={{ height:10, background:"var(--border)", borderRadius:4, width:"38%", animation:"shimmer 1.2s ease infinite" }}/>
                      </div>
                    </div>
                    <style>{`@keyframes shimmer{0%,100%{opacity:0.4}50%{opacity:0.9}}`}</style>
                  </div>
                ))}
              </div>
            )}

            {/* Cards */}
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {selItems.map(adap => {
                const isGen = adap.id.startsWith("gen");
                return (
                  <AdaptCard key={adap.id} adap={adap}
                    onOutcome={isGen ? setGenOutcome : setOutcome}
                    onSkip={isGen ? null : skip}
                    onRestore={isGen ? null : restore}/>
                );
              })}
            </div>

            {selItems.length === 0 && genPhase !== "loading" && (
              <div style={{ padding:"32px 0", textAlign:"center", color:"var(--text-subtle)", fontSize:12 }}>
                No moves match the current filter
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { AIScreen, TimelineScreen, LeadershipScreen, AdminScreen, AdaptationsScreen });
