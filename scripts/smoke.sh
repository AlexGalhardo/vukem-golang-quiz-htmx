#!/usr/bin/env bash
# Smoke test against any deployment: health check, home page, one question
# fragment and one answer, plus the security headers that must always be
# there. Usage: scripts/smoke.sh https://quiz.vukem.dev
set -euo pipefail

base="${1:?usage: scripts/smoke.sh <base-url>}"
base="${base%/}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() {
	echo "FAIL: $*" >&2
	exit 1
}

check() { # check <name> <url> [curl args...] -> body in $tmp/body, headers in $tmp/headers
	local name="$1" url="$2"
	shift 2
	local code
	code="$(curl -sS -o "$tmp/body" -D "$tmp/headers" -w '%{http_code}' "$@" "$url")" || fail "$name: request failed"
	[[ "$code" == 200 ]] || fail "$name: HTTP $code from $url"
	if grep -qi '^set-cookie:' "$tmp/headers"; then fail "$name: response sets a cookie"; fi
	echo "ok   $name"
}

header() { # header <name> <pattern>
	grep -qiE "^$1: .*$2" "$tmp/headers" || fail "header $1 missing or not matching '$2'"
}

check "health" "$base/up"
grep -q '"status":"ok"' "$tmp/body" || fail "health: unexpected body"

check "home" "$base/"
header "content-security-policy" "script-src 'self'"
header "x-content-type-options" "nosniff"
header "x-frame-options" "DENY"
grep -q 'id="quiz-index"' "$tmp/body" || fail "home: question index missing"
id="$(grep -oE 'data-question-id="[a-z0-9-]+"' "$tmp/body" | head -n 1 | cut -d'"' -f2)"
[[ -n "$id" ]] || fail "home: no question rendered"

check "question $id (htmx)" "$base/questions/$id?lang=pt-BR" -H 'HX-Request: true'
grep -qi '<html' "$tmp/body" && fail "question: got a full page, want a fragment"
grep -q 'data-order="[a-e]\{5\}"' "$tmp/body" || fail "question: alternatives missing"

check "answer $id/a (htmx)" "$base/questions/$id/answers/a" -H 'HX-Request: true'
grep -qi '^hx-trigger: .*quiz:answered' "$tmp/headers" || fail "answer: HX-Trigger quiz:answered missing"
grep -q 'data-testid="sources"' "$tmp/body" || fail "answer: sources missing"

code="$(curl -sS -o /dev/null -w '%{http_code}' "$base/questions/does-not-exist")"
[[ "$code" == 404 ]] || fail "unknown question: HTTP $code, want 404"
echo "ok   404 for unknown question"

echo "smoke passed: $base"
