# Multi-stage build. Every base image is pinned to an exact version.
ARG GO_IMAGE=golang:1.27.2-alpine3.24
ARG BUN_IMAGE=oven/bun:1.4.3-alpine
ARG RUNTIME_IMAGE=alpine:3.24.2

# --- assets: Tailwind v4 + Vite build into resources/public/build ---------
FROM ${BUN_IMAGE} AS assets
WORKDIR /src
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY vite.config.ts tsconfig.json ./
COPY resources ./resources
RUN bun run build

# --- dev: Go toolchain + vukem CLI for `vukem serve` (compose) -----------
FROM ${GO_IMAGE} AS dev
ARG VUKEM_VERSION=v0.24.0
RUN go install github.com/AlexGalhardo/vukem/cmd/vukem@${VUKEM_VERSION}
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
CMD ["vukem", "serve", "--no-vite", "--poll", "1s"]

# --- build: static Go binary with views and assets embedded --------------
FROM ${GO_IMAGE} AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=assets /src/resources/public/build ./resources/public/build
# Tags from .buildtags (one per line, # comments), as in the vukem starters.
RUN tags="$(sed 's/#.*//' .buildtags 2>/dev/null | tr -s ', \t\r\n' ',' | sed 's/^,//; s/,$//')" \
	&& CGO_ENABLED=0 go build -tags "$tags" -trimpath -ldflags="-s -w" -o /out/app ./cmd/app

# --- runtime --------------------------------------------------------------
FROM ${RUNTIME_IMAGE} AS runtime
RUN apk add --no-cache ca-certificates tzdata \
	&& addgroup -S -g 65532 app && adduser -S -u 65532 -G app -h /app app
WORKDIR /app
COPY --from=build /out/app /app/app
USER 65532:65532
ENV APP_ENV=production \
	APP_DEBUG=false \
	HOST=0.0.0.0 \
	PORT=3000 \
	LOG_FORMAT=json \
	RATE_LIMIT_PER_MINUTE=1200
# TRUSTED_PROXIES stays unset: Railway does not document the range its edge
# connects from, so the client IP is the edge address and every visitor
# shares one rate-limit bucket. The budget above is a site-wide abuse cap,
# not a per-person limit. Once a range is verified from the peer addresses,
# set TRUSTED_PROXIES, CLIENT_IP_HEADER=X-Real-IP and TRUST_FORWARDED_PROTO
# together and lower the budget.
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/up" || exit 1
ENTRYPOINT ["/app/app"]
