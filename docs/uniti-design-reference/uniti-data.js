window.UnitiData = {
  school: {
    name: "St Jude's & St Paul's",
    subtitle: "CE Primary Academy · London NW3",
    initials: "SJ&P",
    brandColor: "#2B5FA6",
    term: "Summer Term 2026",
    week: "Week 8"
  },
  teacher: { name: "Sarah Mitchell", first: "Sarah", role: "Year 4 Teacher & SENCO Lead", initials: "SM" },
  lessons: [
    {
      id: "l1", subject: "Maths", topic: "Fractions – Equivalent Fractions",
      yearGroup: "Year 4", cls: "4M", room: "12",
      time: "9:00 – 9:45am", pupils: 28, assessed: 22, status: "in-progress",
      primaryColor: "#2EAD73", lightColor: "#E8F6EF",
      objective: "Recognise and show equivalent fractions using diagrams"
    },
    {
      id: "l2", subject: "English", topic: "Persuasive Writing – Climate Change",
      yearGroup: "Year 4", cls: "4M", room: "12",
      time: "10:30 – 11:15am", pupils: 28, assessed: 0, status: "upcoming",
      primaryColor: "#3A8FCC", lightColor: "#E3F2FB",
      objective: "Write to persuade using rhetorical questions and emotive language"
    },
    {
      id: "l3", subject: "Science", topic: "Forces – Push, Pull & Gravity",
      yearGroup: "Year 3", cls: "3H", room: "8",
      time: "1:00 – 1:45pm", pupils: 26, assessed: 0, status: "upcoming",
      primaryColor: "#8B6BD6", lightColor: "#F0ECFD",
      objective: "Identify and describe how forces change shape and movement"
    }
  ],
  pupils: [
    { id: "p1",  name: "Aisha J.",   initials: "AJ", groups: ["SEND"] },
    { id: "p2",  name: "Ben C.",     initials: "BC", groups: [] },
    { id: "p3",  name: "Chloe P.",   initials: "CP", groups: [] },
    { id: "p4",  name: "Darius M.",  initials: "DM", groups: ["EAL"] },
    { id: "p5",  name: "Ella T.",    initials: "ET", groups: [] },
    { id: "p6",  name: "Felix N.",   initials: "FN", groups: [] },
    { id: "p7",  name: "Grace W.",   initials: "GW", groups: [] },
    { id: "p8",  name: "Harry S.",   initials: "HS", groups: [] },
    { id: "p9",  name: "Isla B.",    initials: "IB", groups: ["SEND"] },
    { id: "p10", name: "Jax R.",     initials: "JR", groups: [] },
    { id: "p11", name: "Kira L.",    initials: "KL", groups: [] },
    { id: "p12", name: "Leo D.",     initials: "LD", groups: ["FSM"] },
    { id: "p13", name: "Maya K.",    initials: "MK", groups: [] },
    { id: "p14", name: "Noah F.",    initials: "NF", groups: [] },
    { id: "p15", name: "Olive H.",   initials: "OH", groups: [] },
    { id: "p16", name: "Phoebe A.",  initials: "PA", groups: [] },
    { id: "p17", name: "Quinn O.",   initials: "QO", groups: ["FSM"] },
    { id: "p18", name: "Ravi S.",    initials: "RS", groups: ["EAL"] },
    { id: "p19", name: "Sophie K.",  initials: "SK", groups: [] },
    { id: "p20", name: "Theo W.",    initials: "TW", groups: [] },
    { id: "p21", name: "Uma C.",     initials: "UC", groups: [] },
    { id: "p22", name: "Viktor B.",  initials: "VB", groups: ["EAL"] },
    { id: "p23", name: "Willow E.",  initials: "WE", groups: [] },
    { id: "p24", name: "Xander P.",  initials: "XP", groups: [] },
    { id: "p25", name: "Yasmin I.",  initials: "YI", groups: ["SEND"] },
    { id: "p26", name: "Zara M.",    initials: "ZM", groups: [] },
    { id: "p27", name: "Alfie T.",   initials: "AT", groups: [] },
    { id: "p28", name: "Beatrice L.",initials: "BL", groups: [] }
  ],
  defaultFeedback: {
    p1:"support_worked", p2:"got_it",      p3:"got_it",
    p4:"nearly_there",   p5:"got_it",      p6:"nearly_there",
    p7:"got_it",         p8:"needs_revisit",p9:"support_not_worked",
    p10:"got_it",        p11:"got_it",     p12:"nearly_there",
    p13:"got_it",        p14:"got_it",     p15:"nearly_there",
    p16:"got_it",        p17:"support_worked", p18:"nearly_there",
    p19:"got_it",        p20:"needs_revisit", p21:"absent",
    p22:"nearly_there",  p23:"got_it",     p24:"got_it",
    p25:"needs_revisit", p26:"got_it",     p27:"nearly_there",
    p28:"got_it"
  },
  defaultNotes: {
    p8: "Struggled with cross-multiplication. Wants to use fingers.",
    p9: "Tried visual method but got confused. Follow up 1:1.",
    p20: "Lost focus after 15 mins — check table arrangement."
  },
  feedbackConfig: {
    got_it:            { label: "Got it",           color: "#2EAD73", bg: "#E8F6EF", emoji: "✓" },
    nearly_there:      { label: "Nearly there",     color: "#E8953A", bg: "#FEF0DC", emoji: "◑" },
    needs_revisit:     { label: "Needs revisit",    color: "#D95A57", bg: "#FDECEB", emoji: "↩" },
    absent:            { label: "Absent",           color: "#8B93A1", bg: "#F1F3F6", emoji: "–" },
    support_worked:    { label: "Support worked",   color: "#3A8FCC", bg: "#E3F2FB", emoji: "+" },
    support_not_worked:{ label: "Didn't work",      color: "#8B6BD6", bg: "#F0ECFD", emoji: "!" }
  },
  aiSuggestions: [
    { id:"a1", type:"activity",  typeLabel:"Next activity",  title:"Visual fractions wall",
      detail:"7 pupils need consolidation. A paired fractions wall with manipulatives would work well tomorrow.",
      affectedPupils:7, confidence:88, status:"pending" },
    { id:"a2", type:"grouping",  typeLabel:"Peer grouping",  title:"Near-peer pairs for Harry & Theo",
      detail:"Pair Harry S. with Grace W. and Theo W. with Ella T. — both near-peers who understood today.",
      affectedPupils:2, confidence:91, status:"pending" },
    { id:"a3", type:"resource",  typeLabel:"Resource",       title:"Scaffold worksheet for 3 pupils",
      detail:"Isla B., Yasmin I., and Aisha J. may benefit from a stepped sheet focusing on unit fractions first.",
      affectedPupils:3, confidence:84, status:"pending" },
    { id:"a4", type:"flag",      typeLabel:"SENCO flag",     title:"Review Isla B.'s support plan",
      detail:"Isla's support strategy has not worked in 2 of the last 3 lessons. Consider reviewing with SENCO.",
      affectedPupils:1, confidence:76, status:"pending" }
  ],
  timelineWeeks: [
    { label:"5 May",  status:"nearly_there", note:"Needs more on denominators" },
    { label:"12 May", status:"nearly_there", note:"" },
    { label:"19 May", status:"got_it",       note:"Breakthrough with visual method" },
    { label:"26 May", status:"absent",       note:"" },
    { label:"2 Jun",  status:"got_it",       note:"Confident" },
    { label:"7 Jun",  status:"got_it",       note:"Solid — today" }
  ],
  timelineObjectives: [
    { obj:"Add and subtract fractions",        status:"got_it",        lessons:4 },
    { obj:"Equivalent fractions",              status:"nearly_there",  lessons:3 },
    { obj:"Multiply fractions by integers",    status:"needs_revisit", lessons:2 },
    { obj:"Decimal fractions",                 status:"absent",        lessons:0 }
  ],
  leadershipSubjects: [
    { name:"Maths",   pct:74, prev:68, trend:"up",   classes:6 },
    { name:"English", pct:68, prev:71, trend:"down", classes:6 },
    { name:"Science", pct:81, prev:77, trend:"up",   classes:4 },
    { name:"History", pct:72, prev:70, trend:"up",   classes:3 },
    { name:"PSHE",    pct:85, prev:82, trend:"up",   classes:6 }
  ],
  leadershipGroups: [
    { label:"All pupils",    n:342, on:74, support:18, exc:8 },
    { label:"SEND",          n:28,  on:61, support:31, exc:8 },
    { label:"EAL",           n:47,  on:69, support:24, exc:7 },
    { label:"Pupil Premium", n:38,  on:58, support:34, exc:8 },
    { label:"Looked After",  n:4,   on:50, support:50, exc:0 }
  ],
  leadershipAdapt: { suggested:124, actioned:98, impact:34 },
  overviewData: {
    composite: 76,
    subjects: [
      { name:"Maths",   pct:68, trend:"up",    color:"#2EAD73",
        weeks:["nearly_there","nearly_there","got_it","absent","got_it","got_it"] },
      { name:"English", pct:74, trend:"stable", color:"#3A8FCC",
        weeks:["got_it","got_it","nearly_there","got_it","got_it","nearly_there"] },
      { name:"Science", pct:82, trend:"up",    color:"#8B6BD6",
        weeks:["got_it","got_it","got_it","got_it","got_it","got_it"] },
      { name:"History", pct:71, trend:"stable", color:"#E8953A",
        weeks:["nearly_there","got_it","got_it","nearly_there","got_it","got_it"] }
    ]
  },
  pupilProfiles: {
    p2: {
      barriers: [
        { label:"Vocabulary gaps in new topics",        freq:4, subjects:["Maths","Science"], status:"established" },
        { label:"Multi-step reasoning under time pressure", freq:3, subjects:["Maths"],        status:"established" },
        { label:"Sustaining focus after 15 minutes",    freq:2, subjects:["Maths","English"],  status:"emerging"   }
      ],
      whatWorks: [
        { strategy:"Pre-teach key vocabulary before the task", successRate:80, count:5, subjects:["Maths","Science"] },
        { strategy:"Worked example, then gradually fade scaffolds", successRate:75, count:4, subjects:["Maths"] },
        { strategy:"Paired oral discussion before writing", successRate:65, count:3, subjects:["English"] }
      ],
      strengths:["Visual and practical tasks","Oral explanations","Collaborative work"],
      trajectory:"improving",
      standingAdaptations:[
        { strategy:"Pre-teach vocabulary", emoji:"📖", subject:"All subjects", confidence:80, basedOn:"Worked in 4 of last 5 lessons" },
        { strategy:"Worked example first, then fade", emoji:"📋", subject:"Maths", confidence:75, basedOn:"3 consecutive positive outcomes" }
      ],
      lastUpdated:"7 Jun 2026", aiConfidence:82
    },
    p1: {
      barriers:[
        { label:"Fraction language not secure",         freq:3, subjects:["Maths"],   status:"established" },
        { label:"Working-memory overload on long tasks", freq:4, subjects:["Maths","English","Science"], status:"established" }
      ],
      whatWorks:[
        { strategy:"Reduce task to one step at a time", successRate:85, count:6, subjects:["Maths","English"] },
        { strategy:"Pre-teach vocabulary with picture cards", successRate:78, count:4, subjects:["Maths"] }
      ],
      strengths:["Art","Music","Oral storytelling"],
      trajectory:"plateaued",
      standingAdaptations:[
        { strategy:"One step at a time — chunked tasks", emoji:"📋", subject:"All", confidence:85, basedOn:"6 consecutive lessons" },
        { strategy:"Vocab picture cards before any written work", emoji:"📖", subject:"Maths", confidence:78, basedOn:"SEND plan + outcomes" }
      ],
      lastUpdated:"5 Jun 2026", aiConfidence:74
    }
  },
  preLessonAdaptations:[
    { lesson:"Year 4 Maths",    lessonTime:"9:00am",  lessonId:"l1", emoji:"📖", forLabel:"Amira J., Leo D., Ravi S.", strategy:"Pre-teach: numerator, denominator, equivalent", basedOn:"Worked last time", confidence:81 },
    { lesson:"Year 4 Maths",    lessonTime:"9:00am",  lessonId:"l1", emoji:"🧱", forLabel:"Table 2 — 5 pupils",        strategy:"Use fraction wall before any written work",   basedOn:"Worked last time", confidence:84 },
    { lesson:"Year 4 Maths",    lessonTime:"9:00am",  lessonId:"l1", emoji:"📋", forLabel:"Harry S.",                  strategy:"Give first 2 problems fully worked",          basedOn:"Worked last time", confidence:88 },
    { lesson:"Year 4 Maths",    lessonTime:"9:00am",  lessonId:"l1", emoji:"⭐", forLabel:"Grace W., Ella T., Chloe P.", strategy:"Stretch: explain the misconception",        basedOn:"Worked last time", confidence:91 },
    { lesson:"Year 4 English",  lessonTime:"10:30am", lessonId:"l2", emoji:"👥", forLabel:"Darius M., Viktor B. + 2",  strategy:"Pair with confident writers during drafting", basedOn:"EAL profile",      confidence:79 },
    { lesson:"Year 4 English",  lessonTime:"10:30am", lessonId:"l2", emoji:"📖", forLabel:"EAL pupils — 3",            strategy:"Word bank with sentence starters ready",      basedOn:"Worked last time", confidence:76 },
    { lesson:"Year 3 Science",  lessonTime:"1:00pm",  lessonId:"l3", emoji:"🔍", forLabel:"Isla B., Yasmin I., Noah F.", strategy:"8-min check-in — ask before class moves on", basedOn:"Needs revisit × 2", confidence:72 },
    { lesson:"Year 3 Science",  lessonTime:"1:00pm",  lessonId:"l3", emoji:"🧱", forLabel:"Whole class",               strategy:"Demo objects before independent recording",   basedOn:"New objective",    confidence:68 }
  ],
  safeguardingKeywords:["hurt","scared","hit","afraid","frightened","harm","touched","secret","worried about home","unsafe"],
    adaptations: [
    {
      id:"ad1", objective:"Equivalent Fractions", lesson:"Year 4 Maths · Today",
      typeLabel:"Vocabulary support", emoji:"📖",
      forLabel:"Amira J., Leo D., Ravi S. + 1", forPupils:["p1","p12","p18","p22"],
      need:"Vocabulary gap — fraction language not secure",
      try:"Pre-teach 4 words before independent work: numerator, denominator, equivalent, simplify. Use picture cards at the front.",
      why:"Last lesson feedback + EAL profile",
      evidence:"3 pupils coded 'nearly there'; all made vocabulary errors in verbal responses",
      status:"planned", outcome:null, outcomeNote:"", plan:""
    },
    {
      id:"ad2", objective:"Equivalent Fractions", lesson:"Year 4 Maths · Today",
      typeLabel:"Concrete resources", emoji:"🧱",
      forLabel:"Table 2 — Harry S., Isla B., Theo W. + 2", forPupils:["p8","p9","p12","p20","p25"],
      need:"Abstract → concrete bridge needed",
      try:"Use fraction wall manipulatives before any written work. Let pupils build 1/2 = 2/4 physically before recording it.",
      why:"Last lesson — 5 pupils needed revisit",
      evidence:"Harry S., Isla B., Theo W. and 2 others all scored 'Needs revisit' on the same objective",
      status:"planned", outcome:null, outcomeNote:"", plan:""
    },
    {
      id:"ad3", objective:"Equivalent Fractions", lesson:"Year 4 Maths · Today",
      typeLabel:"Worked example", emoji:"📋",
      forLabel:"Harry S.", forPupils:["p8"],
      need:"Reduced cognitive load — too many steps at once",
      try:"Give Harry the first 2 problems fully worked. Gradually remove scaffolds. Let him watch then try — do not ask him to copy.",
      why:"SEND plan + 3 consecutive 'needs revisit'",
      evidence:"Harry has scored 'Needs revisit' in Maths for 3 of the last 4 lessons. Scaffolded examples worked well in literacy.",
      status:"planned", outcome:null, outcomeNote:"", plan:""
    },
    {
      id:"ad4", objective:"Equivalent Fractions", lesson:"Year 4 Maths · Today",
      typeLabel:"Stretch challenge", emoji:"⭐",
      forLabel:"Grace W., Ella T., Chloe P.", forPupils:["p7","p5","p3"],
      need:"Ready to deepen — beyond the objective",
      try:"Ask: 'Can 1/3 and 2/5 ever be equivalent? Why not?' Then write a hint card for a classmate who is stuck.",
      why:"All 3 scored 'Got it' in the last 4 consecutive lessons",
      evidence:"These pupils consistently master objectives in the first lesson — stretch keeps them engaged and builds near-peer capacity.",
      status:"planned", outcome:null, outcomeNote:"", plan:""
    },
    {
      id:"ad5", objective:"Add & Subtract Fractions", lesson:"Year 4 Maths · 2 Jun",
      typeLabel:"Concrete resources", emoji:"🧱",
      forLabel:"5 pupils — Table 2", forPupils:["p4","p6","p12","p18","p27"],
      need:"Abstract → concrete bridge needed",
      try:"Fraction number line with laminated strips — place fractions before adding.",
      why:"Previous lesson data",
      evidence:"5 pupils struggled placing fractions on a number line before adding",
      status:"done", outcome:"worked",
      outcomeNote:"All 5 moved up at least one level in the following lesson. Number lines stayed on the table for the whole session.",
      plan:"Ran as a 10-min starter using laminated number lines."
    },
    {
      id:"ad6", objective:"Persuasive Writing", lesson:"Year 4 English · 3 Jun",
      typeLabel:"Peer grouping", emoji:"👥",
      forLabel:"Darius M., Viktor B. + 2", forPupils:["p4","p22","p12","p17"],
      need:"Modelled language — EAL pupils need oral rehearsal first",
      try:"Pair with confident writers during drafting only. Keep planning stage independent so EAL pupils think first in their own language.",
      why:"EAL profile + last lesson gaps",
      evidence:"4 pupils had strong ideas but thin persuasive language in last lesson's drafts",
      status:"done", outcome:"nearly",
      outcomeNote:"Writing improved. Will try oral rehearsal before any written drafting next time.",
      plan:"Paired during drafting phase only."
    },
    {
      id:"ad7", objective:"Forces — Push & Pull", lesson:"Year 3 Science · 4 Jun",
      typeLabel:"Early check-in", emoji:"🔍",
      forLabel:"Isla B., Yasmin I., Noah F.", forPupils:["p9","p25","p14"],
      need:"Catch misconceptions early before they embed",
      try:"At the 8-minute mark, check in before the class moves on. Ask: 'What is the difference between a push and a pull?' If unsure, use the demo objects.",
      why:"SEND targets + last lesson 'needs revisit'",
      evidence:"All 3 struggled to distinguish types of forces in the previous lesson",
      status:"skipped", outcome:null, outcomeNote:"", plan:""
    }
  ],
  generatedAdaptations: [
    {
      id:"gen1", objective:"Equivalent Fractions", lesson:"Year 4 Maths · Today",
      typeLabel:"Retrieval starter", emoji:"🔁",
      forLabel:"Whole class", forPupils:["p1","p2","p3","p5","p7","p10"],
      try:"Start with 3 quick retrieval questions on last term's fractions before introducing equivalence — gives everyone a foothold.",
      why:"From lesson plan", evidence:"Lesson plan opens cold on a new objective. A short retrieval reduces cognitive load before new content.",
      status:"planned", outcome:null, outcomeNote:"", plan:""
    },
    {
      id:"gen2", objective:"Equivalent Fractions", lesson:"Year 4 Maths · Today",
      typeLabel:"Live modelling", emoji:"🖊️",
      forLabel:"Table 3 — 5 pupils", forPupils:["p4","p6","p8","p20","p25"],
      try:"Model two worked examples on the visualiser before releasing Table 3 to work independently. Narrate your thinking aloud.",
      why:"From lesson plan + last lesson", evidence:"These 5 pupils needed revisit on similar fractions content last lesson.",
      status:"planned", outcome:null, outcomeNote:"", plan:""
    },
    {
      id:"gen3", objective:"Equivalent Fractions", lesson:"Year 4 Maths · Today",
      typeLabel:"Exit check", emoji:"✅",
      forLabel:"Whole class", forPupils:["p1","p2","p3","p5","p7","p10","p13","p14"],
      try:"Two-minute exit ticket at the end: one fraction problem. Collect as pupils leave — scan quickly, no marking needed now.",
      why:"From lesson plan", evidence:"New objective for this class. A quick check before tomorrow prevents gaps compounding.",
      status:"planned", outcome:null, outcomeNote:"", plan:""
    }
  ]
};
