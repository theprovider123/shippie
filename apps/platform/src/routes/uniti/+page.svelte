<script lang="ts">
  import type { PageData } from './$types';
  import type { ActionData } from './$types';
  import { AppShell, Btn, ProgressRing, Icon } from '$lib/uniti';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const slug = $derived(data.instance?.slug ?? '');
  const lessons = $derived((data.today?.lessons ?? []).filter((l) => l.status !== 'done'));
  const subjects = $derived(data.today?.subjects ?? []);
  const classes = $derived(data.today?.classes ?? []);
  const cards = $derived(data.today?.adaptationCards ?? []);
  const counts = $derived(data.today?.feedbackCounts ?? {});
  let addOpen = $state(false);

  const SUBJECT_ICON: Record<string, string> = {
    maths: '÷',
    english: '✎',
    'english.reading': '✎',
    'english.writing': '✎',
    'english.spag': '✎',
    science: '⚗',
  };
  const SUBJECT_CLR: Record<string, { primary: string; light: string }> = {
    maths: { primary: '#2EAD73', light: '#E8F6EF' },
    english: { primary: '#3A8FCC', light: '#E3F2FB' },
    'english.reading': { primary: '#3A8FCC', light: '#E3F2FB' },
    'english.writing': { primary: '#3A8FCC', light: '#E3F2FB' },
    'english.spag': { primary: '#3A8FCC', light: '#E3F2FB' },
    science: { primary: '#8B6BD6', light: '#F0ECFD' },
    history: { primary: '#E8953A', light: '#FEF0DC' },
    pshe: { primary: '#D95A57', light: '#FDECEB' },
  };
  function clr(subjectId: string) {
    return SUBJECT_CLR[subjectId] ?? SUBJECT_CLR.maths;
  }
  function lessonPct(lessonId: string): number {
    const c = counts[lessonId];
    if (!c) return 0;
    return Math.round(((c.__assessed ?? 0) / (c.__total ?? 28)) * 100);
  }

  // Group adaptation cards by lesson for the right rail.
  const cardGroups = $derived(
    lessons
      .map((l) => ({
        lesson: l,
        items: cards.filter((c) => c.lessonId === l.id),
      }))
      .filter((g) => g.items.length > 0),
  );

  const firstName = $derived((data.teacher?.name ?? 'there').split(' ')[0]);
</script>

<svelte:head>
  <title>uniti · Today</title>
</svelte:head>

{#if !data.instance}
  <div class="centered">
    <div class="empty-card">
      <div class="wordmark">uniti</div>
      <h1>No school yet</h1>
      <p>Ask your administrator to provision your school's private cloud.</p>
    </div>
  </div>
{:else if !data.canTeach}
  <!-- Office manager who isn't a teacher: route them into setup. -->
  <div class="centered">
    <div class="empty-card">
      <div class="wordmark">uniti</div>
      <h1>{data.instance.displayName}</h1>
      <p>Private school cloud · UK data · Works offline</p>
      {#if data.canManage}
        <a class="setup-btn" href="/uniti/setup">Set up your school →</a>
      {/if}
    </div>
  </div>
{:else}
  <AppShell
    active="home"
    {slug}
    title="Today"
    schoolName={data.instance.displayName}
    teacherName={data.teacher?.name ?? 'Teacher'}
    teacherRole="Teacher"
    syncStatus="synced"
  >
    <div class="today">
      <!-- Top bar -->
      <div class="topbar">
        <div class="topbar-row">
          <h1>Good morning, {firstName}</h1>
          <Btn small icon="plus" onclick={() => (addOpen = true)}>Add lesson</Btn>
        </div>
        {#if form?.addLessonError}
          <div class="form-error" role="alert">{form.addLessonError}</div>
        {/if}
        <div class="daybar">
          <div class="day-pill">Today</div>
          <span class="week">Week 8 · Summer Term</span>
        </div>
      </div>

      <!-- Two columns -->
      <div class="cols">
        <!-- Left: lesson timeline -->
        <div class="timeline-col">
          <div class="timeline">
            <div class="rail"></div>
            <div class="lessons">
              {#each lessons as l (l.id)}
                {@const active = l.status === 'in-progress'}
                {@const c = clr(l.subjectId)}
                {@const pct = lessonPct(l.id)}
                <div class="lesson-row">
                  <div class="time">{l.time.split(' – ')[0]}</div>
                  <div
                    class="dot"
                    style="background:{active ? c.primary : 'var(--border)'};
                      border-color:{active ? c.primary : 'var(--border)'};
                      box-shadow:{active ? `0 0 0 4px ${c.primary}22` : 'none'};"
                  ></div>
                  <div class="lesson-card-wrap">
                    <a
                      class="lesson-card"
                      href="/uniti/lessons/{l.id}"
                      style="background:{active ? c.light : 'var(--surface)'};
                        border-color:{active ? c.primary + '40' : 'var(--border)'};"
                    >
                      <div class="lc-head" style="margin-bottom:{active ? '10px' : '0'};">
                        <div
                          class="lc-icon"
                          style="background:{active ? 'white' : c.light};color:{c.primary};"
                        >
                          {SUBJECT_ICON[l.subjectId] ?? '📖'}
                        </div>
                        <div class="lc-meta">
                          <div class="lc-topic">{l.topic}</div>
                          <div class="lc-sub">{l.objective}</div>
                        </div>
                        {#if active}
                          <ProgressRing {pct} size={38} stroke={4} color={c.primary} label={`${pct}%`} />
                        {:else}
                          <span class="upcoming">Upcoming</span>
                        {/if}
                      </div>
                      {#if active}
                        <div class="lc-foot">
                          <div style="color:{c.primary};font-weight:600;font-size:11px;">
                            {counts[l.id]?.__assessed ?? 0}/{counts[l.id]?.__total ?? 28} pupils assessed
                          </div>
                          <Btn small icon="lessons">Open class</Btn>
                        </div>
                      {/if}
                    </a>
                  </div>
                </div>
              {/each}
              {#if lessons.length === 0}
                <div class="no-lessons">No lessons scheduled for today.</div>
              {/if}
            </div>
          </div>
        </div>

        <!-- Right: adaptations -->
        <div class="adapt-col">
          <div class="adapt-head">
            <Icon name="zap" size={13} color="var(--primary)" />
            <span style="font-size:13px;font-weight:700;">Adaptations</span>
            <span style="font-size:11px;color:var(--text-subtle);margin-left:2px;">· today</span>
          </div>
          <div class="adapt-body">
            {#if cardGroups.length === 0}
              <div class="adapt-empty">No adaptations for today</div>
            {:else}
              {#each cardGroups as g (g.lesson.id)}
                <div class="adapt-group">
                  <div class="adapt-group-label">{g.lesson.time.split(' – ')[0]} · {g.lesson.topic}</div>
                  <div class="adapt-items">
                    {#each g.items as a (a.id)}
                      <div class="adapt-item">
                        <span class="adapt-emoji">{a.emoji}</span>
                        <div style="flex:1;min-width:0;">
                          <div class="adapt-strategy">{a.teacherAction}</div>
                          <div class="adapt-for">{a.target}</div>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </div>

      {#if addOpen}
        <div class="drawer-backdrop" role="presentation" onclick={() => (addOpen = false)}></div>
        <aside class="lesson-drawer" aria-label="Add lesson">
          <div class="drawer-head">
            <div class="drawer-icon"><Icon name="plus" size={17} /></div>
            <div>
              <h2>New lesson</h2>
              <p>Add it to today's teaching loop.</p>
            </div>
            <button class="icon-btn" type="button" aria-label="Close" onclick={() => (addOpen = false)}>
              <Icon name="x" size={19} />
            </button>
          </div>

          <form method="POST" action="?/addLesson" class="drawer-form">
            <label>
              <span>Class</span>
              <select name="classId" required>
                {#each classes as c (c.id)}
                  <option value={c.id}>{c.yearGroup} · {c.name}</option>
                {/each}
              </select>
            </label>

            <label>
              <span>Subject</span>
              <select name="subjectId" required>
                {#each subjects as s (s.id)}
                  <option value={s.id}>{s.parentId ? 'English · ' : ''}{s.name}</option>
                {/each}
              </select>
            </label>

            <label>
              <span>Topic</span>
              <input name="topic" required placeholder="e.g. Fractions – mixed numbers" />
            </label>

            <label>
              <span>Learning objective</span>
              <textarea
                name="objective"
                required
                rows="3"
                placeholder="What should pupils be able to do by the end?"
              ></textarea>
            </label>

            <div class="time-grid">
              <label>
                <span>Start</span>
                <input name="start" type="time" value="09:00" required />
              </label>
              <label>
                <span>End</span>
                <input name="end" type="time" value="09:45" required />
              </label>
            </div>

            <div class="upload-note">
              <span>Next step</span>
              Lesson-plan upload can sit here: PDF, Word or Google Doc, then adaptations generate from the plan and the pupil memory.
            </div>

            <div class="drawer-actions">
              <button class="ghost-btn" type="button" onclick={() => (addOpen = false)}>Cancel</button>
              <button class="save-btn" type="submit">Save lesson</button>
            </div>
          </form>
        </aside>
      {/if}
    </div>
  </AppShell>
{/if}

<style>
  .centered {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .empty-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 36px;
    max-width: 420px;
    text-align: center;
  }
  .wordmark {
    font-weight: 800;
    font-size: 28px;
    letter-spacing: -0.03em;
    color: var(--primary);
    margin-bottom: 16px;
  }
  .empty-card h1 {
    font-weight: 700;
    font-size: 22px;
    margin: 0 0 8px;
  }
  .empty-card p {
    color: var(--text-muted);
    margin: 0 0 20px;
  }
  .setup-btn {
    display: inline-block;
    background: var(--primary);
    color: #fff;
    font-weight: 600;
    padding: 11px 20px;
    border-radius: var(--radius);
    text-decoration: none;
    box-shadow: var(--shadow-md);
  }

  .today {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .topbar {
    padding: 12px 22px 10px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .topbar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .topbar h1 {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    margin: 0;
  }
  .form-error {
    background: var(--revisit-bg);
    color: var(--revisit);
    border: 1px solid #f3bfba;
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 10px;
  }
  .daybar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .day-pill {
    padding: 5px 14px;
    border-radius: 20px;
    background: var(--primary-light);
    border: 1px solid var(--primary);
    font-size: 12px;
    font-weight: 700;
    color: var(--primary);
  }
  .week {
    font-size: 11px;
    color: var(--text-subtle);
  }

  .cols {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  .timeline-col {
    flex: 1;
    overflow: auto;
    padding: 18px 22px;
    min-width: 0;
  }
  .timeline {
    position: relative;
  }
  .rail {
    position: absolute;
    left: 36px;
    top: 24px;
    bottom: 24px;
    width: 1px;
    background: var(--border);
  }
  .lessons {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .lesson-row {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .time {
    width: 72px;
    flex-shrink: 0;
    text-align: right;
    padding-top: 12px;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-subtle);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 14px;
    border: 2px solid var(--border);
    position: relative;
    z-index: 1;
  }
  .lesson-card-wrap {
    flex: 1;
    min-width: 0;
  }
  .lesson-card {
    display: block;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: transform 0.12s;
    text-decoration: none;
    color: inherit;
  }
  .lesson-card:hover {
    transform: translateY(-1px);
  }
  .lc-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .lc-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .lc-meta {
    flex: 1;
    min-width: 0;
  }
  .lc-topic {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lc-sub {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .upcoming {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    background: #f1f3f6;
    color: #8b93a1;
    flex-shrink: 0;
  }
  .lc-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .no-lessons {
    padding-left: 86px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .adapt-col {
    width: 256px;
    flex-shrink: 0;
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    overflow: hidden;
  }
  .adapt-head {
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .adapt-body {
    flex: 1;
    overflow: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .adapt-empty {
    padding: 24px 8px;
    text-align: center;
    color: var(--text-subtle);
    font-size: 12px;
  }
  .adapt-group-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 7px;
  }
  .adapt-items {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .adapt-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 7px;
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .adapt-emoji {
    font-size: 14px;
    flex-shrink: 0;
    line-height: 1.3;
  }
  .adapt-strategy {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.4;
    margin-bottom: 2px;
  }
  .adapt-for {
    font-size: 10px;
    color: var(--text-subtle);
  }

  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(26, 25, 23, 0.22);
    backdrop-filter: blur(3px);
  }
  .lesson-drawer {
    position: fixed;
    inset: 0 0 0 auto;
    z-index: 81;
    width: min(460px, 100vw);
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    animation: drawer-in 0.18s ease-out;
  }
  .drawer-head {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .drawer-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: var(--primary-light);
    color: var(--primary);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .drawer-head h2 {
    font-size: 15px;
    margin: 0;
  }
  .drawer-head p {
    font-size: 11px;
    color: var(--text-muted);
    margin: 2px 0 0;
  }
  .icon-btn {
    margin-left: auto;
    border: 0;
    background: transparent;
    color: var(--text-subtle);
    cursor: pointer;
    display: flex;
    padding: 4px;
  }
  .drawer-form {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: auto;
  }
  .drawer-form label {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .drawer-form span,
  .upload-note span {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }
  .drawer-form input,
  .drawer-form select,
  .drawer-form textarea {
    width: 100%;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    padding: 9px 12px;
    outline: none;
    box-sizing: border-box;
  }
  .drawer-form textarea {
    resize: vertical;
    line-height: 1.45;
  }
  .drawer-form input:focus,
  .drawer-form select:focus,
  .drawer-form textarea:focus {
    border-color: var(--primary);
  }
  .time-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .upload-note {
    border: 1px dashed var(--border);
    border-radius: 10px;
    padding: 13px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
    background: var(--surface-2);
  }
  .upload-note span {
    display: block;
    margin-bottom: 5px;
    color: var(--primary);
  }
  .drawer-actions {
    display: flex;
    gap: 10px;
    margin-top: auto;
    padding-top: 4px;
  }
  .ghost-btn,
  .save-btn {
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    border: 1.5px solid var(--border);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .ghost-btn {
    flex: 1;
    background: transparent;
    color: var(--text-muted);
  }
  .save-btn {
    flex: 2;
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
  }
  @keyframes drawer-in {
    from { transform: translateX(18px); opacity: 0.75; }
    to { transform: translateX(0); opacity: 1; }
  }

  @media (max-width: 720px) {
    .cols {
      flex-direction: column;
      overflow: auto;
    }
    .adapt-col {
      width: 100%;
      border-left: none;
      border-top: 1px solid var(--border);
    }
    .lesson-drawer {
      width: 100vw;
    }
  }
</style>
