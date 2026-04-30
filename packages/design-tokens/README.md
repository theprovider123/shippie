# @shippie/design-tokens

Canonical Shippie brand tokens. **One source of truth for the brand** — sunset / sage / marigold palette, Fraunces + General Sans + JetBrains Mono, sharp corners, dark default with cream inversion.

Consumes:

- Plain CSS apps (most showcases): `import "@shippie/design-tokens/tokens.css"` in your entry CSS.
- Tailwind v4 apps (mevrouw, future): also `import "@shippie/design-tokens/tailwind-theme.css"` so utilities like `bg-bg`, `text-text-light`, `font-heading` are generated.
- The Shippie platform itself imports from this package so a token edit propagates everywhere.

## What's in the box

| File | Purpose |
|---|---|
| `tokens.css` | Canonical CSS variables (`--sunset`, `--bg`, `--font-heading`, …) on `:root` + light-mode inversion + the `.eyebrow` and `.shippie-icon` primitives |
| `tailwind-theme.css` | `@theme inline { … }` mapping for Tailwind v4 utilities |
| `checklist.md` | The 10-item Shippie-Native Checklist used to grade an app's brand alignment |
| `index.ts` | TS surface — exports paths to the assets and a list of canonical token names for tests / lint tools |

## Quick start (plain CSS app)

```css
@import "@shippie/design-tokens/tokens.css";

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
}

.btn-primary {
  background: var(--sunset);
  color: var(--bg-pure);
  border-radius: 0;       /* sharp corners — non-negotiable */
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

## Quick start (Tailwind v4 app)

```css
@import "tailwindcss";
@import "@shippie/design-tokens/tokens.css";
@import "@shippie/design-tokens/tailwind-theme.css";
```

Then use utilities:

```html
<button class="bg-sunset text-bg-pure font-mono uppercase tracking-wider">
  Open
</button>
```

## Brand checklist

Read `./src/checklist.md` for the 10-item rubric. New showcases ship at 9/10 minimum; existing showcases get migrated app-by-app via the brand-uplift sweep.
