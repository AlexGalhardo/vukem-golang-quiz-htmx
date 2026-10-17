---
paths:
  - "**/*.go"
---

# Go rules

- Format with `golangci-lint fmt`, lint with `golangci-lint run ./...` before finishing.
- `context.Context` is the first parameter of any function doing I/O; never store it in a struct.
- Wrap errors with context: `fmt.Errorf("load questions: %w", err)`. Inspect with `errors.Is` / `errors.AsType`.
- No package-level mutable state, no `init()` registration. The question bank is loaded once in `bootstrap` and passed down.
- Handlers are `func(c *web.Ctx) error`; middleware is `func(http.Handler) http.Handler`.
- Stdlib and vukem first. New Go dependencies need the owner's approval.
- Use modern Go (1.27): `for i := range n`, `min`/`max`, `errors.AsType`, `t.Context()`, `math/rand/v2` for shuffles.
- Windows 11 is a first-class dev OS: `filepath` for OS paths, no cgo, no `sh` in code paths.
- Comment only the *why*.
- A framework bug or gap gets a local workaround with a comment pointing at `framework-feedback/quiz.md`, never a fork or `replace`.
