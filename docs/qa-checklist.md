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

- [ ] `scripts/smoke.sh https://vukem-quiz.up.railway.app` passes
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
