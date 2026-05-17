/**
 * Settings — primarily a privacy page. The banner copy is the verbatim
 * line from VOICE.md. Other than that, this page is intentionally
 * sparse: there are no toggles to flip, no analytics opt-out (because
 * there's no analytics), no account to manage.
 */

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack }: SettingsProps) {
  return (
    <section className="page page-settings" aria-label="Settings">
      <header className="page-header">
        <h1>Settings</h1>
      </header>

      <article className="privacy-banner">
        <h2>Privacy</h2>
        <p>
          Therapy Notes never phones home. What you write here stays on this phone unless you
          choose to print or share it. There's no admin. There's no AI reading it. There's no
          insurer hearing about it.
        </p>
      </article>

      <article className="privacy-detail">
        <h2>What that means</h2>
        <ul>
          <li>The notes are stored on this device only.</li>
          <li>The "Save PDF for session" button uses the browser's print. The PDF goes wherever you save it.</li>
          <li>There's no account, no login, no server.</li>
          <li>The therapist (if you have one) lives outside this app.</li>
        </ul>
      </article>

      <div className="page-actions">
        <button type="button" className="ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}
