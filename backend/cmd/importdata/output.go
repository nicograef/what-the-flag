package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"path"
	"regexp"
	"slices"
	"strings"

	"github.com/nicograef/what-the-flag/internal/country"
)

// The importer owns these directories entirely: it deletes every file in them it did not write.
const (
	datasetDir = "backend/internal/country/dataset"
	flagsDir   = "frontend/public/flags"
)

var ownedDirs = []string{datasetDir, flagsDir}

// render returns every owned file's content, keyed by its repo-relative path.
func render(ds country.Dataset, src sources) (map[string][]byte, error) {
	// encoding/json writes map keys sorted, so each labels section is sorted by code.
	dataset, err := json.MarshalIndent(ds, "", "  ")
	if err != nil {
		return nil, err
	}
	files := map[string][]byte{
		path.Join(datasetDir, "countries.json"): append(dataset, '\n'),
		path.Join(datasetDir, "LICENSE"):        src.dataLicense,
		path.Join(flagsDir, "LICENSE"):          src.flagLicense,
	}
	var errs []error
	for _, c := range ds.Countries {
		svg, err := rewriteFlag(c.Code, src.flags[c.Code])
		if err != nil {
			errs = append(errs, err)
			continue
		}
		files[path.Join(flagsDir, c.FlagKey+".svg")] = svg
	}
	return files, errors.Join(errs...)
}

// rewriteFlag strips every trace of the code from a flag-icons SVG, so its file reveals no answer.
func rewriteFlag(code string, svg []byte) ([]byte, error) {
	lower := strings.ToLower(code)
	idAttr := `id="flag-icons-` + lower + `"`
	if n := bytes.Count(svg, []byte(idAttr)); n != 1 {
		return nil, fmt.Errorf("%s flag: want one %s, found %d", code, idAttr, n)
	}
	rootAttr := regexp.MustCompile(`^(\s*<svg\b[^>]*?)\s+` + regexp.QuoteMeta(idAttr))
	if !rootAttr.Match(svg) {
		return nil, fmt.Errorf("%s flag: %s is not an attribute of the root element", code, idAttr)
	}
	out := rootAttr.ReplaceAll(svg, []byte("$1"))
	out = regexp.MustCompile(`\b`+lower+`-`).ReplaceAll(out, []byte("f-"))
	if regexp.MustCompile(`\b`+lower+`\b`).Match(out) || bytes.Contains(out, []byte("flag-icons")) {
		return nil, fmt.Errorf("%s flag: the rewritten SVG still names %q or flag-icons", code, lower)
	}
	return out, nil
}

// write replaces the owned directories' content with files.
func write(root *os.Root, files map[string][]byte) error {
	for _, dir := range ownedDirs {
		if err := root.MkdirAll(dir, 0o755); err != nil {
			return err
		}
		stray, err := strayEntries(root, dir, files)
		if err != nil {
			return err
		}
		for _, name := range stray {
			if err := root.RemoveAll(name); err != nil {
				return err
			}
		}
	}
	for _, name := range slices.Sorted(maps.Keys(files)) {
		// 0644: the flags are served to every visitor, and git tracks no other mode.
		if err := root.WriteFile(name, files[name], 0o644); err != nil {
			return err
		}
	}
	return nil
}

// compare returns the sorted paths whose content differs from files, missing and stray ones included.
func compare(root *os.Root, files map[string][]byte) ([]string, error) {
	var diffs []string
	for _, dir := range ownedDirs {
		stray, err := strayEntries(root, dir, files)
		if err != nil {
			return nil, err
		}
		diffs = append(diffs, stray...)
	}
	for _, name := range slices.Sorted(maps.Keys(files)) {
		got, err := root.ReadFile(name)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return nil, err
		}
		if err != nil || !bytes.Equal(got, files[name]) {
			diffs = append(diffs, name)
		}
	}
	slices.Sort(diffs)
	return diffs, nil
}

// strayEntries lists the entries of an owned directory that files does not hold.
func strayEntries(root *os.Root, dir string, files map[string][]byte) ([]string, error) {
	entries, err := fs.ReadDir(root.FS(), dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var stray []string
	for _, e := range entries {
		name := path.Join(dir, e.Name())
		if _, ok := files[name]; !ok || e.IsDir() {
			stray = append(stray, name)
		}
	}
	return stray, nil
}
