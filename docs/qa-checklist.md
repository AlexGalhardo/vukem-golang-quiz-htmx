# QA checklist

Exploratory checks that complement the automated suites (`go test ./...`, `bun run test:e2e`, axe, ZAP, Nuclei). Run it before a release and after big UI changes. Record each run at the bottom.

## Checklist

### Browsers and devices

- [ ] Chromium desktop: full flow (answer, Next, Back, settings, reset)
- [ ] Firefox desktop: same flow
- [ ] WebKit/Safari desktop: same flow
- [ ] Mobile (Android Chrome, iPhone Safari): one column, no horizontal scroll, tap targets usable

### Keyboard and assistive technology

- [ ] Keyboard only: `1`–`5`, `A`–`E` answer, `Enter` goes next, `Tab` reaches every control with a visible focus ring
- [ ] Settings panel closes with `Escape` and on an outside click; shortcuts are ignored while a setting has focus
- [ ] Screen reader (NVDA or VoiceOver): question heading announced after Next, explanation read through `aria-live`

### Network and storage

- [ ] Slow 3G: first question usable, answer card appears without layout jumps
- [ ] `localStorage` disabled or throwing: the quiz still works for the visit, no page errors
- [ ] Corrupted `quiz:v1` value: defaults are used

### Content, languages and themes

- [ ] EN and PT-BR: UI strings, question text, alternatives, explanations, sources
- [ ] Light and dark: contrast, code blocks, correct/wrong colours; no theme flash on reload
- [ ] Deep link `/questions/<id>` and unknown id (404 page with a way back)

### Production

- [ ] `scripts/smoke.sh https://quiz.vukem.dev` passes
- [ ] Analytics script loads (no CSP violation in the console), no cookies set
- [ ] Lighthouse mobile ≥ 95 in performance, accessibility, best practices

## Runs

### 2026-10-17 (lead agent, main at `213fef8`)

| Check | Result |
| --- | --- |
| Chromium desktop + Pixel 7 (CI projects) | Pass: full e2e (60 tests) plus axe on every state, light/dark × EN/PT-BR, 3 repeats without flakes |
| Firefox desktop (Playwright 1.64.1) | Pass except "theme defaults to the OS preference": Playwright's Firefox ignores the `prefers-color-scheme` emulation (`matchMedia` stays `false` even with `colorScheme: "dark"`); the toggle and the stored theme work |
| WebKit desktop + iPhone 15 (Playwright) | Pass after the e2e `next` helper waits for the new question id (WebKit cleared the card before the swap finished). The iPhone layout run correctly shows one column; the two-column assertion is keyed to the CI `mobile` project name |
| Keyboard only | Pass (e2e shortcut tests + manual check of focus rings) |
| Screen reader | Not run (no screen reader in the agent environment); `aria-live` and heading focus are covered by e2e and axe |
| Slow 3G (400 ms latency, 50 KB/s) | Pass: page load 2.9 s, answer card 0.9 s |
| `localStorage` throwing on access | Pass: answer and Next work, no page errors |
| Corrupted storage | Pass (e2e) |
| EN/PT-BR, light/dark | Pass; screenshots in [`docs/screenshots/`](screenshots/) |
| `scripts/smoke.sh` against production | Pass |
| Analytics in production | Pass: Umami script 200, no console/CSP errors, no cookies |
| Lighthouse mobile (13.5.0, production) | Local machine: 89 (its antivirus injects a render-blocking script; not representative). Clean CI runner via the `Lighthouse` workflow, 3 runs each: before (run 39047883407) performance 96/100/100, best practices 96 (`/favicon.ico` 404); after inlining the nonce'd theme bootstrap, immutable vendored htmx and an SVG favicon (run 39048889814) 100/100/100/100 in every run (FCP 0.9–1.0 s, LCP 1.1–1.6 s, TBT ≤ 30 ms, CLS 0) |

### 2026-10-17 (lead agent, main at `f4d014b`: theme radiogroup, settings panel/sheet, History, Review)

| Check | Result |
| --- | --- |
| e2e + axe (chromium + Pixel 7), production binary | 90 passed: theme radiogroup (arrow keys, live system), settings dialog (44px targets, Escape, backdrop, focus return) and 375px bottom sheet, history (in progress, stopped early, completed, inline clear), review (badge, redo until right, session-only), axe on every panel in light/dark × EN/PT-BR |
| Client unit tests (`bun run test:unit`) | 9 passed (history storage/runs, review session) |
| Production smoke + HSTS | Pass on <https://quiz.vukem.dev> |
| Lighthouse mobile, clean runner (run 39068988695) | 100/100/100/100 in runs 2 and 3; run 1 performance 81 (TBT 720 ms on the first, cold run) |
| Screenshots (production, light/dark × desktop/mobile: answered, settings, history, review) | [`docs/screenshots/`](screenshots/) |

## Automated human-like QA suite

`bun run test:qa` (`e2e/qa`, `playwright.qa.config.ts`) runs the crawler, human-like flows and defensive security checks below on desktop and Pixel 7, starting two local apps (one with a 5 requests/minute limit for the 429 check). CI runs it in the `qa` job. Read-only against a deployment (GET only, one worker, write/load checks skipped): `QA_BASE_URL=https://quiz.vukem.dev QA_READONLY=1 bun run test:qa --project=desktop`.

- Crawler (`crawler.spec.ts`): every page reachable from `/` plus the first, middle and last question and a missing one, in light/dark × EN/PT-BR; status codes, uncaught errors, console errors, CSP violation events, broken images, external links (`https`, `rel=noopener` with `target=_blank`), axe serious/critical, a visible focus ring on every tab stop; then every navbar, toolbar and theme control, every control inside the panels they open, and every shortcut style (`1`–`5`, `a`–`e`, `A`–`E`, Enter).
- Flows (`flows.spec.ts`, local only): full ordered runs of each difficulty and a random run (each question once, finished card, history entry), reset mid-run, back/forward, reload mid-question, double clicks and key mashing, corrupted and blocked `localStorage`/`sessionStorage`, very long and odd query strings, unknown routes and traversal paths.
- Security (`security.spec.ts`): headers on pages, fragments, static files, errors and `/up` (CSP with a fresh nonce and no `unsafe-*`, `frame-ancestors 'none'`, HSTS on https, nosniff, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, no cookies, no stack-revealing `Server`); marker payloads in query strings and storage never execute or reflect raw; quiz routes answer 405 to POST/PUT/PATCH/DELETE, cross-origin and with `_method`; 429 with `Retry-After` and `RateLimit-*`, `/up` exempt.

Checks for open framework bugs use `test.fail(...)`: they pass while the bug exists and fail once vukem fixes it, which is the signal to drop the marker.

### 2026-10-17 run

- Local: 60 tests × 2 projects, 4 repeats: 208 passed, 0 flaky (after QA-F1 and the QA-F4 retry); the 2 `test.fail` checks hold.
- Production, read-only: 11 passed, 20 skipped.

### Findings

| ID | Severity | Kind | Finding | Status |
| --- | --- | --- | --- | --- |
| QA-F1 | serious (a11y) | app | On phones the `<pre>` code sample scrolls horizontally but is not keyboard-focusable (axe `scrollable-region-focusable`, WCAG 2.1.1), e.g. `/questions/loop-variable-per-iteration-go122` on Pixel 7, both themes and languages. Evidence: `test-results/qa/crawler-*-crawl-*-mobile/`. | Fixed: the block is a focusable, labelled region with a focus ring |
| QA-F2 | low | framework | `POST /` gets vukem's fallback 405 page, whose `<body style="…">` is blocked by vukem's own `style-src` nonce CSP (unstyled page, console CSP violation). `security.spec.ts` "framework error pages respect the CSP" (`test.fail`). | Open, in `framework-feedback/quiz.md` |
| QA-F3 | low (hardening) | framework | A 512 KiB (even 900 KiB) request header gets 200; vukem has no `MaxHeaderBytes` setting, so only Go's 1 MiB default applies. `security.spec.ts` "oversized request headers…" (`test.fail`). | Open, in `framework-feedback/quiz.md` |
| QA-F4 | low | app | A key pressed a few milliseconds after Next (between the htmx swap and the new buttons being wired) was ignored once in 155 scripted runs. | Open; the flows retry the key like a user would. Fix idea: answer through `htmx.ajax` from the key handler |
| QA-F5 | info | platform | Production responses carry `Server: railway-hikari` from Railway's edge; the app itself sends no `Server` header. | Accepted; the check asserts it never names the stack |
