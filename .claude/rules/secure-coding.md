---
paths:
  - "**/*.go"
  - "resources/**"
---

# Security rules

- Secure by default, fail closed. The security checklist in PLAN.md is the contract; every item has a test.
- HTML only through `html/template`; never wrap question text or user input in `template.HTML`. Code samples in questions are escaped text inside `<pre><code>`.
- Validate every query/path param against an allowlist (question ids, difficulty names, locales); unknown values are 404/400, never echoed raw.
- No cookies, no sessions, no PII. Analytics is cookieless and off unless configured.
- CSP stays nonce-based; the only extra origin allowed is the analytics script host from `ANALYTICS_SCRIPT_URL`.
- Rate limit every route except `/up`; cap request bodies; GET only for quiz routes.
- Client-facing errors never include stack traces, paths or config. Never log secrets (`config.Secret`).
- Load the `golang-security` skill for changes in routes, middleware or rendering.
