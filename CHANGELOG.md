# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project foundation: vukem v0.21.1 app with the `/up` health check and the empty two-column quiz page (Tailwind CSS v4 via Vite, htmx 4.0.0 vendored, strict CSP).
- Tooling: Bun, golangci-lint v2, markdownlint-cli2, commitlint, lefthook git hooks, `.editorconfig` with tabs.
- Docker: multi-stage Dockerfile (non-root runtime) and `compose.yaml` for development (`vukem serve` + Vite) plus a production profile.
- CI/CD: lint, race tests, govulncheck, build, Playwright e2e, Docker smoke test, ZAP baseline and Nuclei scans; release workflow publishing the image to GHCR.
- Docs: PLAN.md, AGENTS.md, CLAUDE.md, README, CONTRIBUTING, SECURITY, MIT license; Claude Code skills and rules.
- Question bank: 133 Go interview questions in 7 topic shards (very-easy 24, easy 31, medium 30, hard 24, very-hard 24), each in English and Brazilian Portuguese with five alternatives, an explanation, why every wrong option is wrong, and 1–3 sources; validated at boot, by the schema test and by `quizcheck`.
- Quiz UI: question pages and htmx fragments with shuffled alternatives, answer lock with explanation and sources, Next/Back, ordered or random mode, difficulty filter, review-wrong mode, progress and accuracy per difficulty in `localStorage`, reset, keyboard shortcuts (1–5, A–E, Enter), dark/light theme without flash, EN/PT-BR switch, 404 page.
- Cookieless analytics (Plausible or Umami) configured by environment, off by default, with the script origin added to the CSP.
- `RATE_LIMIT_PER_MINUTE` (default 120 per client IP; `/up` exempt; per visitor behind a proxy only with `TRUSTED_PROXIES` and `CLIENT_IP_HEADER` set on the platform). Proxy settings (`TRUSTED_PROXIES`, `TRUST_FORWARDED_PROTO`, `CLIENT_IP_HEADER`) come from vukem.
- Tests: HTTP tests for every route and locale, security abuse suite (headers, no cookies, GET only, reflected XSS, path traversal, error pages, rate limit, oversized URLs), Playwright e2e for every button, link, shortcut and setting on desktop and mobile.

- Accessibility: axe scan (`@axe-core/playwright` 4.14.0, dev dependency) in the e2e suite on every page state, light/dark, EN/PT-BR, desktop/mobile; serious or critical violations fail CI.
- `scripts/smoke.sh <url>` smoke test (health, page, question fragment, answer, headers, 404), used by the CI DAST job; Nuclei medium+ findings and `internal/quiz` coverage below 85% fail CI.

- `docs/qa-checklist.md` with the first documented run, and UI screenshots in `docs/screenshots/`.
- HTML pages and fragments are gzip-compressed.
- SVG favicon (removes a 404 on every page load).
- Manual `Lighthouse` workflow auditing a deployed URL from a clean CI runner.

- Theme control: the docs site's light/dark/system radiogroup (system follows the OS live, arrow keys supported).
- Settings is a larger modal panel (24rem, 44px targets, segmented order control, difficulties with their accuracy, language, inline reset confirmation) and a bottom sheet below 640px.
- History panel: one entry per quiz run (completed when the selection is finished, stopped early on reset, plus the run in progress) with accuracy, counts, time and per-difficulty accuracy; stored under `quiz:v1:history`, capped at 200, cleared with an inline confirmation.
- Review panel with a navbar badge: this browser session's wrong answers (`sessionStorage`), served by `GET /review`, with a redo mode that replays them until each is right. It replaces the settings switch "review only wrong answers".
- Client unit tests with `bun test` (`bun run test:unit`), run in CI.

- Human-like QA suite (`bun run test:qa`, CI job `qa`): a crawler over every page and control in both themes, languages and viewports, full quiz runs and impatient-user flows, broken storage and odd URLs, and defensive security checks (headers, escaping of hostile query/storage values, method and cross-origin refusal, 429). Findings are tracked in `docs/qa-checklist.md`.

### Changed

- vukem bumped to v0.22.0, v0.23.0, v0.24.0, v0.25.0, then v0.26.0; tests use `AssertHeaderContains` / `AssertHeaderMissing`.

- The theme bootstrap is inlined with the per-request CSP nonce instead of a render-blocking `/js/theme.js` request; htmx moved to `/vendor/htmx-4.0.0/htmx.min.js` and is cached as immutable.

- The middleware stack is vukem's stateless `DefaultMiddlewareWith` (adds maintenance mode); the analytics origin goes through `CSPSources`; the app's own proxy settings were removed; htmx loads before the Vite entry; development runs without `APP_KEY`; the production binary is built without SQLite (`vukem_nosqlite`).
- The Docker image no longer trusts `100.0.0.0/8` (undocumented Railway range); HSTS is forced with vukem's `HSTS_FORCE=true` (set on Railway; needs an https `APP_URL`). The locale comes only from `?lang=` and `Accept-Language` (no cookie source).

### Fixed

- Code samples are keyboard-focusable regions, so they can be scrolled without a mouse on small screens (axe `scrollable-region-focusable`).

- Alternatives that differ only in punctuation (code literals) are no longer rejected as duplicates.
- "Next" used a full page load because `htmx` was read before its deferred script ran; the settings panel now closes on Escape or an outside click; Back returns to the first question.
- Technical and PT-BR review of all 133 questions: every snippet re-run on Go 1.27, factual corrections (unhashable map key panic message, `internal` import rule includes the module root, escape-analysis reason since Go 1.25, `go test` signature error, covmeta write time), sharper "why wrong" texts, PT-BR wording, and better sources.
- Overlapping question loads (fast setting changes) could finish out of order and leave a stale question on screen.

[Unreleased]: https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commits/main
