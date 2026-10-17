// Package routes declares the HTTP routes.
package routes

import (
	"net/http"
	"time"

	vukem "github.com/AlexGalhardo/vukem"
	"github.com/AlexGalhardo/vukem/i18n"
	"github.com/AlexGalhardo/vukem/middleware"
	"github.com/AlexGalhardo/vukem/ratelimit"
	"github.com/AlexGalhardo/vukem/router"

	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/app/controllers"
	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/internal/quiz"
	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/internal/settings"
	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/resources"
)

// maxBody caps request bodies: the quiz only serves GET requests, so
// anything larger than a few KiB is abuse.
const maxBody = 16 << 10

// rateWindow is the rate limit window; the budget is settings.LoadRateLimit.
const rateWindow = time.Minute

// Web returns the route file. shuffle orders the alternatives (nil means
// rand.Shuffle); tests pass a seeded one.
//
// The stack is vukem's stateless default (no sessions or cookies; CSRF is
// Origin checks only; maintenance mode; TRUSTED_PROXIES,
// TRUST_FORWARDED_PROTO, CLIENT_IP_HEADER and HSTS_FORCE from the
// environment) plus
// static files, the per-IP rate limit, a 16 KiB body cap and gzip.
func Web(bank *quiz.Bank, shuffle quiz.Shuffler) func(r *router.Router, app *vukem.App) error {
	return func(r *router.Router, app *vukem.App) error {
		analytics, err := settings.LoadAnalytics(app.Source.Get)
		if err != nil {
			return err
		}

		rateLimit, err := settings.LoadRateLimit(app.Source.Get)
		if err != nil {
			return err
		}

		err = vukem.DefaultMiddlewareWith(app, r, vukem.MiddlewareOptions{
			Stateless: true,
			// ?lang= (the client adds the stored choice), then Accept-Language;
			// never a cookie or session (D20).
			I18n: &i18n.MiddlewareConfig{Order: []i18n.Source{i18n.SourceQuery, i18n.SourceHeader}},
			SecureHeaders: func(cfg *middleware.SecureHeadersConfig) {
				if analytics.Enabled() {
					cfg.CSPSources = map[string][]string{
						"script-src":  {analytics.Origin},
						"connect-src": {analytics.Origin},
					}
				}
			},
		})
		if err != nil {
			return err
		}

		r.UseServer(
			// /vendor paths carry the library version, so they are immutable too.
			middleware.StaticFS(resources.Public(), middleware.StaticConfig{
				Prefix:            "/",
				ImmutablePrefixes: []string{"/build/", "/vendor/"},
			}),
		)
		r.Use(
			ratelimit.Middleware(ratelimit.NewMemory(rateLimit, rateWindow), limitKey),
			middleware.BodyLimit(maxBody),
			// Pages carry the question index; responses never echo request
			// input, so compressing them leaks nothing (no BREACH oracle).
			middleware.Gzip(),
		)

		h := controllers.NewQuiz(bank, analytics, shuffle)

		r.Get("/", h.Home).Name("quiz")
		r.Get("/questions/{id}", h.Show).Name("questions.show")
		r.Get("/questions/{id}/answers/{alt}", h.Answer).Name("questions.answer")
		r.Get("/review", h.Review).Name("review")

		return nil
	}
}

// limitKey rate limits by client IP, except the health check (Railway polls
// it from its own network).
func limitKey(r *http.Request) string {
	if r.URL.Path == "/up" {
		return ""
	}

	return ratelimit.ByIP(r)
}
