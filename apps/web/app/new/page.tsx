/**
 * /new — first-time maker hero surface.
 *
 * Spec v6 §1 (Onboarding) — this is the most important UX in the product.
 * Built out in Week 2 with inline GitHub repo picker, auto-detection,
 * preview card, and Quick Ship SLO instrumentation.
 *
 * For now it's a placeholder so the route exists.
 */
export default function NewProjectPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-xl space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Ship your app</h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">
          Connect a GitHub repo or upload a zip. We'll detect the framework,
          package it, and put it live in under three minutes.
        </p>
        <p className="text-sm text-neutral-500 font-mono">Coming in Week 2.</p>
      </div>
    </main>
  );
}
