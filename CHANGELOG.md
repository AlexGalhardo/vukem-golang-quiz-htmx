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
- `TRUSTED_PROXIES`, `TRUST_FORWARDED_PROTO` and `RATE_LIMIT_PER_MINUTE` (default 120 per IP; `/up` exempt).
- Tests: HTTP tests for every route and locale, security abuse suite (headers, no cookies, GET only, reflected XSS, path traversal, error pages, rate limit, oversized URLs), Playwright e2e for every button, link, shortcut and setting on desktop and mobile.

- Accessibility: axe scan (`@axe-core/playwright` 4.14.0, dev dependency) in the e2e suite on every page state, light/dark, EN/PT-BR, desktop/mobile; serious or critical violations fail CI.
- `scripts/smoke.sh <url>` smoke test (health, page, question fragment, answer, headers, 404), used by the CI DAST job; Nuclei medium+ findings and `internal/quiz` coverage below 85% fail CI.

### Changed

- vukem bumped to v0.22.0, then v0.23.0; tests use `AssertHeaderContains` / `AssertHeaderMissing`.

### Fixed

- Alternatives that differ only in punctuation (code literals) are no longer rejected as duplicates.
- "Next" used a full page load because `htmx` was read before its deferred script ran; the settings panel now closes on Escape or an outside click; Back returns to the first question.
- Overlapping question loads (fast setting changes) could finish out of order and leave a stale question on screen.

[Unreleased]: https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commits/main
