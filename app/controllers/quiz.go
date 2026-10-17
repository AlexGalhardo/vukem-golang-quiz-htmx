// Package controllers holds the HTTP handlers.
package controllers

import "github.com/AlexGalhardo/vukem/web"

// Quiz renders the quiz page, the only page of the app.
func Quiz(c *web.Ctx) error { return c.Render("quiz/index", nil) }
