// Package routes declares the HTTP routes.
package routes

import (
	vukem "github.com/AlexGalhardo/vukem"
	"github.com/AlexGalhardo/vukem/middleware"
	"github.com/AlexGalhardo/vukem/router"

	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/app/controllers"
	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/resources"
)

// maxBody caps request bodies: the quiz only serves GET requests, so
// anything larger than a few KiB is abuse.
const maxBody = 16 << 10

// Web registers the browser routes. vukem route:list shows them.
//
// vukem.DefaultMiddleware is not used on purpose: it installs sessions and
// CSRF (the quiz is stateless and cookieless) and does not let the app set
// the CSP or TrustForwardedProto. See framework-feedback/quiz.md.
func Web(r *router.Router, app *vukem.App) error {
	headers := middleware.SecureHeadersConfig{}
	if app.Vite != nil && !app.Config.IsProduction() {
		headers.DevServer = app.Vite.HotURL
	}

	r.UseServer(
		middleware.Recover(),
		middleware.RequestID(),
		middleware.Logger(app.Log),
		middleware.SecureHeaders(headers),
		middleware.StaticFS(resources.Public(), middleware.StaticConfig{Prefix: "/"}),
	)
	r.Use(middleware.BodyLimit(maxBody))

	r.Get("/", controllers.Quiz).Name("quiz")

	return nil
}
