package quiz

import (
	"encoding/json"
	"math/rand/v2"
	"slices"
	"strings"
	"testing"
	"testing/fstest"
)

func both(s string) Text { return Text{"en": s, "pt-BR": s + " (pt)"} }

func valid(id string, d Difficulty) Question {
	alts := make([]Alternative, AlternativeCount)
	for i := range alts {
		letter := string(rune('a' + i))
		alts[i] = Alternative{
			ID:   letter,
			Text: both("option " + letter + " of " + id),
			Why:  both("wrong because " + letter),
		}
	}

	alts[0].Correct = true
	alts[0].Why = nil

	return Question{
		ID:           id,
		Difficulty:   d,
		Tags:         []string{"basics"},
		Question:     both("What is " + id + "?"),
		Explanation:  both("Because."),
		Alternatives: alts,
		Sources:      []Source{{Title: "Spec", URL: "https://go.dev/ref/spec", Kind: "spec"}},
	}
}

func shard(t *testing.T, qs ...Question) *fstest.MapFile {
	t.Helper()

	b, err := json.Marshal(qs)
	if err != nil {
		t.Fatal(err)
	}

	return &fstest.MapFile{Data: b}
}

func TestValidate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		mutate func(q *Question)
		want   string
	}{
		{"bad id", func(q *Question) { q.ID = "Bad ID" }, "kebab-case"},
		{"bad difficulty", func(q *Question) { q.Difficulty = "trivial" }, "difficulty"},
		{"no tags", func(q *Question) { q.Tags = nil }, "tag"},
		{"missing pt-BR question", func(q *Question) { delete(q.Question, "pt-BR") }, "question: missing pt-BR"},
		{"unknown locale", func(q *Question) { q.Explanation["es"] = "x" }, "unknown locale"},
		{"four alternatives", func(q *Question) { q.Alternatives = q.Alternatives[:4] }, "exactly 5 alternatives"},
		{"two correct", func(q *Question) { q.Alternatives[1].Correct = true }, "exactly 1 correct"},
		{"none correct", func(q *Question) { q.Alternatives[0].Correct = false }, "exactly 1 correct"},
		{"wrong without why", func(q *Question) { q.Alternatives[2].Why = nil }, "alternative c why: missing en"},
		{"ids out of order", func(q *Question) { q.Alternatives[1].ID = "e" }, `id must be "b"`},
		{"repeated alternative", func(q *Question) { q.Alternatives[3].Text = q.Alternatives[2].Text }, "repeats"},
		{"no sources", func(q *Question) { q.Sources = nil }, "1–3 sources"},
		{"four sources", func(q *Question) {
			q.Sources = slices.Repeat(q.Sources, 4)
		}, "1–3 sources"},
		{"http source", func(q *Question) { q.Sources[0].URL = "http://go.dev" }, "https"},
		{"relative source", func(q *Question) { q.Sources[0].URL = "/ref/spec" }, "https"},
		{"bad kind", func(q *Question) { q.Sources[0].Kind = "tweet" }, "kind"},
		{"no title", func(q *Question) { q.Sources[0].Title = " " }, "missing title"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			q := valid("sample", Easy)
			tt.mutate(&q)

			err := Validate([]Question{q})
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("Validate() = %v, want error containing %q", err, tt.want)
			}
		})
	}
}

func TestValidateAcrossQuestions(t *testing.T) {
	t.Parallel()

	dupID := valid("same", Easy)
	other := valid("same", Hard)
	other.Question = both("Something else")

	if err := Validate([]Question{dupID, other}); err == nil || !strings.Contains(err.Error(), "duplicate id") {
		t.Errorf("Validate(duplicate ids) = %v, want duplicate id", err)
	}

	a, b := valid("one", Easy), valid("two", Easy)
	b.Question = Text{"en": "  what IS one? ", "pt-BR": "x"}

	if err := Validate(
		[]Question{a, b},
	); err == nil ||
		!strings.Contains(err.Error(), `same question and code as "one"`) {
		t.Errorf("Validate(duplicate text) = %v, want duplicate question", err)
	}

	b.Code = "fmt.Println(1)"
	if err := Validate([]Question{a, b}); err != nil {
		t.Errorf("Validate(same text, different code) = %v, want nil", err)
	}

	if err := Validate([]Question{valid("ok", Medium)}); err != nil {
		t.Errorf("Validate(valid) = %v, want nil", err)
	}
}

func TestLoad(t *testing.T) {
	t.Parallel()

	fsys := fstest.MapFS{
		"b.json":   shard(t, valid("hard-one", Hard), valid("easy-two", Easy)),
		"a.json":   shard(t, valid("very-hard-one", VeryHard), valid("very-easy-one", VeryEasy)),
		"notes.md": &fstest.MapFile{Data: []byte("ignored")},
	}

	bank, err := Load(fsys)
	if err != nil {
		t.Fatal(err)
	}

	var got []string
	for _, e := range bank.Index() {
		got = append(got, e.ID)
	}

	want := []string{"very-easy-one", "easy-two", "hard-one", "very-hard-one"}
	if !slices.Equal(got, want) {
		t.Errorf("Index() = %v, want %v", got, want)
	}

	if q, ok := bank.Get("hard-one"); !ok || q.Difficulty != Hard {
		t.Errorf("Get(hard-one) = %v, %v", q.ID, ok)
	}

	if _, ok := bank.Get("missing"); ok {
		t.Error("Get(missing) found a question")
	}

	if bank.First().ID != "very-easy-one" || bank.Len() != 4 || bank.CountBy()[Hard] != 1 {
		t.Errorf("First/Len/CountBy = %s/%d/%v", bank.First().ID, bank.Len(), bank.CountBy())
	}
}

func TestLoadErrors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		fsys fstest.MapFS
		want string
	}{
		{"empty", fstest.MapFS{}, "no question shards"},
		{"unknown field", fstest.MapFS{"x.json": {Data: []byte(`[{"id":"a","answer":"b"}]`)}}, "unknown field"},
		{"not an array", fstest.MapFS{"x.json": {Data: []byte(`{"id":"a"}`)}}, "decode x.json"},
		{"trailing data", fstest.MapFS{"x.json": {Data: []byte(`[] []`)}}, "trailing data"},
		{"invalid question", fstest.MapFS{"x.json": {Data: []byte(`[{"id":"a"}]`)}}, "exactly 5 alternatives"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if _, err := Load(tt.fsys); err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("Load() = %v, want error containing %q", err, tt.want)
			}
		})
	}
}

func TestShuffled(t *testing.T) {
	t.Parallel()

	q := valid("shuffle", Easy)
	r := rand.New(rand.NewPCG(1, 2))

	orders := map[string]bool{}

	for range 50 {
		alts := q.Shuffled(r)

		var ids strings.Builder
		for _, a := range alts {
			ids.WriteString(a.ID)
		}

		orders[ids.String()] = true

		sorted := slices.SortedFunc(
			slices.Values(alts),
			func(a, b Alternative) int { return strings.Compare(a.ID, b.ID) },
		)
		if !slices.EqualFunc(sorted, q.Alternatives, func(a, b Alternative) bool { return a.ID == b.ID }) {
			t.Fatalf("Shuffled() lost alternatives: %v", ids.String())
		}
	}

	if len(orders) < 10 {
		t.Errorf("Shuffled() produced %d distinct orders in 50 runs, want at least 10", len(orders))
	}

	if q.Alternatives[0].ID != "a" {
		t.Error("Shuffled() modified the question")
	}
}

func TestQuestionHelpers(t *testing.T) {
	t.Parallel()

	q := valid("helpers", Easy)

	if q.Correct().ID != "a" {
		t.Errorf("Correct() = %q, want a", q.Correct().ID)
	}

	if a, ok := q.Alternative("c"); !ok || a.ID != "c" {
		t.Errorf("Alternative(c) = %q, %v", a.ID, ok)
	}

	if _, ok := q.Alternative("z"); ok {
		t.Error("Alternative(z) found")
	}

	if got := (Text{"en": "hi"}).In("pt-BR"); got != "hi" {
		t.Errorf("In(pt-BR) fallback = %q, want hi", got)
	}

	if Difficulty("x").Valid() || !VeryHard.Valid() || VeryHard.Rank() != 4 {
		t.Error("Difficulty Valid/Rank wrong")
	}
}

// TestEmbeddedBank is the schema test of the real question bank.
func TestEmbeddedBank(t *testing.T) {
	t.Parallel()

	bank, err := Load(Embedded())
	if err != nil {
		t.Fatalf("embedded bank is invalid:\n%v", err)
	}

	if bank.Len() == 0 {
		t.Fatal("embedded bank is empty")
	}
}
