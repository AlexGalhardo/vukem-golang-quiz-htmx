// Package controllers holds the HTTP handlers.
package controllers

import (
	"html/template"
	"math/rand/v2"
	"net/http"
	"slices"
	"strings"

	"github.com/AlexGalhardo/vukem/errs"
	"github.com/AlexGalhardo/vukem/i18n"
	"github.com/AlexGalhardo/vukem/web"

	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/internal/quiz"
	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/internal/settings"
)

// Quiz serves the quiz page, question fragments and answers.
type Quiz struct {
	bank      *quiz.Bank
	analytics settings.Analytics
	shuffle   quiz.Shuffler
}

// NewQuiz returns the quiz handlers. A nil shuffle uses rand.Shuffle.
func NewQuiz(bank *quiz.Bank, analytics settings.Analytics, shuffle quiz.Shuffler) *Quiz {
	if shuffle == nil {
		shuffle = rand.Shuffle
	}

	return &Quiz{bank: bank, analytics: analytics, shuffle: shuffle}
}

// Home renders the first question; the client then moves to the next
// question of its own queue (progress lives in localStorage).
func (h *Quiz) Home(c *web.Ctx) error { return h.render(c, h.bank.First(), "") }

// Show renders one question: the full page for normal requests, the "quiz"
// block for htmx requests.
func (h *Quiz) Show(c *web.Ctx) error {
	q, ok := h.bank.Get(c.Param("id"))
	if !ok {
		return errs.New(http.StatusNotFound, "Question not found.")
	}

	return h.render(c, q, "")
}

// Answer reveals the explanation for the chosen alternative. htmx requests
// get the explanation card plus an out-of-band swap that locks the
// alternatives, and a quiz:answered event the client uses for its stats.
func (h *Quiz) Answer(c *web.Ctx) error {
	q, ok := h.bank.Get(c.Param("id"))
	if !ok {
		return errs.New(http.StatusNotFound, "Question not found.")
	}

	alt, ok := q.Alternative(c.Param("alt"))
	if !ok {
		return errs.New(http.StatusNotFound, "Alternative not found.")
	}

	c.HTMX().Trigger("quiz:answered", map[string]any{
		"target":     "body", // the clicked button is replaced by the OOB swap
		"id":         q.ID,
		"alt":        alt.ID,
		"correct":    alt.Correct,
		"difficulty": q.Difficulty,
	})
	c.SetHeader("Cache-Control", "no-store")

	return h.render(c, q, alt.ID)
}

// maxReviewItems caps /review: the session list can't legitimately grow past
// the bank, and the cap bounds the work per request.
const maxReviewItems = 200

// Review renders the "wrong answers" list for the Review panel. The client
// keeps the list (sessionStorage) and sends it as items=id:alt,id:alt; ids
// no longer in the bank are skipped, malformed input is a 400.
func (h *Quiz) Review(c *web.Ctx) error {
	locale := h.locale(c)

	var items []reviewItem

	raw := c.Query("items")
	if raw != "" {
		parts := strings.Split(raw, ",")
		if len(parts) > maxReviewItems {
			return errs.New(http.StatusBadRequest, "Too many items.")
		}

		for _, p := range parts {
			id, alt, ok := strings.Cut(p, ":")
			if !ok || !quiz.ValidID(id) || len(alt) != 1 || alt[0] < 'a' || alt[0] >= 'a'+quiz.AlternativeCount {
				return errs.New(http.StatusBadRequest, "Invalid review item.")
			}

			q, found := h.bank.Get(id)
			if !found {
				continue
			}

			chosen, _ := q.Alternative(alt)
			items = append(items, reviewItem{
				ID:       q.ID,
				Locale:   locale,
				Question: richText(q.Question.In(locale)),
				Chosen:   richText(chosen.Text.In(locale)),
				Correct:  richText(q.Correct().Text.In(locale)),
			})
		}
	}

	c.SetHeader("Cache-Control", "no-store")

	return c.Render("quiz/review", reviewPage{Items: items})
}

type reviewPage struct {
	Items []reviewItem
}

type reviewItem struct {
	ID       string
	Locale   string
	Question template.HTML
	Chosen   template.HTML
	Correct  template.HTML
}

func (h *Quiz) locale(c *web.Ctx) string {
	locale := i18n.Locale(c.Context())
	if !slices.Contains(quiz.Locales(), locale) {
		return quiz.DefaultLocale
	}

	return locale
}

func (h *Quiz) render(c *web.Ctx, q quiz.Question, chosen string) error {
	locale := h.locale(c)

	order := parseOrder(c.Query("order"))
	if order == nil {
		order = idsOf(q.Shuffled(h.shuffle))
	}

	p := page{
		Locale:       locale,
		Analytics:    h.analytics,
		Index:        h.bank.Index(),
		Difficulties: quiz.Difficulties(),
		Q:            newQuestionView(q, order, chosen, locale),
	}

	block := "quiz"
	if chosen != "" {
		block = "answer"
	}

	return c.Render("quiz/show", p, web.Block(block))
}

type page struct {
	Locale       string
	Analytics    settings.Analytics
	Index        []quiz.IndexEntry
	Difficulties []quiz.Difficulty
	Q            questionView
}

type questionView struct {
	ID           string
	Difficulty   quiz.Difficulty
	Text         template.HTML
	Code         string
	Order        string
	Alternatives []altView
	Answered     bool
	Correct      bool
	Explanation  template.HTML
	Sources      []quiz.Source
}

type altView struct {
	ID      string
	Key     string // A–E by display position
	Num     int    // 1–5 by display position
	Text    template.HTML
	Why     template.HTML
	Correct bool
	Chosen  bool
}

func newQuestionView(q quiz.Question, order []string, chosen, locale string) questionView {
	v := questionView{
		ID:         q.ID,
		Difficulty: q.Difficulty,
		Text:       richText(q.Question.In(locale)),
		Code:       q.Code,
		Order:      strings.Join(order, ""),
		Answered:   chosen != "",
	}

	for i, id := range order {
		a, _ := q.Alternative(id)
		v.Alternatives = append(v.Alternatives, altView{
			ID:      a.ID,
			Key:     string(rune('A' + i)),
			Num:     i + 1,
			Text:    richText(a.Text.In(locale)),
			Why:     richText(a.Why.In(locale)),
			Correct: a.Correct,
			Chosen:  a.ID == chosen,
		})

		if a.ID == chosen {
			v.Correct = a.Correct
		}
	}

	if v.Answered {
		v.Explanation = richText(q.Explanation.In(locale))
		v.Sources = q.Sources
	}

	return v
}

// parseOrder accepts the display order sent back by the client ("cadbe"):
// a permutation of a–e. Anything else is ignored and a new order is drawn.
func parseOrder(s string) []string {
	if len(s) != quiz.AlternativeCount {
		return nil
	}

	seen := map[rune]bool{}

	out := make([]string, 0, quiz.AlternativeCount)
	for _, r := range s {
		if r < 'a' || r >= 'a'+quiz.AlternativeCount || seen[r] {
			return nil
		}

		seen[r] = true
		out = append(out, string(r))
	}

	return out
}

func idsOf(alts []quiz.Alternative) []string {
	out := make([]string, len(alts))
	for i, a := range alts {
		out[i] = a.ID
	}

	return out
}

// richText escapes s and turns `inline code` spans into <code> elements,
// the only markup question texts may use.
func richText(s string) template.HTML {
	parts := strings.Split(template.HTMLEscapeString(s), "`")

	var b strings.Builder

	for i, part := range parts {
		switch {
		case i%2 == 0:
			b.WriteString(part)
		case i == len(parts)-1: // unbalanced backtick: keep it literal
			b.WriteString("`" + part)
		default:
			b.WriteString(
				`<code class="rounded bg-zinc-100 px-1 font-mono text-[0.9em] [overflow-wrap:anywhere] dark:bg-zinc-800">` + part + "</code>",
			)
		}
	}

	return template.HTML(b.String()) //nolint:gosec // G203: input escaped above, only <code> added
}
