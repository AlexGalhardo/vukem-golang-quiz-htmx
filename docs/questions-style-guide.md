# Question style guide

How to write and source quiz questions. The schema is enforced by `go test ./internal/quiz/...` ([PLAN.md](../PLAN.md#question-json-schema)).

## Where questions live

- One JSON shard per topic in `internal/quiz/data/questions/<topic>.json`, each a JSON array. Tabs for indentation.
- Shard order does not matter: the bank is sorted by difficulty at load time.
- `id`: kebab-case, unique across all shards, describes the concept (`nil-map-write`, `select-default-busy-loop`), never a number.

## Difficulty calibration

| Difficulty | Who answers it | Example |
| --- | --- | --- |
| `very-easy` | read A Tour of Go | zero value of a `string`, `:=` vs `var` |
| `easy` | junior Go developer | writing to a nil map, `len` vs `cap` |
| `medium` | uses Go at work | `append` aliasing, loop variable capture before/after Go 1.22, `defer` argument evaluation |
| `hard` | senior, reads the spec | nil interface holding a nil pointer, unbuffered channel happens-before, method sets and addressability |
| `very-hard` | knows the runtime and memory model | escape analysis outcomes, `sync/atomic` ordering, scheduler preemption, `unsafe` rules, generics type inference corner cases |

## Writing rules

- Test understanding, not trivia: no "which year", no "who created".
- One unambiguous correct answer for **Go 1.27** (current release). If behaviour changed across versions (e.g. loop variables in 1.22), say which version the question targets.
- Code snippets: minimal, `gofmt`-style, tab-indented inside the JSON string (`\t`), no `package main` boilerplate unless it matters. Assume `fmt` is imported.
- "What does this print?" questions: run the snippet (`go run`) and paste the exact output.
- Alternatives: similar length and style, all plausible; avoid "all of the above"/"none of the above". Alternative `a` may be correct: the UI shuffles them.
- `explanation`: why the correct answer is right, 2–5 sentences, may use inline `code`.
- `why` on each wrong alternative: one or two sentences on the specific misconception.
- Markdown is not rendered except inline backticks; no HTML.

## PT-BR

- Natural Brazilian Portuguese, not word-by-word translation.
- Keep Go terms in English, as Brazilian developers use them: goroutine, channel, slice, map, struct, interface, panic, defer, zero value, receiver, method set, deadlock, race condition, garbage collector.
- Code and program output are never translated.

## Sources

- 1–3 per question, each `{title, url, kind}`; `https` only; prefer canonical URLs with anchors (`https://go.dev/ref/spec#Map_types`).
- Priority: Go spec, FAQ, Effective Go, memory model, `pkg.go.dev` docs, the Go blog, Go source/issues; then well-known articles, talks and videos (GopherCon, Dave Cheney, Russ Cox, Ardan Labs, Go Time), Reddit `r/golang` threads and forum answers.
- At least one official source when one exists.
- `kind` is one of: `spec`, `faq`, `effective-go`, `memory-model`, `doc`, `blog`, `reddit`, `forum`, `video`, `talk`, `article`, `book`, `source-code`, `issue`.
- Check links with `go test -tags=links ./internal/quiz/...` (network; Reddit/X may answer 403 to bots and are only logged).
