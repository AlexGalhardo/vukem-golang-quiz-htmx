package quiz

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"strings"
)

// Limits of the question schema.
const (
	AlternativeCount = 5
	MinSources       = 1
	MaxSources       = 3
	maxIDLen         = 64
)

var slugRE = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// ValidID reports whether id has the shape of a question id (kebab-case, at
// most 64 characters); handlers use it to reject input before a lookup.
func ValidID(id string) bool { return len(id) <= maxIDLen && slugRE.MatchString(id) }

// SourceKinds lists the accepted Source.Kind values.
func SourceKinds() []string {
	return []string{
		"spec", "faq", "effective-go", "memory-model", "doc", "blog",
		"reddit", "forum", "video", "talk", "article", "book", "source-code", "issue",
	}
}

// ValidationError is one problem with one question.
type ValidationError struct {
	ID      string
	Message string
}

func (e *ValidationError) Error() string { return fmt.Sprintf("question %q: %s", e.ID, e.Message) }

// Validate checks every schema rule on qs and across them (unique ids, no
// duplicate questions). It returns all problems joined, or nil.
func Validate(qs []Question) error {
	var errs []error

	seenID := map[string]bool{}
	seenText := map[string]string{}

	for i, q := range qs {
		id := q.ID
		if id == "" {
			id = fmt.Sprintf("#%d", i)
		}

		for _, msg := range validateQuestion(q) {
			errs = append(errs, &ValidationError{ID: id, Message: msg})
		}

		if q.ID != "" {
			if seenID[q.ID] {
				errs = append(errs, &ValidationError{ID: id, Message: "duplicate id"})
			}

			seenID[q.ID] = true
		}

		key := normalize(q.Question[DefaultLocale] + q.Code)
		if key == "" {
			continue
		}

		if other, ok := seenText[key]; ok {
			errs = append(errs, &ValidationError{ID: id, Message: fmt.Sprintf("same question and code as %q", other)})
		} else {
			seenText[key] = id
		}
	}

	return errors.Join(errs...)
}

func validateQuestion(q Question) []string {
	var p []string

	add := func(format string, args ...any) { p = append(p, fmt.Sprintf(format, args...)) }

	if !ValidID(q.ID) {
		add("id must be kebab-case, at most %d characters", maxIDLen)
	}

	if !q.Difficulty.Valid() {
		add("difficulty %q is not one of %v", q.Difficulty, Difficulties())
	}

	if len(q.Tags) == 0 {
		add("at least one tag is required")
	}

	for _, t := range q.Tags {
		if !slugRE.MatchString(t) {
			add("tag %q must be kebab-case", t)
		}
	}

	p = append(p, checkText("question", q.Question)...)
	p = append(p, checkText("explanation", q.Explanation)...)
	p = append(p, checkAlternatives(q.Alternatives)...)
	p = append(p, checkSources(q.Sources)...)

	return p
}

func checkText(field string, t Text) []string {
	var p []string

	for _, l := range Locales() {
		if strings.TrimSpace(t[l]) == "" {
			p = append(p, fmt.Sprintf("%s: missing %s text", field, l))
		}
	}

	for l := range t {
		if !slices.Contains(Locales(), l) {
			p = append(p, fmt.Sprintf("%s: unknown locale %q", field, l))
		}
	}

	return p
}

func checkAlternatives(alts []Alternative) []string {
	if len(alts) != AlternativeCount {
		return []string{fmt.Sprintf("needs exactly %d alternatives, has %d", AlternativeCount, len(alts))}
	}

	var p []string

	correct := 0
	texts := map[string]bool{}

	for i, a := range alts {
		want := string(rune('a' + i))
		if a.ID != want {
			p = append(p, fmt.Sprintf("alternative %d: id must be %q, got %q", i+1, want, a.ID))
		}

		p = append(p, checkText("alternative "+want+" text", a.Text)...)

		if a.Correct {
			correct++
		} else {
			p = append(p, checkText("alternative "+want+" why", a.Why)...)
		}

		// Case and spacing only: punctuation is meaningful in code-literal
		// alternatives ({"age":30} vs {"age":"30"}).
		if k := strings.Join(strings.Fields(strings.ToLower(a.Text[DefaultLocale])), " "); k != "" {
			if texts[k] {
				p = append(p, fmt.Sprintf("alternative %s repeats another alternative", want))
			}

			texts[k] = true
		}
	}

	if correct != 1 {
		p = append(p, fmt.Sprintf("needs exactly 1 correct alternative, has %d", correct))
	}

	return p
}

func checkSources(srcs []Source) []string {
	var p []string

	if len(srcs) < MinSources || len(srcs) > MaxSources {
		p = append(p, fmt.Sprintf("needs %d–%d sources, has %d", MinSources, MaxSources, len(srcs)))
	}

	for i, s := range srcs {
		if strings.TrimSpace(s.Title) == "" {
			p = append(p, fmt.Sprintf("source %d: missing title", i+1))
		}

		u, err := url.Parse(s.URL)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			p = append(p, fmt.Sprintf("source %d: url %q must be an absolute https URL", i+1, s.URL))
		}

		if !slices.Contains(SourceKinds(), s.Kind) {
			p = append(p, fmt.Sprintf("source %d: kind %q is not one of %v", i+1, s.Kind, SourceKinds()))
		}
	}

	return p
}
