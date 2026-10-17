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
ARG VUKEM_VERSION=v0.23.0
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
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/app ./cmd/app

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
	TRUSTED_PROXIES=100.0.0.0/8 \
	TRUST_FORWARDED_PROTO=true
# Railway's edge reaches the container from 100.0.0.0/8 (the range Railway's
# own reverse-proxy guide trusts; it is not a documented contract). Without
# it every visitor shares the edge IP's rate-limit bucket. Override both on
# other hosts.
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/up" || exit 1
ENTRYPOINT ["/app/app"]
