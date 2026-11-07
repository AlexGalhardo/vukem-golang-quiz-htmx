# Security audit, 2026-11-07

Target: `vukem-quiz` at branch `build/vukem-v0.39.0`.
Method: the vendored Cloudflare `security-audit` skill (`.claude/skills/security-audit`), full audit mode, profile `quick`.

Machine-readable records: [findings](security-audit-2026-11-07.findings.json), [coverage ledger](security-audit-2026-11-07.coverage.json).

## Scope and coverage statement

Partial coverage by design. Profile `quick`: one reviewer, coarse ledger units (4), one hunting pass, no follow-up waves. Source review only; no live endpoints were probed and no dependency was added. Scanners: `go tool govulncheck ./...` (0 reachable vulnerabilities).

In scope: the stateless quiz routes (question, answer, review), the review `items` and `order` parsing, `richText` escaping, rate limit and body cap, secure headers, Dockerfile and the GitHub workflows.

Not reviewed in depth: the question bank content, the Vue-free client scripts under `resources/js`, the Lighthouse job and the vukem framework itself.

## Summary

| Severity | Confirmed | Needs validation | Rejected |
| --- | --- | --- | --- |
| Critical | 0 | - | - |
| High | 0 | - | - |
| Medium | 0 | - | - |
| Low | 1 | - | - |
| Informational | 1 | - | - |
| Unrated | - | 0 | 2 |


## Findings

### SA-001 Workflow checkouts persist the GitHub token (informational)

- Fingerprint: `vukem-quiz:ci:checkout-persists-credentials`
- CWE: CWE-522 (insufficiently protected credentials)
- Location: `.github/workflows/ci.yml:26`, `release.yml:15`
- Impact: The job token stays in `.git/config` while later steps run repository code. Token scope is limited by each workflow's `permissions`.
- Fix: `persist-credentials: false` on every checkout. Status: fixed in `d211ed7`.

### SA-002 Third-party Actions pinned by tag (low)

- Fingerprint: `vukem-quiz:ci:actions-pinned-by-tag`
- CWE: CWE-829 (inclusion of functionality from an untrusted control sphere)
- Location: `.github/workflows/ci.yml`, `lighthouse.yml`, `release.yml`
- Impact: A moved upstream tag would run attacker code with the job token; release workflows hold `packages: write`.
- Fix: Every `uses:` is pinned to a commit SHA with the tag in a comment. Status: fixed in `abf032c`.

## Rejected after validation

- `vukem-quiz:review:html-injection`: No request input reaches the markup.
- `vukem-quiz:review:resource-exhaustion`: Bounded work per request.

Hardening notes, not findings: `compose.yaml` publishes the app, Vite and production ports on all interfaces; no datastore or credential is involved, so it is not a finding.

## Verification

Findings and ledger passed the skill validators (`validate-findings.cjs`: 4 records; `validate-coverage-ledger.cjs`: 4 units), run on Windows Node with a preload shim for the missing POSIX no-follow constants. The skill's own CLI tests fail 7 cases on Windows for the same reason, as in `vukem-email`.
