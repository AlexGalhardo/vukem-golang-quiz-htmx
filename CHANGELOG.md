# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-10-18

### Changed

- **deps:** Bump vukem to v0.28.0 ([599b0cb](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/599b0cb888bc323f4f3a8c4ea4bffd5b9343d4bf))

## [0.6.0] - 2026-10-18

### Changed

- **deps:** Bump vukem to v0.27.0 ([8cab22d](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/8cab22d4774d00c40d35f5ac5ed15c64911620f4))

### Fixed

- **ui:** Make code samples keyboard-focusable regions ([33278a5](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/33278a59f9a5ba319d21fd51b70f6f2822b5f419))

## [0.5.0] - 2026-10-17

### Added

- **ui:** Use the docs site's light/dark/system theme radiogroup ([8b6f716](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/8b6f716b941b0129ddaff679aaf4545d0762b704))
- **ui:** Turn settings into a larger modal panel ([5bdee15](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/5bdee15a0d144ae1da8498e29dfb137ad24e2282))
- **ui:** Show settings as a bottom sheet on small screens ([fd2b145](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/fd2b1451060f014ee2ce9a1a48cc45efdd89d53c))
- **quiz:** Add a history of quiz runs ([eb67b8c](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/eb67b8cf5ff0a069b0fe205d67ed3c6c7fba4a7c))
- **quiz:** Add a Review panel to redo this session's wrong answers ([179c1a4](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/179c1a46c7e7c3031d790921add5b873a9ed6e7a))

### Changed

- **deps:** Bump vukem to v0.26.0 ([773fa3f](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/773fa3fb6f81cf7635103645fe6b3e7b813926a9))

### Fixed

- **ui:** Wrap long inline code instead of widening the page ([8a9a620](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/8a9a6207584e0892baf143021676ce1defdaf97b))

## [0.4.0] - 2026-10-17

### Changed

- **deps:** Bump vukem to v0.24.0 ([c3df661](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/c3df661a56a919c44a19ffa17ee241bf7841f7a3))
- **deps:** Bump vukem to v0.25.0 ([5f20edd](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/5f20edd8638c23c80faafaeb1d4c20b4efd97f4c))

### Fixed

- **docker:** Stop trusting an unverified railway range, build without sqlite ([40aed70](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/40aed70b892ae64e74d456e98a73e56d6760148b))
- **docker:** Drop the 1200 rate-limit default from the image ([a4cb4ed](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/a4cb4ed6baedd08343eafd6faacc076f4ec0c596))

## [0.3.0] - 2026-10-17

### Changed

- **deps:** Bump vukem to v0.23.0 ([05b5676](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/05b56768346cd6b03ed3340944efda50f7e87840))
- **quiz:** Gzip html pages and fragments ([f47afbd](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/f47afbdfd77f6ff27c3e5a27f0c5f45ada04eae0))
- **ui:** Inline the nonce'd theme bootstrap and cache vendored htmx ([a1e5c1a](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/a1e5c1a08417dfb68c9f78b9bb81d00c3c8f223a))

### Fixed

- **ui:** Show the latest question when loads finish out of order ([61e7b32](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/61e7b323c0f9ee8e9c16b1bd0ab7e4e83dc7bc7c))
- **questions:** Review basics and types shard ([60a9b46](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/60a9b46927c80f957a273ef279fcd2131c671e54))
- **questions:** Review concurrency shard ([a265a1b](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/a265a1b8b0e15198ad99db3f09bf37dcd4144ed5))
- **questions:** Review errors, control flow and modules shard ([2152a03](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/2152a0374fcf640efce36202aec8cb15cac48457))
- **questions:** Review runtime, tooling and stdlib shard ([168a9c8](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/168a9c83c1acd40ec19909ced0e4508284bcb1a1))
- **questions:** Review interfaces and generics shard ([843ceff](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/843ceff171cfa0ad7e0ccf58f308248bdcee188b))
- **questions:** Review stdlib/sync/reflect and testing/profiling shards ([e8a0a30](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/e8a0a30ac3727ff57e63702fda4ffd3883045d0d))

## [0.2.0] - 2026-10-17

### Added

- **questions:** Add question bank loader with schema validation ([ad0d202](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/ad0d2020ef003d507b167f0cff9fe88f08993130))
- **questions:** Add quizcheck tool to validate shards in isolation ([ddae8d6](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/ddae8d6d2098e1019f387629a776642413a567ab))
- **questions:** Add 109 questions across five topic shards ([88c3ba8](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/88c3ba892b2376d74829870fd1781da07ded8063))
- **quiz:** Add question pages, answers, settings and client state ([ca844a1](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/ca844a1aeb5ebc18830cd6805c7351158afea726))
- **security:** Make the per-IP rate limit configurable ([0aa0e1c](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/0aa0e1c47230c011db1b44f48f424f68fa956f1f))
- **questions:** Add testing/profiling and stdlib/sync/reflect shards ([091bd22](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/091bd22f8ea1089cdaafcdd8ae828dab28270299))

### Changed

- **deps:** Bump vukem to v0.22.0 ([e686d4e](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/e686d4e8bf8af3cc252c575a2a4b5abe737011e1))

### Fixed

- **questions:** Compare alternatives by case and spacing only ([f0463fa](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/f0463faaa1c647c7eee776c524cf456dd06dab53))
- **ui:** Use htmx for Next, close settings on Escape or outside click ([a58a4b5](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/a58a4b52b3aa3712ee205df523ebd8f0e022b03a))
- **docker:** Trust railway's edge range for client ip and https ([6be286a](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/6be286a972da92aa448b791685fa12b47ec1af8f))

## [0.1.0] - 2026-10-17

### Added

- **quiz:** Scaffold vukem app with health check and quiz page ([795c350](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/795c350168448215d4833d1e268ca2ce9d04bfde))

### Fixed

- **quiz:** Always serve embedded views and assets in production ([aa8532f](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/commit/aa8532fe075a4c4ed946dceaf8714bd8550f0206))

[0.7.0]: https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/releases/tag/v0.1.0
