// Package quiz holds the question bank: the model, the loader that reads the
// embedded JSON shards, and the validation every question must pass before
// the app boots.
package quiz

import "slices"

// Difficulty is one of the five question levels.
type Difficulty string

// The five difficulties, from the easiest to the hardest.
const (
	VeryEasy Difficulty = "very-easy"
	Easy     Difficulty = "easy"
	Medium   Difficulty = "medium"
	Hard     Difficulty = "hard"
	VeryHard Difficulty = "very-hard"
)

// Difficulties returns every difficulty in ascending order.
func Difficulties() []Difficulty { return []Difficulty{VeryEasy, Easy, Medium, Hard, VeryHard} }

// Rank orders difficulties: 0 for very-easy up to 4 for very-hard, -1 when
// d is not a known difficulty.
func (d Difficulty) Rank() int { return slices.Index(Difficulties(), d) }

// Valid reports whether d is one of the five difficulties.
func (d Difficulty) Valid() bool { return d.Rank() >= 0 }

// Locales lists the languages every text must have; the first is the default.
func Locales() []string { return []string{"en", "pt-BR"} }

// DefaultLocale is the fallback language.
const DefaultLocale = "en"

// Text is a localized string keyed by locale.
type Text map[string]string

// In returns the text for locale, falling back to English.
func (t Text) In(locale string) string {
	if s, ok := t[locale]; ok && s != "" {
		return s
	}

	return t[DefaultLocale]
}

// Alternative is one of the five answers of a question.
type Alternative struct {
	ID      string `json:"id"`
	Correct bool   `json:"correct,omitempty"`
	Text    Text   `json:"text"`
	// Why explains why a wrong alternative is wrong (required unless Correct).
	Why Text `json:"why,omitempty"`
}

// Source is a reference that backs the answer.
type Source struct {
	Title string `json:"title"`
	URL   string `json:"url"`
	Kind  string `json:"kind"`
}

// Question is one quiz question.
type Question struct {
	ID           string        `json:"id"`
	Difficulty   Difficulty    `json:"difficulty"`
	Tags         []string      `json:"tags"`
	Code         string        `json:"code,omitempty"`
	Question     Text          `json:"question"`
	Explanation  Text          `json:"explanation"`
	Alternatives []Alternative `json:"alternatives"`
	Sources      []Source      `json:"sources"`
}

// Correct returns the correct alternative.
func (q Question) Correct() Alternative {
	for _, a := range q.Alternatives {
		if a.Correct {
			return a
		}
	}

	return Alternative{}
}

// Alternative returns the alternative with the given id.
func (q Question) Alternative(id string) (Alternative, bool) {
	for _, a := range q.Alternatives {
		if a.ID == id {
			return a, true
		}
	}

	return Alternative{}, false
}

// Shuffler is the signature of rand.Shuffle; math/rand/v2 is enough because
// the order is cosmetic.
type Shuffler func(n int, swap func(i, j int))

// Shuffled returns the alternatives in a random order; q is not modified.
// Pass rand.Shuffle in production and a seeded (*rand.Rand).Shuffle in tests.
func (q Question) Shuffled(shuffle Shuffler) []Alternative {
	alts := slices.Clone(q.Alternatives)
	shuffle(len(alts), func(i, j int) { alts[i], alts[j] = alts[j], alts[i] })

	return alts
}
