---
paths:
  - "resources/**"
  - "vite.config.ts"
  - "e2e/**"
---

# Frontend rules

- Server renders HTML (`html/template` in `resources/views`); htmx 4 swaps fragments. No SPA framework.
- Tailwind CSS v4 is CSS-first: tokens in `@theme` in `resources/css/app.css`; no `tailwind.config.js`.
- CSP is strict (nonce-only scripts and styles): no inline `<script>` (single exception: the nonce'd theme bootstrap in the layout and 404 page, which must stay tiny and use the per-request CSP nonce), no `style=""`, no `hx-on:*`, no `on*=` attributes. Behaviour goes in `resources/js/app.ts`.
- htmx config lives in `<meta name="htmx-config">`; indicator CSS is off (`includeIndicatorCSS:false`), indicators are Tailwind classes.
- Client state (progress, stats, theme, language, mode) lives in `localStorage` under the `quiz:` prefix, versioned, always read through a guarded parser.
- TypeScript strict, no `any`; `bun run typecheck` must pass.
- Accessibility: semantic elements, visible focus, `aria-live` for the explanation card, AA contrast in both themes, every shortcut also reachable by click.
