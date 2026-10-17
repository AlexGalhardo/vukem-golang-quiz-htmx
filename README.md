# Go Interview Quiz

[![CI](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexGalhardo/vukem-golang-quiz-htmx/actions/workflows/ci.yml)

Interactive Go (Golang) interview questions, from very easy to very hard, each with five alternatives, an explanation of every option and links to the sources. English and Brazilian Portuguese. Live at <https://quiz.vukem.dev>.

Built with [vukem](https://github.com/AlexGalhardo/vukem) (Go), [htmx 4](https://htmx.org) and [Tailwind CSS v4](https://tailwindcss.com). No accounts, no database, no cookies: your progress stays in your browser.

> Status: foundation. The question bank and the quiz UI are in progress, see [PLAN.md](PLAN.md).

## Run locally

```sh
bun install
docker compose up            # http://localhost:3000 (Go app with reload + Vite dev server)
```

Without Docker: `cp .env.example .env`, then `bun run dev` and `go run ./cmd/app` in two terminals.

## Test

```sh
go test ./...                # Go unit + HTTP tests
bun run test:e2e             # Playwright (starts the app)
golangci-lint run ./...
```

## Configuration

See [.env.example](.env.example). Production needs `APP_ENV=production`, `APP_KEY`, `APP_URL`; Railway sets `PORT`. Analytics (Plausible or Umami, cookieless) is off unless `ANALYTICS_PROVIDER` is set.

## Deploy

The [Dockerfile](Dockerfile) builds a single static binary with views and assets embedded; [railway.json](railway.json) configures Railway (Dockerfile builder, `/up` health check). Tagging `vX.Y.Z` publishes the image to GHCR and a GitHub release.

## Contributing and security

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE) © Alex Galhardo
