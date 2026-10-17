package tests

import (
	"net/http"
	"strings"
	"testing"

	"github.com/AlexGalhardo/vukem/vukemtest"

	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/bootstrap"
	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/internal/settings"
)

func TestSecurity_Headers_Present(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)

	for _, target := range []string{"/", "/questions/does-not-exist", "/up"} {
		app.Client(t).Get(target).
			AssertHeader("X-Content-Type-Options", "nosniff").
			AssertHeader("X-Frame-Options", "DENY").
			AssertHeaderContains("Content-Security-Policy", "script-src 'self' 'nonce-").
			AssertHeaderContains("Content-Security-Policy", "frame-ancestors 'none'").
			AssertHeaderContains("Referrer-Policy", "origin").
			AssertHeaderMissing("Server")
	}
}

func TestSecurity_Cookies_NeverSet(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)
	id := bank(t).First().ID

	for _, target := range []string{
		"/", "/?lang=pt-BR", "/questions/" + id, "/questions/" + id + "/answers/a", "/questions/nope", "/up",
	} {
		app.Client(t).Get(target).AssertHeaderMissing("Set-Cookie")
		app.Client(t).HTMX().Get(target).AssertHeaderMissing("Set-Cookie")
	}
}

func TestSecurity_Methods_OnlyGet(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)
	id := bank(t).First().ID

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		for _, target := range []string{"/", "/questions/" + id, "/questions/" + id + "/answers/a"} {
			res := app.Client(t).Do(method, target, strings.NewReader("x=1"), "application/x-www-form-urlencoded")
			if res.Status() != http.StatusMethodNotAllowed {
				t.Errorf("%s %s = %d, want 405", method, target, res.Status())
			}
		}
	}

	app.Client(t).Do(http.MethodHead, "/questions/"+id, nil, "").AssertOK()
}

func TestSecurity_XSS_ParamsNotReflected(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)
	id := bank(t).First().ID
	payload := `"><script>alert(1)</script>`
	enc := "%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E"

	for _, target := range []string{
		"/?lang=" + enc,
		"/questions/" + id + "?lang=" + enc + "&order=" + enc,
		"/questions/" + id + "/answers/a?order=" + enc,
		"/questions/" + enc,
		"/questions/" + id + "/answers/" + enc,
	} {
		for _, c := range []*vukemtest.Client{app.Client(t), app.Client(t).HTMX()} {
			res := c.Get(target)
			if strings.Contains(res.Body(), payload) || strings.Contains(res.Body(), "<script>alert(1)") {
				t.Errorf("GET %s reflects the payload", target)
			}
		}
	}
}

func TestSecurity_PathTraversal_Rejected(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)

	for _, target := range []string{
		"/../go.mod",
		"/js/../../go.mod",
		"/js/%2e%2e/%2e%2e/go.mod",
		"/js/..%2f..%2fgo.mod",
		"/build/..%5c..%5cgo.mod",
		"/questions/..%2f..%2fgo.mod",
		"/questions/%2e%2e",
	} {
		res := app.Client(t).Get(target)
		if strings.Contains(res.Body(), "module github.com/") {
			t.Errorf("GET %s leaked go.mod", target)
		}

		if res.Status() == http.StatusOK && !strings.Contains(res.Body(), "<html") {
			t.Errorf("GET %s = 200 with non-page body", target)
		}
	}
}

func TestSecurity_Errors_NoInternals(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New, vukemtest.Options{Env: map[string]string{"APP_ENV": "production"}})

	for _, target := range []string{"/questions/nope", "/questions/nope/answers/a", "/nope"} {
		res := app.Client(t).Get(target).AssertNotFound()

		for _, leak := range []string{"goroutine ", ".go:", "runtime/", "panic"} {
			if strings.Contains(res.Body(), leak) {
				t.Errorf("GET %s body contains %q", target, leak)
			}
		}
	}
}

func TestSecurity_RateLimit_PerIP(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)

	var limited *vukemtest.Response

	for range rateLimitForTests + 1 {
		res := app.Client(t).Get("/questions/nope")
		if res.Status() == http.StatusTooManyRequests {
			limited = res

			break
		}
	}

	if limited == nil {
		t.Fatalf("no 429 after %d requests", rateLimitForTests+1)
	}

	if limited.Header("Retry-After") == "" {
		t.Error("429 without Retry-After")
	}

	// The health check is exempt: Railway polls it.
	app.Client(t).Get("/up").AssertOK()
}

const rateLimitForTests = settings.DefaultRateLimit

func TestSecurity_Oversized_Rejected(t *testing.T) {
	t.Parallel()

	app := vukemtest.New(t, bootstrap.New)

	res := app.Client(t).Get("/?lang=" + strings.Repeat("a", 64<<10))
	if res.Status() >= http.StatusInternalServerError {
		t.Errorf("huge query = %d, want a non-5xx answer", res.Status())
	}

	if strings.Contains(res.Body(), strings.Repeat("a", 1000)) {
		t.Error("huge query reflected")
	}
}
