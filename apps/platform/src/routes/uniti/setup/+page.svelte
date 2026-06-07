<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const STEPS = ['School', 'Staff', 'Pupils & classes', 'Privacy & AI', 'Ready'] as const;
  let current = $state(0);

  // Step 1 — School (confirm the basics).
  let schoolConfirmed = $state(false);

  // Step 2 — Staff (invite + assign roles).
  let inviteEmail = $state('');
  let inviteRole = $state<'teacher' | 'leader' | 'school_admin' | 'teaching_assistant'>('teacher');
  let inviting = $state(false);
  let inviteError = $state<string | null>(null);
  let lastLink = $state<string | null>(null);
  let staff = $state(
    (data.invites ?? []).map((i) => ({ email: i.email, role: i.role, status: 'invited' as const })),
  );

  // Step 3 — Pupils & classes.
  let rosterPlan = $state<'csv_later' | 'mis_later' | 'small_now'>('csv_later');
  let rosterNoted = $state(false);

  // Step 4 — Privacy & AI.
  let aiEnabled = $state(true);
  let sensitivity = $state<'group' | 'pseudonymised'>('group');
  let privacySaved = $state(false);
  let savingPrivacy = $state(false);

  const slug = data.instance?.slug ?? null;

  const ROLE_LABELS: Record<string, string> = {
    teacher: 'Teacher',
    leader: 'Leader',
    school_admin: 'School admin',
    teaching_assistant: 'Teaching assistant',
    office_manager: 'Office manager',
    owner: 'Owner',
    specialist: 'Specialist',
    viewer: 'Viewer',
  };

  // A step is "done" when its key action is complete.
  const done = $derived([
    schoolConfirmed,
    staff.length > 0,
    rosterNoted,
    privacySaved,
    schoolConfirmed && staff.length > 0 && rosterNoted && privacySaved,
  ]);

  async function sendInvite() {
    if (!slug) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      inviteError = 'Please enter a valid email address.';
      return;
    }
    inviting = true;
    inviteError = null;
    lastLink = null;
    try {
      const res = await fetch(`/api/cloudlet/instances/${encodeURIComponent(slug)}/invites`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      if (!res.ok) {
        inviteError = 'Could not send that invite. Please try again.';
        return;
      }
      const body = (await res.json()) as { acceptUrl?: string };
      staff = [...staff, { email, role: inviteRole, status: 'invited' }];
      lastLink = body.acceptUrl ?? null;
      inviteEmail = '';
    } catch {
      inviteError = 'Could not send that invite. Please try again.';
    } finally {
      inviting = false;
    }
  }

  async function savePrivacy() {
    if (!slug) {
      privacySaved = true;
      return;
    }
    savingPrivacy = true;
    try {
      // Persist the privacy/AI choice as a workspace setting event (lives in the
      // school's own cloud, not the platform DB).
      await fetch(`/api/cloudlet/instances/${encodeURIComponent(slug)}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientEventId: `setup-privacy-${Date.now()}`,
          type: 'setup.privacy_saved',
          deviceId: 'web',
          schemaVersion: 1,
          payload: { aiEnabled, sensitivity },
        }),
      }).catch(() => {});
      privacySaved = true;
    } finally {
      savingPrivacy = false;
    }
  }

  function next() {
    if (current < STEPS.length - 1) current += 1;
  }
  function go(i: number) {
    current = i;
  }
</script>

<svelte:head><title>Set up your school · uniti</title></svelte:head>

<div class="setup">
  <header class="brand">
    <span class="wordmark">uniti</span>
    <span class="subtitle">School Cloud</span>
  </header>

  {#if !data.instance}
    <section class="card">
      <h1>Nothing to set up yet</h1>
      <p class="muted">Ask your administrator to provision your school's private cloud.</p>
    </section>
  {:else}
    <p class="eyebrow">Setting up</p>
    <h1 class="title">{data.instance.displayName}</h1>
    <p class="lede">A few calm steps and you're ready. You can come back any time.</p>

    <!-- Green-tick checklist -->
    <ol class="checklist" aria-label="Setup steps">
      {#each STEPS as label, i (label)}
        <li class:active={current === i} class:complete={done[i]}>
          <button type="button" class="tick-row" onclick={() => go(i)}>
            <span class="tick" aria-hidden="true">
              {#if done[i]}✓{:else}{i + 1}{/if}
            </span>
            <span class="tick-label">{label}</span>
          </button>
        </li>
      {/each}
    </ol>

    <section class="card step">
      {#if current === 0}
        <p class="eyebrow">Step 1</p>
        <h2>Your school</h2>
        <dl class="facts">
          <div><dt>Name</dt><dd>{data.instance.name}</dd></div>
          <div><dt>Region</dt><dd>{data.instance.region === 'uk' ? 'United Kingdom' : data.instance.region}</dd></div>
        </dl>
        <p class="muted">Your data stays within your school's private cloud.</p>
        <label class="confirm">
          <input type="checkbox" bind:checked={schoolConfirmed} />
          <span>These details look right</span>
        </label>
        <button class="btn primary" onclick={next} disabled={!schoolConfirmed}>Continue</button>

      {:else if current === 1}
        <p class="eyebrow">Step 2</p>
        <h2>Invite your staff</h2>
        <p class="muted">Add teachers and leaders. They'll sign in with your school's account.</p>

        <div class="invite-row">
          <input
            type="email"
            placeholder="teacher@yourschool.sch.uk"
            bind:value={inviteEmail}
            autocomplete="off"
          />
          <select bind:value={inviteRole} aria-label="Role">
            <option value="teacher">Teacher</option>
            <option value="teaching_assistant">Teaching assistant</option>
            <option value="leader">Leader</option>
            <option value="school_admin">School admin</option>
          </select>
          <button class="btn primary" onclick={sendInvite} disabled={inviting}>
            {inviting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
        {#if inviteError}<p class="error">{inviteError}</p>{/if}
        {#if lastLink}
          <p class="link-hint">
            Invite ready. Share this link if email hasn't arrived:
            <br /><code>{lastLink}</code>
          </p>
        {/if}

        {#if staff.length}
          <ul class="staff">
            {#each staff as s (s.email)}
              <li>
                <span class="avatar" aria-hidden="true">{s.email.slice(0, 1).toUpperCase()}</span>
                <span class="staff-email">{s.email}</span>
                <span class="role-pill">{ROLE_LABELS[s.role] ?? s.role}</span>
                <span class="status">Invited</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted small">No staff invited yet.</p>
        {/if}

        <button class="btn primary" onclick={next} disabled={staff.length === 0}>Continue</button>

      {:else if current === 2}
        <p class="eyebrow">Step 3</p>
        <h2>Pupils & classes</h2>
        <p class="muted">How would you like to add your classes? You can change this later.</p>
        <div class="choices">
          <label class:sel={rosterPlan === 'csv_later'}>
            <input type="radio" value="csv_later" bind:group={rosterPlan} />
            <span><strong>Upload a spreadsheet</strong><br />Import classes from a CSV.</span>
          </label>
          <label class:sel={rosterPlan === 'mis_later'}>
            <input type="radio" value="mis_later" bind:group={rosterPlan} />
            <span><strong>Connect our MIS</strong><br />Sync classes automatically (Wonde).</span>
          </label>
          <label class:sel={rosterPlan === 'small_now'}>
            <input type="radio" value="small_now" bind:group={rosterPlan} />
            <span><strong>Add a class by hand</strong><br />Just a few pupils to start.</span>
          </label>
        </div>
        {#if rosterPlan === 'csv_later' || rosterPlan === 'small_now'}
          <p class="link-hint">
            Ready now? Open <a href="/uniti/roster">Roster &amp; MIS</a> to upload a spreadsheet,
            preview the changes, and apply. You can also do this later.
          </p>
        {:else}
          <p class="link-hint">
            We'll connect your MIS (Wonde) once it's authorised. Until then, upload a spreadsheet
            from <a href="/uniti/roster">Roster &amp; MIS</a> so you're not blocked.
          </p>
        {/if}
        <button class="btn primary" onclick={() => { rosterNoted = true; next(); }}>
          Continue
        </button>

      {:else if current === 3}
        <p class="eyebrow">Step 4</p>
        <h2>Privacy & AI</h2>
        <p class="muted">You're in control. Sensible defaults are set for you.</p>

        <label class="toggle">
          <input type="checkbox" bind:checked={aiEnabled} />
          <span>
            <strong>Helpful suggestions</strong><br />
            Let uniti suggest next steps for your classes. You always decide what's used.
          </span>
        </label>

        {#if aiEnabled}
          <div class="choices tight">
            <label class:sel={sensitivity === 'group'}>
              <input type="radio" value="group" bind:group={sensitivity} />
              <span><strong>Group only</strong><br />Suggestions use class-level patterns. Most private.</span>
            </label>
            <label class:sel={sensitivity === 'pseudonymised'}>
              <input type="radio" value="pseudonymised" bind:group={sensitivity} />
              <span><strong>Per pupil (anonymised)</strong><br />More tailored, names never sent.</span>
            </label>
          </div>
        {/if}

        <button class="btn primary" onclick={() => { savePrivacy().then(next); }} disabled={savingPrivacy}>
          {savingPrivacy ? 'Saving…' : 'Save & continue'}
        </button>

      {:else}
        <p class="eyebrow">All set</p>
        <h2>Your school is ready</h2>
        <p class="muted">Staff can sign in and start straight away.</p>
        <ul class="done-list">
          <li class:ok={schoolConfirmed}><span aria-hidden="true">✓</span> School details confirmed</li>
          <li class:ok={staff.length > 0}><span aria-hidden="true">✓</span> {staff.length} staff invited</li>
          <li class:ok={rosterNoted}><span aria-hidden="true">✓</span> Classes plan chosen</li>
          <li class:ok={privacySaved}><span aria-hidden="true">✓</span> Privacy & AI set</li>
        </ul>
        <a class="btn primary" href="/uniti">Go to your school</a>
        <p class="muted" style="margin-top:14px;">
          Manage data, retention, AI audit and erasure on the
          <a href="/uniti/privacy">Privacy &amp; data</a> screen.
        </p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .setup {
    max-width: 640px;
    margin: 0 auto;
    padding: 40px 20px 72px;
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 24px;
  }
  .wordmark {
    font-weight: 800;
    font-size: 28px;
    letter-spacing: -0.01em;
    color: var(--primary);
  }
  .subtitle {
    font-weight: 500;
    color: var(--text-muted);
    font-size: 15px;
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    margin: 0 0 4px;
  }
  .title {
    font-weight: 800;
    font-size: 30px;
    letter-spacing: -0.01em;
    margin: 0 0 6px;
  }
  h1 {
    font-weight: 700;
    font-size: 24px;
    letter-spacing: -0.01em;
  }
  h2 {
    font-weight: 700;
    font-size: 21px;
    letter-spacing: -0.01em;
    margin: 4px 0 8px;
  }
  .lede {
    color: var(--text-muted);
    margin: 0 0 24px;
    font-size: 16px;
  }
  .muted {
    color: var(--text-muted);
    line-height: 1.5;
  }
  .muted.small {
    font-size: 14px;
  }

  /* Green-tick checklist */
  .checklist {
    list-style: none;
    padding: 0;
    margin: 0 0 20px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .checklist li {
    flex: 1 1 auto;
  }
  .tick-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
    cursor: pointer;
    font-family: inherit;
    color: var(--text-muted);
    transition: border-color 0.15s ease, color 0.15s ease;
  }
  .checklist li.active .tick-row {
    border-color: var(--primary);
    color: var(--text);
  }
  .tick {
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    background: var(--bg);
    color: var(--text-subtle);
    border: 1px solid var(--border);
  }
  .checklist li.complete .tick {
    background: var(--got-it);
    color: #fff;
    border-color: var(--got-it);
  }
  .tick-label {
    font-size: 13px;
    font-weight: 600;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 28px;
  }

  .facts {
    margin: 16px 0;
    display: grid;
    gap: 10px;
  }
  .facts div {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
  }
  .facts dt {
    color: var(--text-muted);
    font-size: 14px;
  }
  .facts dd {
    margin: 0;
    font-weight: 600;
  }

  .confirm,
  .toggle {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 18px 0;
    cursor: pointer;
  }
  .confirm input,
  .toggle input {
    margin-top: 2px;
    accent-color: var(--primary);
    width: 18px;
    height: 18px;
  }

  .invite-row {
    display: flex;
    gap: 8px;
    margin: 16px 0 8px;
    flex-wrap: wrap;
  }
  .invite-row input[type='email'] {
    flex: 1 1 200px;
  }
  input[type='email'],
  select {
    font-family: inherit;
    font-size: 15px;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--text);
    box-sizing: border-box;
  }
  input[type='email']:focus,
  select:focus {
    outline: none;
    border-color: var(--primary);
  }

  .btn {
    font-family: inherit;
    font-weight: 600;
    font-size: 15px;
    border-radius: var(--radius);
    padding: 12px 20px;
    border: 1px solid transparent;
    cursor: pointer;
    margin-top: 18px;
    display: inline-block;
    text-decoration: none;
    text-align: center;
  }
  .btn.primary {
    background: var(--primary);
    color: #fff;
    box-shadow: var(--shadow-md);
  }
  .btn.primary:hover {
    background: var(--primary-dark);
  }
  .btn:disabled {
    opacity: 0.55;
    cursor: default;
    box-shadow: none;
  }

  .staff {
    list-style: none;
    padding: 0;
    margin: 12px 0 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .staff li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--bg);
    border-radius: var(--radius);
  }
  .avatar {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    border-radius: 999px;
    background: var(--primary-light);
    color: var(--primary-dark);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 13px;
  }
  .staff-email {
    flex: 1;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .role-pill {
    background: var(--accent-light);
    color: #8a5a1e;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 999px;
  }
  .status {
    color: var(--text-subtle);
    font-size: 12px;
  }

  .choices {
    display: grid;
    gap: 10px;
    margin: 16px 0 0;
  }
  .choices.tight {
    margin-top: 4px;
    margin-bottom: 4px;
  }
  .choices label {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .choices label.sel {
    border-color: var(--primary);
    background: var(--primary-light);
  }
  .choices input {
    margin-top: 3px;
    accent-color: var(--primary);
  }
  .choices span {
    font-size: 14px;
    line-height: 1.45;
  }

  .link-hint {
    font-size: 13px;
    color: var(--text-muted);
    margin: 8px 0 0;
    line-height: 1.5;
  }
  .link-hint code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    word-break: break-all;
    color: var(--primary-dark);
  }

  .error {
    color: var(--revisit);
    margin: 10px 0 0;
    font-weight: 500;
    font-size: 14px;
  }

  .done-list {
    list-style: none;
    padding: 0;
    margin: 16px 0 0;
    display: grid;
    gap: 10px;
  }
  .done-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-muted);
    font-weight: 500;
  }
  .done-list li span {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    background: var(--bg);
    color: var(--text-subtle);
  }
  .done-list li.ok {
    color: var(--text);
  }
  .done-list li.ok span {
    background: var(--got-it);
    color: #fff;
  }
</style>
