---
paths:
  - "**/*_test.go"
  - "e2e/**"
  - "**/testdata/**"
---

# Testing rules

- Write the failing test first, then the code (`tdd` skill).
- Go: table-driven tests, `t.Run` subtests, `t.Parallel()`; stdlib + `go-cmp` only, no testify.
- HTTP tests boot the real app: `vukemtest.New(t, bootstrap.New)` and the fluent client (`AssertOK`, `AssertSee`, `HTMX()`, `AssertFragment`).
- The question bank has a schema test (`internal/quiz`): unique ids, 5 alternatives, exactly 1 correct, EN and PT-BR present, at least one `https` source.
- Security abuse cases live in `tests/security_test.go` as `TestSecurity_<Area>_<Behaviour>`.
- E2E: Playwright in `e2e/`, `data-testid` selectors, no `waitForTimeout`; run with `bun run test:e2e`.
- No network in Go tests; time-dependent code uses `testing/synctest`.
