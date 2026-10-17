// Package routes declares the HTTP routes.
package routes

import (
	"net/http"
	"strings"
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
// vukem.DefaultMiddleware is not used on purpose: it installs sessions and
// CSRF (the quiz is stateless and cookieless) and does not let the app set
// the CSP or TrustForwardedProto. See framework-feedback/quiz.md.
func Web(bank *quiz.Bank, shuffle quiz.Shuffler) func(r *router.Router, app *vukem.App) error {
	return func(r *router.Router, app *vukem.App) error {
		analytics, err := settings.LoadAnalytics(app.Source.Get)
		if err != nil {
			return err
		}

		proxy, err := settings.LoadProxy(app.Source.Get)
		if err != nil {
			return err
		}

		rateLimit, err := settings.LoadRateLimit(app.Source.Get)
		if err != nil {
			return err
		}

		r.Services().TrustedProxies = proxy.TrustedProxies

		headers := middleware.SecureHeadersConfig{
			CSP:                 csp(analytics),
			TrustForwardedProto: proxy.TrustForwardedProto,
		}
		if app.Vite != nil && !app.Config.IsProduction() {
			headers.DevServer = app.Vite.HotURL
		}

		limiter := ratelimit.NewMemory(rateLimit, rateWindow)

		r.UseServer(
			middleware.Recover(),
			middleware.RequestID(),
			middleware.Logger(app.Log),
			middleware.SecureHeaders(headers),
			// /vendor paths carry the library version, so they are immutable too.
			middleware.StaticFS(resources.Public(), middleware.StaticConfig{
				Prefix:            "/",
				ImmutablePrefixes: []string{"/build/", "/vendor/"},
			}),
		)
		r.Use(
			ratelimit.Middleware(limiter, limitKey),
			middleware.BodyLimit(maxBody),
			// Pages carry the question index; responses never echo request
			// input, so compressing them leaks nothing (no BREACH oracle).
			middleware.Gzip(),
			i18n.Middleware(app.I18n, i18n.MiddlewareConfig{Cookie: "-", SessionKey: "-"}),
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

// csp is vukem's default policy plus the analytics origin, when enabled,
// in script-src and connect-src.
func csp(a settings.Analytics) string {
	policy := middleware.DefaultCSP
	if !a.Enabled() {
		return policy
	}

	policy = strings.Replace(policy, "script-src 'self'", "script-src 'self' "+a.Origin, 1)

	return strings.Replace(policy, "connect-src 'self'", "connect-src 'self' "+a.Origin, 1)
}
