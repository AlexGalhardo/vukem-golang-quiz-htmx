# Commit rules

- Conventional Commits 1.0, English: `type(scope): description` (checked by commitlint in the `commit-msg` hook and CI).
- Types: feat, fix, perf, refactor, docs, test, build, ci, chore, style, revert.
- Scopes: `quiz`, `questions`, `ui`, `i18n`, `security`, `docker`, `ci`, `deps`, `repo`, `docs`, `release`.
- Description: imperative, lowercase start, no trailing period, header ≤ 100 chars.
- One logical change per commit. Reference the PLAN.md task in the body: `Refs: F.2.3`.
- Framework bumps: `build(deps): bump vukem to vX.Y.Z`. Releases: `chore(release): vX.Y.Z`.
- The header becomes the `CHANGELOG.md` line (git-cliff, `cliff.toml`), so write it for a reader of the release notes.
