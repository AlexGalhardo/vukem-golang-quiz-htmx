# AGENTS.md

Go interview quiz at <https://quiz.vukem.dev>, built on the [vukem](https://github.com/AlexGalhardo/vukem) framework (htmx 4, Tailwind v4, no DB). Module `github.com/AlexGalhardo/vukem-golang-quiz-htmx`.

## Start here

1. Read [PLAN.md](PLAN.md): briefing, decisions, architecture, and the first unchecked task.
2. Framework problems go to `../framework-feedback/quiz.md` with a local workaround; never edit `../vukem/`.
3. Framework bumps follow the [bump flow](PLAN.md#framework-bump-flow) (`build(deps): bump vukem to vX.Y.Z`).

## Commands

- `bun install`: JS deps and git hooks (lefthook)
- `docker compose up`: app with reload on :3000 + Vite on :5173 (`APP_PORT=3100` moves the app)
- `go run ./cmd/app`: app without Docker (`.env` from `.env.example`; `APP_KEY` only needed in production)
- `go test ./...` / `go test -race ./...`: Go tests
- `golangci-lint fmt ./... && golangci-lint run ./...`: format and lint (v2.15.0)
- `bun run build` / `bun run typecheck` / `bunx markdownlint-cli2`
- `bun run test:e2e`: Playwright (`E2E_BASE_URL=http://localhost:3100` targets a running app)
- `docker compose --profile prod up --build prod`: production image on :8080
- `go tool govulncheck ./...`
- `bun run test:qa`: human-like QA suite (`e2e/qa`: crawler, flows, security checks; starts two local apps); read-only against a deployment with `QA_BASE_URL=<url> QA_READONLY=1 bun run test:qa --project=desktop`. Results and findings: `docs/qa-checklist.md`
- `scripts/smoke.sh <url>`: smoke test any deployment (Docker, production)
- `e2e/a11y.spec.ts`: axe (`@axe-core/playwright`) on every page state; serious/critical violations fail
- `go run ./internal/tools/quizcheck [shard.json...]`: validate question shards and print counts; `go test -tags=links ./internal/quiz/` checks every source URL (network)
- e2e against the production binary: `bun run build && go build -o bin/app ./cmd/app`, start it with `APP_ENV=production APP_KEY=... PORT=3100 RATE_LIMIT_PER_MINUTE=100000`, then `E2E_BASE_URL=http://localhost:3100 bun run test:e2e`

## Rules

- Test first; a task is done when its `→ verify:` passes and CI is green (`gh run list`).
- Conventional Commits in English (`.claude/rules/commits.md`); Keep a Changelog; SemVer tags.
- Exact dependency versions, latest stable only; ask before adding a dependency.
- Strict CSP: no inline scripts, styles or event-handler attributes in views.
- Stateless server, no cookies; client state in `localStorage`.
- `.claude/settings.local.json` is per-developer and git-ignored; the owner keeps `{"disableAllHooks": true}` there.
- Never create git worktrees without the owner's explicit approval.

## Where things live

| Path | What |
| --- | --- |
| `routes/web.go` | middleware stack and routes |
| `app/controllers/` | handlers |
| `internal/quiz/` | question model, loader, validation; shards in `internal/quiz/data/questions/<topic>.json` |
| `internal/settings/` | env settings: analytics, proxy, rate limit |
| `resources/` | views, CSS, TS, public assets |
| `tests/`, `e2e/` | Go HTTP tests, Playwright |
| `.claude/rules/`, `.claude/skills/` | agent rules and skills |
