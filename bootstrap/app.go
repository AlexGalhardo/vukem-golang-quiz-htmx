// Package bootstrap wires the application together. There is no hidden
// registration: everything the app uses is listed here.
package bootstrap

import (
	"fmt"

	vukem "github.com/AlexGalhardo/vukem"

	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/internal/quiz"
	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/resources"
	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/routes"
)

// New builds the application; cmd/app and the tests call it. The quiz has
// no database, sessions or queues: questions are embedded in the binary and
// user progress lives in the browser. An invalid question bank aborts boot.
func New(opts ...vukem.Option) (*vukem.App, error) {
	bank, err := quiz.Load(quiz.Embedded())
	if err != nil {
		return nil, fmt.Errorf("question bank: %w", err)
	}

	base := []vukem.Option{
		vukem.WithViews(resources.Views()),
		vukem.WithVite(resources.Public()),
		vukem.WithTranslations(resources.Lang()),
		vukem.WithRoutes(routes.Web(bank, nil)),
	}

	return vukem.New(append(base, opts...)...)
}
