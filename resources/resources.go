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
//go:embed views all:public lang
var embedded embed.FS

// Views returns the html/template views.
func Views() fs.FS { return dirOrEmbedded("views") }

// Lang returns the UI translations (en.json, pt-BR.json).
func Lang() fs.FS { return dirOrEmbedded("lang") }

// Public returns the static assets served at /.
func Public() fs.FS { return dirOrEmbedded("public") }

// dirOrEmbedded serves files from disk during development so edits show up
// on refresh; production always uses the embedded copy (same as the vukem
// v0.22.0 starter).
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
