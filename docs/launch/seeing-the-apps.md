# How to actually see the showcase apps in dev

The container at `apps/platform/` (route `/container`) only embeds real showcase apps when each one is running on its own Vite dev server. Until that happens, the iframe falls back to a synthesised 4-button fixture page.

## One-shot — run everything

From the repo root:

```bash
bun run dev:apps
```

Use `dev:apps` (not `dev`) — it skips the library packages whose `dev` script is `tsup --watch` and only spins up the apps. After ~15 seconds you'll have:

| App | URL |
|---|---|
| `apps/platform/` (container shell) | http://localhost:4101 |
| `apps/showcase-recipe` | http://localhost:5180 |
| `apps/showcase-journal` | http://localhost:5181 |
| `apps/showcase-whiteboard` | http://localhost:5182 |
| `apps/showcase-habit-tracker` | http://localhost:5184 |
| `apps/showcase-workout-logger` | http://localhost:5185 |
| `apps/showcase-pantry-scanner` | http://localhost:5186 |
| `apps/showcase-meal-planner` | http://localhost:5187 |
| `apps/showcase-shopping-list` | http://localhost:5188 |
| `apps/showcase-sleep-logger` | http://localhost:5189 |
| `apps/showcase-body-metrics` | http://localhost:5190 |

Open `http://localhost:4101/container` and the curated apps render the actual React apps inside the iframe (because each `ContainerApp` carries a `devUrl` that the +page.svelte iframe prefers over the synthesised `srcdoc`).

The "Open standalone" link in the container topbar opens the same Vite dev URL in a new tab when one is configured.

## One-shot — see only the showcase apps

If you don't need the container shell, just open the dev ports directly. Each showcase app is a self-contained Vite + React app and works standalone — they don't require apps/platform to be running.

```bash
turbo run dev --filter='@shippie/showcase-habit-tracker'
# → http://localhost:5184/
```

## Cross-app intent demo (the C2 acceptance loop)

The container's bridge listens for `intent.provide` postMessages from any iframe. When the provider's payload includes `rows`, the container looks up granted consumers and forwards `{ kind: 'shippie.intent.broadcast', intent, rows }` to each consumer's iframe via cross-frame postMessage.

1. `bun run dev:apps` (everything up)
2. Open `http://localhost:4101/container`
3. Install Workout Logger → install Habit Tracker — accept the intent permission prompt
4. In Workout Logger, log a session. The container fans the `workout-completed` intent out to Habit Tracker.
5. Habit Tracker's "Exercised" habit auto-checks for today.

Same pattern for the food cluster:
- Pantry Scanner provides `pantry-inventory` → Meal Planner shows live pantry tags
- Meal Planner provides `shopping-list` → Shopping List populates automatically
- Recipe Saver provides `cooked-meal` → Habit Tracker (different cluster!) auto-checks the cooked-dinner habit

That last one is the **cross-cluster acceptance pair** the plan calls out — proof that the ecosystem compounds beyond individual clusters.

## Production hosting (eventual)

In prod each showcase deploys as its own Cloudflare Pages project at `<slug>.shippie.app`, and the container's `standaloneUrl` field carries that real URL. Dev mode bypasses that with the `devUrl` field, which is unset in prod.
