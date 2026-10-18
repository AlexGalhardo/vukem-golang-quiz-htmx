# PLAN — Go Interview Quiz (`vukem-golang-quiz-htmx`)

The onboarding file for every session and agent. Read it top to bottom once, then work on the first unchecked task of the current phase.

## Briefing

An interactive Go (Golang) interview-questions quiz at <https://quiz.vukem.dev>. No landing page, no accounts, no database: the visitor lands on the first question. Questions are embedded in the binary; progress lives in the browser.

The project also battle-tests the [vukem](https://github.com/AlexGalhardo/vukem) framework for its 1.0 release. Every bug, missing feature, awkward API, security issue or wrong/missing docs page found here goes to `../framework-feedback/quiz.md` (format at the top of that file), gets a local workaround, and work continues.

- Repository: `git@github.com:AlexGalhardo/vukem-golang-quiz-htmx.git` (public), branch `main`.
- Owner: Alex Galhardo. Code, comments, docs and commits in English.
- Reference UX: <https://cs-fundamentals-quiz.vercel.app/en/data-structures/quiz/>.

## Start here

1. Read this file, then [AGENTS.md](AGENTS.md) (commands and rules).
2. Pick the first `- [ ]` task of the current phase; finish it when its `→ verify:` line passes.
3. Tick the box in the same commit that completes the task.
4. Found a framework problem? Append it to `../framework-feedback/quiz.md`, add a workaround with a comment that names the entry, continue.

### Framework bump flow

The framework pin moves forward during the project. When the coordinator announces a new vukem tag (CI green) with its changelog:

1. `go get github.com/AlexGalhardo/vukem@vX.Y.Z && go mod tidy`; bump `VUKEM_VERSION` in `Dockerfile`.
2. Remove the workarounds that release made unnecessary (search for `framework-feedback`).
3. `golangci-lint run ./... && go test ./... && bun run test:e2e`, push, check `gh run list`.
4. Commit `build(deps): bump vukem to vX.Y.Z`.
5. In `../framework-feedback/quiz.md`, set the fixed entries to `Status: fixed in vX.Y.Z`.

## Decision log

| # | Decision | Why / source |
| --- | --- | --- |
| D1 | No landing page, no auth, no DB; `/` shows the first question | Owner |
| D2 | 100+ questions, free distribution over 5 difficulties: `very-easy`, `easy`, `medium`, `hard`, `very-hard` | Owner |
| D3 | Each question: 5 alternatives (1 correct), explanation of the correct one, why each wrong one is wrong, 1–3 sources (official Go docs/spec/FAQ/Effective Go/memory model, blogs, Reddit, forums, videos) | Owner |
| D4 | Full content in EN (default) and PT-BR | Owner |
| D5 | Questions are JSON embedded with `embed`, validated at startup and by a schema test | Owner |
| D6 | Layout: 2-column grid (question + 5 shuffled alternatives / explanation card), 1 column on mobile | Owner |
| D7 | Click an alternative → locked → explanation + sources revealed → "Next" | Owner |
| D8 | Modes: ordered by difficulty or random; difficulty filter; shortcuts 1–5 / A–E answer, Enter next | Owner |
| D9 | State in `localStorage`: progress X/N, accuracy overall and per difficulty, review-wrong mode, reset, theme, language, mode | Owner |
| D10 | Navbar: dark/light toggle, EN/PT-BR switch | Owner |
| D11 | Cookieless analytics (Plausible or Umami), env-configured, off by default | Owner |
| D12 | vukem renders pages and htmx fragments; Tailwind CSS v4; minimal TypeScript for state | Owner |
| D13 | **htmx 4.0.0**: stable since 2026-08-28 (GitHub release not marked pre-release). npm's `latest` dist-tag still points at 2.0.11 (2.x maintenance line) and 4.0.0 sits under `next`, so always install by exact version. Vendored at `resources/public/vendor/htmx-4.0.0/htmx.min.js` (versioned path, served immutable) (SHA-256 `e484d917…593f`, identical to the npm tarball) | Verified 2026-10-17 |
| D14 | vukem pinned by exact tag (no `replace`), bumped by the [framework bump flow](#framework-bump-flow) | Owner |
| D15 | Bun for all JS tooling; Vite 8 + `@tailwindcss/vite` as in the vukem starter, to exercise `vukem/vite` | Owner + battle-test |
| D16 | Git hooks with lefthook (installed by `bun install`), not `.githooks`: same tool as the framework, cross-platform | Lead |
| D17 | Since vukem v0.24.0 routes use `vukem.DefaultMiddlewareWith(..., MiddlewareOptions{Stateless: true})` (no sessions/cookies, Origin-only CSRF, maintenance mode, proxy settings from env) with `CSPSources` for the analytics origin, plus static files, rate limit, 16 KiB body cap and gzip | Lead |
| D18 | Server is stateless. The page embeds a question index (ids + difficulty) as JSON; the client builds the queue (mode, filter, review-wrong) and fetches fragments by id | Lead |
| D19 | Answer check is `GET` (idempotent, no state change, no CSRF surface) | Lead |
| D20 | Locale comes from `?lang=` (the client adds it from `localStorage`), then `Accept-Language`, then `en`; cookie and session sources are off (`MiddlewareOptions.I18n` order query, header) | Lead |
| D21 | Runtime image `alpine:3.24.2` with a non-root user (UID 65532), so `HEALTHCHECK` can use busybox `wget` | Lead |
| D22 | Hosting on Railway, Dockerfile builder, healthcheck `/up` (`railway.json`) | Owner |
| D23 | `.editorconfig`: tabs size 4 everywhere except YAML (spec forbids tabs) and Markdown (markdownlint 2-space lists) | Owner + format constraints |
| D24 | `.claude/settings.local.json` (`disableAllHooks: true`) is a per-developer file, git-ignored | Owner |
| D25 | `RATE_LIMIT_PER_MINUTE` (default 120 per IP) so CI e2e/DAST, which share one IP, can raise it | Lead |
| D28 | Railway trusts its edge: production logs showed `peer` addresses 100.64.0.1 to 100.64.0.7, so the quiz service sets `TRUSTED_PROXIES=100.64.0.0/24`, `CLIENT_IP_HEADER=X-Real-IP` and `TRUST_FORWARDED_PROTO=true` (owner approved on 2026-10-17), and `RATE_LIMIT_PER_MINUTE=120` per visitor. Railway does not document the range: if the edge moves outside it, the client IP falls back to the edge address (stricter limits, never spoofable). `HSTS_FORCE=true` stays as a belt-and-braces setting | Lead, vukem docs deployment/docker-and-railway |
| D29 | Production binary built with the `vukem_nosqlite` tag from `.buildtags` (no database; 18.1 MB → 14.3 MB) | Lead |
| D26 | Bank status 2026-10-17: 133 questions in 7 shards (very-easy 24, easy 31, medium 30, hard 24, very-hard 24), all EN + PT-BR; source links checked with `-tags=links`; technical + PT-BR review done (every snippet run on Go 1.27, no correct answer changed, factual fixes noted in the `fix(questions): review …` commits) | Lead |
| D27 | `@axe-core/playwright` 4.14.0 (dev dependency, owner-approved via the coordinator) gates serious/critical accessibility violations in e2e | Owner |

## Stack (exact versions, verified 2026-10-17)

| Piece | Version | Notes |
| --- | --- | --- |
| Go | 1.27.2 | `go.mod` |
| vukem | v0.28.0 | `go.mod`; CLI in the dev image |
| htmx | 4.0.0 | vendored |
| Tailwind CSS / `@tailwindcss/vite` | 4.3.3 | CSS-first config |
| Vite | 8.3.4 | |
| TypeScript | 7.0.2 | `bun run typecheck` |
| Bun | 1.4.3 | `packageManager`, `oven/bun:1.4.3-alpine` |
| Playwright | 1.64.1 | `@playwright/test` |
| golangci-lint | v2.15.0 | local + CI |
| govulncheck | v1.9.0 | `go tool govulncheck` |
| lefthook | 2.2.2 | npm package |
| markdownlint-cli2 | 0.23.3 | |
| commitlint | 21.2.3 | cli + config-conventional |
| Docker images | `golang:1.27.2-alpine3.24`, `oven/bun:1.4.3-alpine`, `alpine:3.24.2`, `zaproxy/zap-stable:2.17.0` | never `latest` |
| Nuclei | v3.11.1 | `projectdiscovery/nuclei-action@v3.1.0` |
| GitHub Actions | checkout v7.0.1, setup-go v7.0.0, setup-bun v2.2.0, golangci-lint-action v9.3.0, upload-artifact v7.0.2, download-artifact v8.0.2, setup-buildx v4.4.1, build-push v7.4.0, login v4.6.0, metadata v6.2.0, zap baseline v0.15.0, action-gh-release v3.0.3 | |

## Architecture

### Folder layout

```text
cmd/app/main.go              binary entry: vukem.Main(bootstrap.New)
bootstrap/app.go             vukem.New: views, Vite, routes (later: translations, question bank)
routes/web.go                middleware stack + routes
app/controllers/             quiz handlers
internal/quiz/               question model, loader, validation, shuffling (Phase Q/U)
internal/quiz/data/questions/ <topic>.json shards (embedded), any difficulty mix
resources/views/             layouts/app.html, quiz/*.html (page + fragments as blocks)
resources/lang/              en.json, pt-BR.json (UI strings, vukem i18n)
resources/css/app.css        Tailwind v4 entry (@theme tokens, dark variant)
resources/js/app.ts          client state: localStorage, queue, shortcuts, theme
resources/public/            static files (vendored htmx, robots.txt); build/ is Vite output
tests/                       Go HTTP tests (vukemtest) + security abuse suite
e2e/                         Playwright specs (smoke, quiz flow, a11y, mobile)
docs/                        qa-checklist.md, questions-style-guide.md
.github/workflows/           ci.yml, release.yml
```

### Question JSON schema

Files `internal/quiz/data/questions/<topic>.json` (one shard per topic, so writers do not conflict), each an array:

```json
{
  "id": "maps-nil-write",
  "difficulty": "easy",
  "tags": ["maps"],
  "code": "var m map[string]int\nm[\"a\"] = 1",
  "question": { "en": "What happens when this code runs?", "pt-BR": "O que acontece quando este código roda?" },
  "explanation": { "en": "…", "pt-BR": "…" },
  "alternatives": [
    { "id": "a", "correct": true, "text": { "en": "…", "pt-BR": "…" } },
    { "id": "b", "text": { "en": "…", "pt-BR": "…" }, "why": { "en": "…", "pt-BR": "…" } }
  ],
  "sources": [
    { "title": "The Go Programming Language Specification — Map types", "url": "https://go.dev/ref/spec#Map_types", "kind": "spec" }
  ]
}
```

Rules enforced at boot (fail to start) and by `internal/quiz` tests: `id` unique, kebab-case; `difficulty` in the 5 values; exactly 5 alternatives with ids `a`–`e`, exactly one `correct`; every wrong alternative has `why`; `question`, `explanation`, every `text`/`why` present and non-empty in `en` and `pt-BR`; 1–3 sources with `https://` URLs and a `kind` in `spec|faq|effective-go|memory-model|doc|blog|reddit|forum|video|talk|article|book|source-code|issue`; alternatives must differ after case/space folding; question text + code must be unique across the bank (`go run ./internal/tools/quizcheck [shard...]` checks shards in isolation); `code` optional (rendered escaped in `<pre><code>`).

### Routes

| Method | Path | Response |
| --- | --- | --- |
| GET | `/` | full page; first question of the default queue (ordered, very-easy first) |
| GET | `/questions/{id}` | full page for direct links; the `question` block for htmx requests (`web.Block`) |
| GET | `/questions/{id}/answers/{alt}` | htmx only: explanation card + OOB swap of the locked alternatives + `HX-Trigger: quiz:answered` |
| GET | `/up` | health (vukem) |
| GET | `/js/*`, `/build/*`, `/robots.txt` | static (immutable cache for `/build`) |

All accept `?lang=en|pt-BR`. Unknown ids/alternatives → 404 page/fragment; anything else → 405/404.

### Request flow and htmx ↔ localStorage

1. `GET /` renders the layout, the first question, an empty explanation card, and `<script type="application/json" id="quiz-index">` with `[{id, difficulty}]` (rendered with the `json` func, no inline JS, CSP-safe).
2. `app.ts` reads `localStorage` (`quiz:v1:*` keys: settings `{theme, lang, mode, difficulties}`, progress `{answered: {id: {alt, correct, at}}}`), builds the queue (ordered by difficulty or shuffled; filtered; or only wrong answers in review mode) and, if the rendered question is not the next one, loads it with `htmx.ajax("GET", "/questions/{id}?lang=…", "#question")`.
3. The question fragment lists 5 alternatives shuffled server-side (`math/rand/v2`) each time, each a `<button hx-get="/questions/{id}/answers/{alt}" hx-target="#explanation">`.
4. The answer response renders the explanation card (correct/incorrect, explanation, why each wrong option is wrong, sources) and an `hx-swap-oob` replacement of the alternatives with disabled, colour-coded buttons (the lock). `HX-Trigger: {"quiz:answered": {"id", "alt", "correct", "difficulty"}}` lets `app.ts` update stats.
5. "Next" (button or Enter) is handled by `app.ts`: next id from the queue → step 2's `htmx.ajax`, plus `history.pushState` to `/questions/{id}`.
6. Shortcuts: `1`–`5` / `A`–`E` click the n-th alternative, `Enter` next; ignored while focus is in a form field.
7. Theme sets `<html data-theme>` (Tailwind `dark:` custom variant); a tiny inline script in `<head>` carrying the per-request CSP nonce applies it before paint (no flash, no render-blocking request).
8. Language switch saves to `localStorage` and reloads the current question with `?lang=`.

### Analytics

`ANALYTICS_PROVIDER` (`plausible` | `umami` | empty = off), `ANALYTICS_SCRIPT_URL`, `ANALYTICS_SITE_ID`. When on, the layout adds the provider script (nonce'd, `defer`) and the CSP gains the script origin in `script-src` and `connect-src`. Both providers are cookieless; no consent banner needed. Config is validated at boot (`https` URL, known provider).

## Engineering rules

- [AGENTS.md](AGENTS.md) holds the commands; `.claude/rules/` holds the path-scoped rules.
- TDD: failing test first; table-driven Go tests; Playwright for flows.
- Conventional Commits (commitlint), SemVer tags, [Keep a Changelog](CHANGELOG.md).
- Exact dependency versions only (no `^`/`~`, no `latest`/`next`/beta/rc); new dependencies need the owner's approval.
- Validate with lint + the affected tests locally; GitHub Actions is the gate (`gh run list` after every push).
- Never edit `../vukem/`; framework issues go to `../framework-feedback/quiz.md`.

## Security checklist

Each item has a test (`tests/security_test.go`, e2e or CI scan) before release.

- [x] Strict CSP with per-request nonce (vukem `SecureHeaders`), no inline scripts/styles/handlers in views
- [x] `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP
- [x] HSTS in production behind Railway's TLS proxy (sent unconditionally in production with an https `APP_URL`, see D28)
- [x] Rate limit per IP on every route except `/up` (vukem `ratelimit`), correct client IP behind the proxy
- [x] Request body cap (16 KiB)
- [x] Only `GET`/`HEAD` on quiz routes (405 otherwise)
- [x] Params allowlisted: question id, alternative `a`–`e`, `lang`; XSS payloads in params never reflected
- [x] Path traversal on static files and ids rejected (`../`, encoded variants)
- [x] Oversized URLs/headers rejected (server limits)
- [x] No cookies set on any response (cookieless by design)
- [x] Question content rendered escaped; JSON index via the `json` func
- [x] Error pages without stack traces in production
- [ ] Container runs as non-root, read-only filesystem friendly
- [x] govulncheck, ZAP baseline and Nuclei clean in CI

## Phases

### F — Foundation

#### F.1 Repository tooling

- [x] F.1.1 `.editorconfig` (tabs 4), `.gitattributes`, `.gitignore` (incl. `.claude/settings.local.json`) → verify: `git check-ignore .claude/settings.local.json`
- [x] F.1.2 `package.json` with exact versions, Bun lockfile → verify: `bun install --frozen-lockfile`
- [x] F.1.3 golangci-lint v2 config adapted from vukem → verify: `golangci-lint run ./...` = 0 issues
- [x] F.1.4 markdownlint-cli2 config → verify: `bunx markdownlint-cli2`
- [x] F.1.5 commitlint config (Conventional Commits) → verify: `echo "bad msg" | bunx commitlint` fails
- [x] F.1.6 lefthook: pre-commit (fmt, lint, mod tidy, markdownlint, typecheck), commit-msg (commitlint), pre-push (vet, tests) → verify: `bunx lefthook run pre-commit`

#### F.2 Docs and agent setup

- [x] F.2.1 PLAN.md, AGENTS.md, CLAUDE.md, README.md → verify: markdownlint passes
- [x] F.2.2 LICENSE (MIT), CONTRIBUTING.md, SECURITY.md, CHANGELOG.md → verify: files present, markdownlint passes
- [x] F.2.3 `.claude/skills` (from vukem) and project `.claude/rules` → verify: `ls .claude/skills .claude/rules`

#### F.3 Minimal app

- [x] F.3.1 vukem v0.21.1 app: `/up`, `/` renders the empty 2-column quiz grid → verify: `go test ./...`
- [x] F.3.2 Tailwind v4 + Vite via Bun, htmx 4 vendored and loaded under the CSP → verify: `bun run build`, e2e smoke has no console errors
- [x] F.3.3 Playwright config + smoke spec (desktop + mobile) → verify: `bun run test:e2e`

#### F.4 Docker and hosting config

- [x] F.4.1 Multi-stage Dockerfile (assets, dev, build, runtime non-root) → verify: `docker compose --profile prod up -d --build prod && curl localhost:8080/up`
- [x] F.4.2 `compose.yaml` dev: `vukem serve` (polling reload) + Vite dev server → verify: `docker compose up -d && curl localhost:3000/up`
- [x] F.4.3 `railway.json` (Dockerfile builder, healthcheck `/up`) → verify: file reviewed; deploy in phase D

#### F.5 CI/CD

- [x] F.5.1 `ci.yml`: lint (golangci, mod tidy, markdownlint, typecheck, commitlint), test (race + coverage), govulncheck, build, e2e against the built binary, Docker + smoke + ZAP baseline (rules in `.zap/rules.tsv`) + Nuclei → verify: `gh run list` green (run 39035362404)
- [x] F.5.2 `release.yml`: on `v*.*.*` tag push the image to GHCR and create the GitHub release from CHANGELOG → verify: first tag in phase R
- [x] F.5.3 Dependabot (gomod, bun, actions, docker) → verify: file present

### Q — Question bank (research)

#### Q.1 Engine for the bank

- [x] Q.1.1 `internal/quiz`: types + `Load(fs.FS)` + `Validate` with every schema rule → verify: `go test ./internal/quiz/...` (table of invalid fixtures in `testdata/`)
- [x] Q.1.2 Bank loaded in `bootstrap` and passed to controllers; invalid bank aborts boot → verify: test boots with a broken fixture and expects an error
- [x] Q.1.3 `docs/questions-style-guide.md`: tone, length, code snippet rules, PT-BR terminology (keep Go terms in English: goroutine, channel, slice), source priorities → verify: markdownlint

#### Q.2 Research and writing (batches of 10, each with sources)

Topics to cover: basics/types, zero values, strings/runes/bytes, slices (len/cap/append aliasing), maps, structs/embedding, methods/receivers, interfaces (nil interface, type assertions, type sets), errors (wrapping, `errors.Is/As`, `AsType`), defer/panic/recover, closures and loop variables (Go 1.22 semantics), goroutines, channels, select, `sync` (Mutex, WaitGroup, Once, `WaitGroup.Go`), `context`, memory model/data races, generics, iterators (`range over func`), packages/modules/`go.mod`/MVS, `init` order, testing (table tests, `t.Parallel`, fuzzing, `synctest`, benchmarks `b.Loop`), escape analysis/GC, runtime/scheduler (GMP), `unsafe`, reflection, `net/http`, `encoding/json`, tooling (`go vet`, race detector, pprof).

- [x] Q.2.1 very-easy batch 1 (10) → verify: schema test green, every source URL returns 2xx/3xx (`go test -tags=links ./internal/quiz/...`)
- [x] Q.2.2 very-easy batch 2 (10) → verify: same
- [x] Q.2.3 easy batch 1 (10) → verify: same
- [x] Q.2.4 easy batch 2 (10) → verify: same
- [x] Q.2.5 medium batch 1 (10) → verify: same
- [x] Q.2.6 medium batch 2 (10) → verify: same
- [x] Q.2.7 medium batch 3 (10) → verify: same
- [x] Q.2.8 hard batch 1 (10) → verify: same
- [x] Q.2.9 hard batch 2 (10) → verify: same
- [x] Q.2.10 very-hard batch 1 (10) → verify: same
- [x] Q.2.11 very-hard batch 2 (5+) → verify: total ≥ 105, every difficulty ≥ 15
- [x] Q.2.12 Technical review pass: every correct answer re-checked against the spec/docs for Go 1.27 → verify: review notes in the PR/commit body
- [x] Q.2.13 PT-BR review pass (terminology, accents, natural phrasing) → verify: spot-check 20 questions in the UI

### U — Quiz UI

#### U.1 Server side

- [x] U.1.1 i18n: `resources/lang/{en,pt-BR}.json`, `vukem.WithTranslations`, `i18n.Middleware` with cookie/session sources off → verify: test `?lang=pt-BR` renders PT-BR UI strings, `Accept-Language` fallback
- [x] U.1.2 `GET /questions/{id}` page + fragment (`web.Block("question")`), alternatives shuffled per request → verify: HTTP tests (full vs `HTMX()` fragment, order varies across requests, 404 unknown id)
- [x] U.1.3 `GET /questions/{id}/answers/{alt}`: explanation card, OOB lock, `HX-Trigger` → verify: tests (`AssertFragment`, `AssertHXTrigger("quiz:answered")`, 404 for bad alt)
- [x] U.1.4 Question index JSON in the page → verify: test parses `#quiz-index` and checks count and order
- [x] U.1.5 Middleware: rate limit (memory, per IP, `/up` exempt), `TrustedProxies`/`TrustForwardedProto` from env for Railway, method allowlist → verify: security tests
- [x] U.1.6 Analytics config + CSP origin → verify: tests for off (no script), plausible, umami, invalid config boot error

#### U.2 Client side

- [x] U.2.1 `app.ts` storage module: versioned keys, guarded parse, reset → verify: Playwright test with corrupted storage still loads
- [x] U.2.2 Queue: ordered/random, difficulty filter, review-wrong mode → verify: e2e for each mode
- [x] U.2.3 Answer flow: lock, explanation, stats update, Next, deep links/back button → verify: e2e full run of 5 questions
- [x] U.2.4 Keyboard shortcuts (1–5, A–E, Enter) with visible hints → verify: e2e keyboard-only run
- [x] U.2.5 Navbar: theme toggle (no flash), language switch, progress X/N, accuracy overall + per difficulty, reset with confirm → verify: e2e
- [x] U.2.6 Responsive layout (2 columns ≥ md, 1 column mobile), focus styles, `aria-live` explanation → verify: e2e mobile project + axe scan
- [x] U.2.7 Visual pass against the reference UX in both themes → verify: screenshots attached to the commit/PR

### T — Tests and QA

- [x] T.1 Unit: `internal/quiz` (load, validate, shuffle, queue helpers) → verify: coverage ≥ 85% for the package
- [x] T.2 Integration: HTTP tests for every route × locale → verify: `go test ./tests/...`
- [x] T.3 E2E: smoke, flows, modes, shortcuts, theme, i18n, mobile → verify: CI e2e green
- [x] T.4 Smoke script against any URL (`scripts/smoke.sh <url>`): `/up`, `/`, a question, an answer → verify: run against Docker and production
- [x] T.5 OWASP abuse suite: XSS in params, security headers, CSP, rate limit (429 + `Retry-After`), path traversal, oversized requests, wrong methods, no cookies → verify: `go test -run TestSecurity ./tests/...`
- [x] T.6 `docs/qa-checklist.md`: exploratory QA checklist (browsers, keyboard, screen reader, slow 3G, storage disabled, both languages/themes) and one documented run → verify: checklist committed with results
- [x] T.7 Accessibility: axe in Playwright, zero serious/critical → verify: CI
- [x] T.8 Lighthouse ≥ 95 performance/accessibility/best practices on mobile → verify: report saved (2026-10-17: 100/100/100/100 from a clean CI runner, `Lighthouse` workflow run 39048889814; see docs/qa-checklist.md)
- [x] T.9 Gate DAST results: Nuclei findings (medium+) fail the job (JSONL export + check), revisit the ZAP `90004` COEP rule in `.zap/rules.tsv` → verify: a planted header regression fails CI (2026-10-17: run 39046905131 on a throwaway branch dropping X-Frame-Options/X-Content-Type-Options failed `test` and `docker-dast` via `scripts/smoke.sh`)

### D — Deploy

- [x] D.1 Railway project + service from GitHub (Dockerfile), env vars set → verify: Railway deploy healthy
- [x] D.2 Custom domain `quiz.vukem.dev` (CNAME) + TLS → verify: `curl -I https://quiz.vukem.dev/up` (200 with HSTS, 2026-10-17)
- [ ] D.3 HSTS and real client IP behind Railway confirmed → verify: headers + rate-limit test against production (low volume)
- [ ] D.4 Analytics enabled with the owner's site id → verify: event visible in the dashboard
- [ ] D.5 Smoke + ZAP baseline against production → verify: CI manual workflow run

### R — Release

- [ ] R.1 `v1.0.0`: CHANGELOG section, tag, release workflow green, GHCR image → verify: GitHub release page
- [ ] R.2 Final framework bump to vukem 1.0 → verify: [framework bump flow](#framework-bump-flow)

## Developer actions (owner to-do)

- [ ] Railway: create the project/service linked to this repo (or give access so the agent can use the Railway CLI/MCP); set `APP_KEY` (`openssl rand -base64 32`, prefixed `base64:`), `APP_URL=https://quiz.vukem.dev`, `APP_ENV=production`; Railway sets `PORT`.
- [ ] DNS: `CNAME quiz.vukem.dev → <service>.up.railway.app` (value shown by Railway when adding the custom domain).
- [ ] Analytics: choose Plausible or Umami and provide `ANALYTICS_PROVIDER`, `ANALYTICS_SCRIPT_URL`, `ANALYTICS_SITE_ID` (Plausible: domain; Umami: website UUID).
- [ ] GitHub: enable GHCR package visibility (public) after the first release; optionally branch protection on `main` requiring CI.
- [x] Railway trusted proxy range: log the peer address of a few production requests (Railway logs) and, if a stable narrow range shows up, set `TRUSTED_PROXIES` to it with `CLIENT_IP_HEADER=X-Real-IP` and `TRUST_FORWARDED_PROTO=true`, then lower `RATE_LIMIT_PER_MINUTE` (D28).

## Definition of Done

- The task's `→ verify:` passes locally and in CI (`gh run list` green).
- Lint (golangci, markdownlint, typecheck) clean; no skipped tests, no `nolint` without explanation.
- CHANGELOG `[Unreleased]` updated for user-visible changes; PLAN.md box ticked.
- New framework findings recorded in `../framework-feedback/quiz.md`.
