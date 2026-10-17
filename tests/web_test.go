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
		AssertSee(`/js/htmx.min.js`).
		AssertHeader("X-Content-Type-Options", "nosniff").
		AssertHeaderContains("Content-Security-Policy", "default-src 'self'")
}

func TestStaticAssets(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)

	app.Client(t).Get("/js/htmx.min.js").AssertOK()
	app.Client(t).Get("/robots.txt").AssertOK()
}
