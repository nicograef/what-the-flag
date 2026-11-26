// Command importdata builds the country dataset and the keyed flag files from data/.
//
// Exit codes: 0 done, 1 an input violates an invariant or, with -check, an owned file is stale.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
)

func main() {
	rootDir := flag.String("root", "..", "repository root")
	check := flag.Bool("check", false, "compare the owned files with the build instead of writing them")
	flag.Parse()
	os.Exit(run(*rootDir, *check, os.Stderr))
}

func run(rootDir string, check bool, stderr io.Writer) int {
	fail := func(lines ...string) int {
		for _, l := range lines {
			_, _ = fmt.Fprintln(stderr, l)
		}
		return 1
	}
	root, err := os.OpenRoot(rootDir)
	if err != nil {
		return fail(err.Error())
	}
	defer func() { _ = root.Close() }()

	src, err := readSources(root)
	if err != nil {
		return fail(err.Error())
	}
	ds, problems := build(src)
	if len(problems) > 0 {
		return fail(problems...)
	}
	files, err := render(ds, src)
	if err != nil {
		return fail(err.Error())
	}

	if !check {
		if err := write(root, files); err != nil {
			return fail(err.Error())
		}
		return 0
	}
	diffs, err := compare(root, files)
	if err != nil {
		return fail(err.Error())
	}
	if len(diffs) > 0 {
		return fail(append(diffs, "The generated files are stale; run `make data` and commit them.")...)
	}
	return 0
}
