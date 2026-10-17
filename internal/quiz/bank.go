package quiz

import (
	"bytes"
	"cmp"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"path"
	"slices"
	"strings"
)

//go:embed data/questions/*.json
var embedded embed.FS

// Embedded returns the question shards compiled into the binary.
func Embedded() fs.FS {
	sub, err := fs.Sub(embedded, "data/questions")
	if err != nil {
		panic(err) // unreachable: the directory is embedded above
	}

	return sub
}

// Bank is the validated, read-only question bank. It is safe for concurrent
// use because nothing mutates it after Load.
type Bank struct {
	questions []Question
	byID      map[string]int
}

// IndexEntry is the public summary of a question that the client uses to
// build its queue.
type IndexEntry struct {
	ID         string     `json:"id"`
	Difficulty Difficulty `json:"difficulty"`
}

// Load reads every *.json shard at the root of fsys (each a JSON array of
// questions), validates the whole bank and returns it ordered by difficulty,
// then shard name, then position in the shard. All problems are reported at
// once.
func Load(fsys fs.FS) (*Bank, error) {
	names, err := fs.Glob(fsys, "*.json")
	if err != nil {
		return nil, fmt.Errorf("list question shards: %w", err)
	}

	if len(names) == 0 {
		return nil, errors.New("no question shards (*.json) found")
	}

	slices.Sort(names)

	var (
		all  []Question
		errs []error
	)

	for _, name := range names {
		qs, err := readShard(fsys, name)
		if err != nil {
			errs = append(errs, err)
			continue
		}

		all = append(all, qs...)
	}

	if len(errs) > 0 {
		return nil, errors.Join(errs...)
	}

	if err := Validate(all); err != nil {
		return nil, err
	}

	slices.SortStableFunc(all, func(a, b Question) int { return cmp.Compare(a.Difficulty.Rank(), b.Difficulty.Rank()) })

	b := &Bank{questions: all, byID: make(map[string]int, len(all))}
	for i, q := range all {
		b.byID[q.ID] = i
	}

	return b, nil
}

func readShard(fsys fs.FS, name string) ([]Question, error) {
	data, err := fs.ReadFile(fsys, name)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", name, err)
	}

	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()

	var qs []Question
	if err := dec.Decode(&qs); err != nil {
		return nil, fmt.Errorf("decode %s: %w", path.Base(name), err)
	}

	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("decode %s: trailing data after the array", name)
	}

	return qs, nil
}

// Len returns the number of questions.
func (b *Bank) Len() int { return len(b.questions) }

// All returns the questions ordered by difficulty. The slice is a copy.
func (b *Bank) All() []Question { return slices.Clone(b.questions) }

// Get returns the question with the given id.
func (b *Bank) Get(id string) (Question, bool) {
	i, ok := b.byID[id]
	if !ok {
		return Question{}, false
	}

	return b.questions[i], true
}

// First returns the first question (the easiest).
func (b *Bank) First() Question { return b.questions[0] }

// Index lists every question id with its difficulty, in bank order.
func (b *Bank) Index() []IndexEntry {
	out := make([]IndexEntry, len(b.questions))
	for i, q := range b.questions {
		out[i] = IndexEntry{ID: q.ID, Difficulty: q.Difficulty}
	}

	return out
}

// CountBy returns how many questions each difficulty has.
func (b *Bank) CountBy() map[Difficulty]int {
	out := make(map[Difficulty]int, len(Difficulties()))
	for _, q := range b.questions {
		out[q.Difficulty]++
	}

	return out
}

// normalize folds case, punctuation and whitespace so near-identical
// questions in different shards are caught as duplicates.
func normalize(s string) string {
	var sb strings.Builder

	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			sb.WriteRune(r)
		case r > 127:
			sb.WriteRune(r)
		}
	}

	return sb.String()
}
