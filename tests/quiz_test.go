package tests

import (
	"encoding/json"
	"html"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/AlexGalhardo/vukem/vukemtest"

	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/bootstrap"
	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/internal/quiz"
)

func bank(t *testing.T) *quiz.Bank {
	t.Helper()

	b, err := quiz.Load(quiz.Embedded())
	if err != nil {
		t.Fatal(err)
	}

	return b
}

func TestLocale(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)

	tests := []struct {
		name, target, acceptLang, want, lang string
	}{
		{"default", "/", "", "Settings", `lang="en"`},
		{"query", "/?lang=pt-BR", "", "Configurações", `lang="pt-BR"`},
		{"accept-language", "/", "pt-BR,pt;q=0.9", "Configurações", `lang="pt-BR"`},
		{"query wins", "/?lang=en", "pt-BR", "Settings", `lang="en"`},
		{"unknown falls back", "/?lang=xx", "", "Settings", `lang="en"`},
	}

	// The locale never comes from a cookie (D20): the app sets none.
	app.Client(t).WithCookie("lang", "pt-BR").Get("/").AssertOK().AssertSee("Settings")

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			c := app.Client(t)
			if tt.acceptLang != "" {
				c = c.WithHeader("Accept-Language", tt.acceptLang)
			}

			c.Get(tt.target).AssertOK().AssertSee(tt.want).AssertSee(tt.lang)
		})
	}
}

func TestQuestionPage(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)
	q := bank(t).All()[3]

	app.Client(t).Get("/questions/" + q.ID).
		AssertOK().
		AssertSee("<html").
		AssertSee(`data-question-id="` + q.ID + `"`).
		AssertSee(`id="quiz-index"`)

	app.Client(t).HTMX().Get("/questions/" + q.ID + "?lang=pt-BR").
		AssertOK().
		AssertFragment().
		AssertSee(`data-question-id="` + q.ID + `"`).
		AssertSee(html.EscapeString(q.Question.In("pt-BR"))[:20]).
		AssertDontSee(`id="quiz-index"`)

	app.Client(t).Get("/questions/does-not-exist").AssertNotFound().AssertSee(`data-testid="not-found"`)
}

var orderRe = regexp.MustCompile(`data-order="([a-e]{5})"`)

func TestAlternativesAreShuffled(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)
	id := bank(t).First().ID
	orders := map[string]bool{}

	for range 20 {
		m := orderRe.FindStringSubmatch(app.Client(t).HTMX().Get("/questions/" + id).Body())
		if m == nil {
			t.Fatal("data-order missing")
		}

		orders[m[1]] = true
	}

	if len(orders) < 2 {
		t.Errorf("20 requests produced %d distinct orders, want shuffling", len(orders))
	}

	// A valid order sent back by the client is kept; an invalid one is redrawn.
	app.Client(t).HTMX().Get("/questions/" + id + "?order=edcba").AssertSee(`data-order="edcba"`)

	for _, bad := range []string{"aabcd", "abcdf", "abc", "<script>"} {
		res := app.Client(t).HTMX().Get("/questions/" + id + "?order=" + bad)
		if orderRe.FindStringSubmatch(res.Body()) == nil {
			t.Errorf("order=%q: no valid data-order in response", bad)
		}
	}
}

func TestAnswer(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)
	q := bank(t).First()
	correct := q.Correct().ID

	wrong := "a"
	if correct == "a" {
		wrong = "b"
	}

	res := app.Client(t).HTMX().Get("/questions/"+q.ID+"/answers/"+correct+"?order=abcde").
		AssertOK().
		AssertFragment().
		AssertHXTrigger("quiz:answered").
		AssertHeader("Cache-Control", "no-store").
		AssertSee(`data-correct="true"`).
		AssertSee(`hx-swap-oob="true"`).
		AssertSee(`data-order="abcde"`).
		AssertSee(`data-testid="sources"`).
		AssertSee(q.Sources[0].URL)

	var trigger map[string]map[string]any
	if err := json.Unmarshal([]byte(res.Header("HX-Trigger")), &trigger); err != nil {
		t.Fatal(err)
	}

	got := trigger["quiz:answered"]
	if got["id"] != q.ID || got["alt"] != correct || got["correct"] != true ||
		got["difficulty"] != string(q.Difficulty) {
		t.Errorf("quiz:answered = %v", got)
	}

	app.Client(t).HTMX().Get("/questions/" + q.ID + "/answers/" + wrong).
		AssertOK().
		AssertSee(`data-correct="false"`).
		AssertSee(`data-state="wrong"`)

	app.Client(t).HTMX().Get("/questions/" + q.ID + "/answers/f").AssertNotFound()
	app.Client(t).HTMX().Get("/questions/nope/answers/a").AssertNotFound()
}

func TestQuestionIndex(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)
	b := bank(t)

	body := app.Client(t).Get("/").AssertOK().Body()

	m := regexp.MustCompile(`(?s)<script type="application/json" id="quiz-index">(.*?)</script>`).
		FindStringSubmatch(body)
	if m == nil {
		t.Fatal("quiz-index script missing")
	}

	var index []quiz.IndexEntry
	if err := json.Unmarshal([]byte(m[1]), &index); err != nil {
		t.Fatalf("quiz-index is not JSON: %v", err)
	}

	if len(index) != b.Len() {
		t.Fatalf("index has %d entries, want %d", len(index), b.Len())
	}

	for i := 1; i < len(index); i++ {
		if index[i].Difficulty.Rank() < index[i-1].Difficulty.Rank() {
			t.Fatalf(
				"index not ordered by difficulty at %d: %s after %s",
				i,
				index[i].Difficulty,
				index[i-1].Difficulty,
			)
		}
	}

	if index[0].ID != b.First().ID || !strings.Contains(body, `data-question-id="`+b.First().ID+`"`) {
		t.Errorf("/ does not render the first question %q", b.First().ID)
	}
}

func TestAnalytics(t *testing.T) {
	t.Parallel()

	off := vukemtest.New(t, bootstrap.New)
	res := off.Client(t).Get("/").AssertDontSee("data-domain").AssertDontSee("data-website-id")

	// Off by default: the CSP allows no third-party origin.
	for _, d := range []string{"script-src", "connect-src"} {
		if !strings.Contains(res.Header("Content-Security-Policy"), d+" 'self'") ||
			strings.Contains(res.Header("Content-Security-Policy"), "https://") {
			t.Errorf("CSP without analytics = %q, want only 'self' sources", res.Header("Content-Security-Policy"))
		}
	}

	tests := []struct {
		provider, script, attr string
	}{
		{"plausible", "https://plausible.io/js/script.js", `data-domain="quiz.vukem.dev"`},
		{"umami", "https://cloud.umami.is/script.js", `data-website-id="quiz.vukem.dev"`},
		// Self-hosted Umami used in production.
		{"umami", "https://vukem-analytics.up.railway.app/script.js", `data-website-id="quiz.vukem.dev"`},
	}

	for _, tt := range tests {
		t.Run(tt.provider+" "+tt.script, func(t *testing.T) {
			t.Parallel()

			app := vukemtest.New(t, bootstrap.New, vukemtest.Options{Env: map[string]string{
				"ANALYTICS_PROVIDER":   tt.provider,
				"ANALYTICS_SCRIPT_URL": tt.script,
				"ANALYTICS_SITE_ID":    "quiz.vukem.dev",
			}})

			origin := tt.script[:strings.Index(tt.script[len("https://"):], "/")+len("https://")]

			res := app.Client(t).Get("/").
				AssertOK().
				AssertSee(tt.attr).
				AssertSee(`src="` + tt.script + `"`)

			for _, d := range []string{"script-src", "connect-src"} {
				if src := directive(res.Header("Content-Security-Policy"), d); !slices.Contains(src, origin) ||
					!slices.Contains(src, "'self'") {
					t.Errorf("%s = %v, want 'self' and %s", d, src, origin)
				}
			}
		})
	}
}

func TestInvalidAnalyticsAbortsBoot(t *testing.T) {
	t.Parallel()

	_, err := vukemtest.Build(t, bootstrap.New, vukemtest.Options{Env: map[string]string{
		"ANALYTICS_PROVIDER":   "plausible",
		"ANALYTICS_SCRIPT_URL": "http://evil.example/script.js",
		"ANALYTICS_SITE_ID":    "x",
	}})
	if err == nil || !strings.Contains(err.Error(), "ANALYTICS_SCRIPT_URL") {
		t.Fatalf("app with an http analytics script: err = %v, want ANALYTICS_SCRIPT_URL error", err)
	}
}

func TestPagesAreCompressed(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)
	id := bank(t).First().ID

	for _, target := range []string{"/", "/questions/" + id} {
		app.Client(t).WithHeader("Accept-Encoding", "gzip").Get(target).
			AssertOK().
			AssertHeader("Content-Encoding", "gzip")
	}
}

// directive returns the sources of one CSP directive.
func directive(policy, name string) []string {
	for d := range strings.SplitSeq(policy, ";") {
		if f := strings.Fields(d); len(f) > 0 && f[0] == name {
			return f[1:]
		}
	}

	return nil
}

func TestReviewList(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)
	all := bank(t).All()
	q1, q2 := all[0], all[5]
	wrong1 := "a"
	if q1.Correct().ID == "a" {
		wrong1 = "b"
	}

	res := app.Client(t).
		HTMX().
		Get("/review?lang=pt-BR&items=" + q1.ID + ":" + wrong1 + "," + q2.ID + ":" + q2.Correct().ID + ",gone-question:a").
		AssertOK().
		AssertFragment().
		AssertHeaderMissing("Set-Cookie").
		AssertSee(`data-question-id="` + q1.ID + `"`).
		AssertSee(`data-question-id="` + q2.ID + `"`).
		AssertSee(`href="/questions/` + q1.ID + `?lang=pt-BR"`).
		AssertDontSee("gone-question")
		// removed questions are skipped

	if n := strings.Count(res.Body(), `data-testid="review-item"`); n != 2 {
		t.Errorf("review items = %d, want 2", n)
	}

	if !strings.Contains(res.Body(), html.EscapeString(q1.Alternatives[int(wrong1[0]-'a')].Text.In("pt-BR"))[:10]) {
		t.Error("review item does not show the chosen answer")
	}

	app.Client(t).HTMX().Get("/review?items=").AssertOK().AssertDontSee(`data-testid="review-item"`)

	for _, bad := range []string{"x", q1.ID + ":z", q1.ID, "<script>:a", strings.Repeat(q1.ID+":a,", 201)} {
		res := app.Client(t).HTMX().Get("/review?items=" + url.QueryEscape(bad))
		if res.Status() != http.StatusBadRequest {
			t.Errorf("items=%.40q: status %d, want 400", bad, res.Status())
		}
	}
}
