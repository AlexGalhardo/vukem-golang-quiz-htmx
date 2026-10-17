// Package resources holds views and public assets. They are embedded in
// the binary; during development the files on disk are used instead so
// template edits show up on refresh.
package resources

import (
	"embed"
	"io/fs"
	"os"
)

// all: keeps build/.vite/manifest.json (a dot directory) in the binary.
//
//go:embed views all:public
var embedded embed.FS

// Views returns the html/template views.
func Views() fs.FS { return dirOrEmbedded("views") }

// Public returns the static assets served at /.
func Public() fs.FS { return dirOrEmbedded("public") }

// dirOrEmbedded serves files from disk during development so edits show up
// on refresh. Production always uses the embedded copy: the vukem starter
// prefers disk whenever resources/ exists in the working directory, so a
// production binary started from a checkout without a Vite build fails to
// render (see framework-feedback/quiz.md).
func dirOrEmbedded(dir string) fs.FS {
	if os.Getenv("APP_ENV") == "production" {
		return embeddedSub(dir)
	}

	if info, err := os.Stat("resources/" + dir); err == nil && info.IsDir() {
		return os.DirFS("resources/" + dir)
	}

	return embeddedSub(dir)
}

func embeddedSub(dir string) fs.FS {
	sub, err := fs.Sub(embedded, dir)
	if err != nil {
		panic(err) // unreachable: the directory is embedded above
	}

	return sub
}
