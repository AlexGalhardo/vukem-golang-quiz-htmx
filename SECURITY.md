# Security Policy

## Supported versions

Only the latest release and the deployment at <https://quiz.vukem.dev> receive fixes.

## Reporting a vulnerability

Please do not open a public issue. Report privately through [GitHub Security Advisories](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/security/advisories/new) with steps to reproduce and the impact you observed. You will get an answer within 7 days.

## Scope and design

- No accounts, no database, no cookies: quiz progress stays in the visitor's browser (`localStorage`).
- Defences: strict nonce-based CSP, security headers, per-IP rate limiting, request size limits, allowlisted parameters, escaped rendering.
- CI runs govulncheck, golangci-lint (gosec), an OWASP abuse test suite, a ZAP baseline scan and Nuclei against the built container.
- Framework-level issues are reported upstream to [vukem](https://github.com/AlexGalhardo/vukem).
