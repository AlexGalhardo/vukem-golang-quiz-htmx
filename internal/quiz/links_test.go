//go:build links

package quiz

import (
	"net/http"
	"testing"
	"time"
)

// TestSourceLinks checks that every source URL answers 2xx/3xx. It needs the
// network, so it only runs with: go test -tags=links ./internal/quiz/...
func TestSourceLinks(t *testing.T) {
	t.Parallel()

	bank, err := Load(Embedded())
	if err != nil {
		t.Fatal(err)
	}

	client := &http.Client{Timeout: 20 * time.Second}

	for _, q := range bank.All() {
		for _, s := range q.Sources {
			t.Run(q.ID+"/"+s.URL, func(t *testing.T) {
				t.Parallel()

				req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, s.URL, http.NoBody)
				if err != nil {
					t.Fatal(err)
				}

				req.Header.Set("User-Agent", "Mozilla/5.0 (link checker; quiz.vukem.dev)")

				res, err := client.Do(req)
				if err != nil {
					t.Fatalf("GET %s: %v", s.URL, err)
				}
				defer res.Body.Close()

				// Some sites (Reddit, X) block bots with 403/429; report but do not fail.
				switch {
				case res.StatusCode < 400:
				case res.StatusCode == http.StatusForbidden || res.StatusCode == http.StatusTooManyRequests:
					t.Logf("GET %s = %d (bot protection, check by hand)", s.URL, res.StatusCode)
				default:
					t.Errorf("GET %s = %d", s.URL, res.StatusCode)
				}
			})
		}
	}
}
