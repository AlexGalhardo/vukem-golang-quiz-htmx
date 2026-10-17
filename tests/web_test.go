// Package tests holds HTTP tests that boot the whole app with vukemtest.
package tests

import (
	"testing"

	"github.com/AlexGalhardo/vukem/vukemtest"

	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/bootstrap"
)

func TestHealth(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)

	app.Client(t).Get("/up").AssertOK().AssertSee(`"status":"ok"`)
}

func TestQuizPage(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)

	app.Client(t).Get("/").
		AssertOK().
		AssertSee(`data-testid="quiz-grid"`).
		AssertSee(`/vendor/htmx-4.0.0/htmx.min.js`).
		AssertDontSee(`/js/theme.js`).
		AssertSee(`<link rel="icon" href="/favicon.svg"`).
		AssertSee(`document.documentElement.setAttribute("data-theme"`).
		AssertHeader("X-Content-Type-Options", "nosniff").
		AssertHeaderContains("Content-Security-Policy", "default-src 'self'")
}

func TestStaticAssets(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)

	// The vendored htmx path carries its version, so it can be cached forever.
	app.Client(t).Get("/vendor/htmx-4.0.0/htmx.min.js").
		AssertOK().
		AssertHeader("Cache-Control", "public, max-age=31536000, immutable")
	app.Client(t).Get("/robots.txt").AssertOK()
	app.Client(t).Get("/favicon.svg").AssertOK().AssertHeaderContains("Content-Type", "image/svg+xml")
}
