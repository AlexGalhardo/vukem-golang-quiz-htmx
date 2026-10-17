# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project foundation: vukem v0.21.1 app with the `/up` health check and the empty two-column quiz page (Tailwind CSS v4 via Vite, htmx 4.0.0 vendored, strict CSP).
- Tooling: Bun, golangci-lint v2, markdownlint-cli2, commitlint, lefthook git hooks, `.editorconfig` with tabs.
- Docker: multi-stage Dockerfile (non-root runtime) and `compose.yaml` for development (`vukem serve` + Vite) plus a production profile.
- CI/CD: lint, race tests, govulncheck, build, Playwright e2e, Docker smoke test, ZAP baseline and Nuclei scans; release workflow publishing the image to GHCR.
- Docs: PLAN.md, AGENTS.md, CLAUDE.md, README, CONTRIBUTING, SECURITY, MIT license; Claude Code skills and rules.

[Unreleased]: https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commits/main
