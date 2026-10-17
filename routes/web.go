// Package routes declares the HTTP routes.
package routes

import (
	"net/http"
	"net/url"
	"time"

	vukem "github.com/AlexGalhardo/vukem"
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

// hsts is sent on every production response when APP_URL is https.
const hsts = "max-age=63072000; includeSubDomains"

// Web returns the route file. shuffle orders the alternatives (nil means
// rand.Shuffle); tests pass a seeded one.
//
// The stack is vukem's stateless default (no sessions or cookies; CSRF is
// Origin checks only; maintenance mode; TRUSTED_PROXIES,
// TRUST_FORWARDED_PROTO and CLIENT_IP_HEADER from the environment) plus
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

		if app.Config.IsProduction() && isHTTPS(app.Source.Get("APP_URL")) {
			r.UseServer(alwaysHSTS)
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

// alwaysHSTS sends HSTS whatever the request scheme. vukem only adds it to
// requests it knows are HTTPS, which behind Railway needs a trusted proxy
// range Railway does not document (TRUSTED_PROXIES stays unset). Every
// public request reaches the app through Railway's TLS edge, and browsers
// ignore HSTS received over plain HTTP (RFC 6797 §8.1), so sending it
// unconditionally is safe. See framework-feedback/quiz.md.
func alwaysHSTS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Strict-Transport-Security", hsts)
		next.ServeHTTP(w, r)
	})
}

func isHTTPS(raw string) bool {
	u, err := url.Parse(raw)

	return err == nil && u.Scheme == "https" && u.Host != ""
}
