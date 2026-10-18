<h1 align="center">Go Interview Quiz</h1>

<p align="center">
  <a href="https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/AlexGalhardo/vukem-golang-quiz-htmx/ci.yml?branch=main&label=tests" alt="Tests"></a>
  <a href="https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/AlexGalhardo/vukem-golang-quiz-htmx/release.yml?label=ci%2Fcd" alt="CI/CD"></a>
  <a href="https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/releases"><img src="https://img.shields.io/github/v/release/AlexGalhardo/vukem-golang-quiz-htmx?include_prereleases&label=version" alt="Version"></a>
  <a href="https://github.com/AlexGalhardo/vukem"><img src="https://img.shields.io/badge/built%20with-vukem-00ADD8" alt="Built with Vukem"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/AlexGalhardo/vukem-golang-quiz-htmx" alt="License"></a>
</p>

## Introduction

Go Interview Quiz is an open-source, interactive quiz of Go (Golang) interview questions, from very easy to very hard. Every question has five alternatives, an explanation of each option and links to its sources, in English and Brazilian Portuguese. It is built with the [Vukem](https://github.com/AlexGalhardo/vukem) Go framework, htmx 4 and Tailwind CSS v4, runs in production at <https://quiz.vukem.dev> and is one of the battle tests for Vukem 1.0.

## Summary

| Area | What you get |
| --- | --- |
| **Question bank** | 133 questions in 7 topic shards (very easy 24, easy 31, medium 30, hard 24, very hard 24), every snippet run on Go 1.27, every source link checked, embedded in the binary. |
| **Quiz flow** | Lands straight on a question; alternatives shuffled server-side on every request; answers lock the options and show the explanation card; deep links and back button work. |
| **Modes and stats** | Ordered or random queue, difficulty filter, review of wrong answers only, progress X/N and accuracy overall and per difficulty, reset with confirmation. |
| **Languages and themes** | EN and PT-BR (`?lang=` or `Accept-Language`), dark and light themes with no flash on load. |
| **Keyboard and accessibility** | `1`–`5` / `A`–`E` to answer and `Enter` for the next question; axe scans on every page state with zero serious or critical violations; Lighthouse 100 on mobile. |
| **Privacy** | No accounts, no database, no cookies: progress stays in `localStorage`; optional cookieless analytics (Plausible or Umami). |
| **Security** | Strict nonce-based CSP, per-IP rate limit, GET-only routes, allowlisted params, an OWASP abuse test suite, ZAP and Nuclei scans in CI. |
| **Operations** | One static binary with views and assets embedded, `/up` health check, Docker image on GHCR, Railway deploy, a human-like QA suite and a smoke script for any deployment. |

## Why this project

- **Learn by explanation.** Every alternative says why it is right or wrong and links the spec, the docs or the Go blog.
- **Hypermedia, not a SPA.** The server renders HTML and htmx swaps fragments; the only client state is `localStorage`.
- **Secure by default.** Every item of the [security checklist](PLAN.md#security-checklist) has a test.
- **Framework feedback loop.** Every Vukem bug or rough edge found here is reported upstream and fixed in the framework, not hidden in the app.
- **Windows is first-class.** Pure Go, no C compiler; developed on Windows 11, deployed on Linux.

## Stack

| Layer | Choice |
| --- | --- |
| Backend | Go 1.27.2, Vukem v0.28.0 (`html/template` views, i18n, rate limit, secure headers) |
| Frontend | htmx 4.0.0 (vendored), Tailwind CSS 4.3.3, TypeScript 7.0.2, Vite 8.3.4 |
| Data | None: questions are JSON shards embedded in the binary, progress lives in the browser |
| Tooling | Bun 1.4.3, Playwright 1.64.1, axe, golangci-lint v2.15.0, govulncheck v1.9.0, lefthook, commitlint, markdownlint-cli2 |
| Hosting | Railway (Docker image `alpine:3.24.2`, built with the `vukem_nosqlite` tag), images on GHCR |

## Quick start

Requirements: Go 1.27.2, Bun 1.4.3 and Docker (optional).

```sh
bun install                  # JS deps + git hooks
docker compose up            # http://localhost:3000 (Go app with reload + Vite dev server)
curl http://localhost:3000/up
```

Without Docker: `cp .env.example .env`, then `bun run dev` and `go run ./cmd/app` in two terminals.

Configuration is in [.env.example](.env.example). Production needs `APP_ENV=production`, `APP_KEY` and `APP_URL`; Railway sets `PORT`. Analytics is off unless `ANALYTICS_PROVIDER` is set. The [Dockerfile](Dockerfile) builds a single static binary with views and assets embedded (`docker compose --profile prod up --build prod` serves it on :8080), and [railway.json](railway.json) configures Railway (Dockerfile builder, `/up` health check).

## Checks

```sh
golangci-lint run ./... && go test -race ./...
bun run typecheck && bun run test:unit && bun run build && bunx markdownlint-cli2
bun run test:e2e             # Playwright (starts the app)
go run ./internal/tools/quizcheck
```

The QA suite, the smoke script and the e2e run against the production binary are described in [AGENTS.md](AGENTS.md#commands).

## Documentation

- [PLAN.md](PLAN.md): briefing, decisions, architecture, routes, security checklist, roadmap
- [docs/questions-style-guide.md](docs/questions-style-guide.md): how questions are written and sourced
- [docs/qa-checklist.md](docs/qa-checklist.md): QA checklist, runs and findings
- [CHANGELOG.md](CHANGELOG.md): every release, each entry linked to its commit
- [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md): rules for coding agents

## Agentic development

The project is developed with AI coding agents. [AGENTS.md](AGENTS.md), the path-scoped rules in `.claude/rules/` and the skills in `.claude/skills/` describe the conventions, the test-first workflow and the security contract every change follows.

## Contributing

Thank you for considering contributing! Read the [contribution guide](CONTRIBUTING.md) to get started.

## Security vulnerabilities

If you discover a security vulnerability, please follow the [security policy](SECURITY.md) instead of opening a public issue.

## License

Go Interview Quiz is open-source software licensed under the [MIT license](LICENSE).
