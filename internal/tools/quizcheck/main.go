// Command quizcheck validates question shards and prints counts per
// difficulty. With no arguments it checks the embedded bank; with file
// arguments it checks only those files (together), which lets writers
// validate a shard in progress without the others:
//
//	go run ./internal/tools/quizcheck internal/quiz/data/questions/concurrency.json
package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"testing/fstest"

	"github.com/AlexGalhardo/vukem-golang-quiz-htmx/internal/quiz"
)

func main() {
	fsys, err := source(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	bank, err := quiz.Load(fsys)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	counts := bank.CountBy()
	for _, d := range quiz.Difficulties() {
		fmt.Printf("%-10s %d\n", d, counts[d])
	}

	fmt.Printf("%-10s %d\n", "total", bank.Len())
}

func source(files []string) (fs.FS, error) {
	if len(files) == 0 {
		return quiz.Embedded(), nil
	}

	m := fstest.MapFS{}

	for _, f := range files {
		data, err := os.ReadFile(f) //nolint:gosec // paths come from the developer's command line
		if err != nil {
			return nil, err
		}

		m[filepath.Base(f)] = &fstest.MapFile{Data: data}
	}

	return m, nil
}
