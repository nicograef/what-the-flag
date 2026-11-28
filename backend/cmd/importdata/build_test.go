package main

import (
	"maps"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/nicograef/what-the-flag/internal/country"
)

func TestImporterRejects(t *testing.T) {
	root, err := os.OpenRoot("../../..")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = root.Close() }()
	src, err := readSources(root)
	if err != nil {
		t.Fatal(err)
	}
	if _, problems := build(src); len(problems) > 0 {
		t.Fatalf("the real sources fail: %q", problems)
	}
	// regional returns a copy of src whose entry for lang edit changed.
	regional := func(lang string, edit func(*regionalLanguage)) sources {
		s := src
		s.regional = maps.Clone(src.regional)
		r := s.regional[lang]
		r.SpokenIn = slices.Clone(r.SpokenIn)
		edit(&r)
		s.regional[lang] = r
		return s
	}
	tests := []struct {
		name string
		src  sources
		// dataset edits the built dataset before validate runs again; nil validates the build alone.
		dataset func(*country.Dataset)
		want    string
	}{
		{"spokenIn names an official country", regional("ca", func(r *regionalLanguage) {
			r.SpokenIn = slices.Insert(r.SpokenIn, 0, "AD")
		}), nil, "spokenIn AD is a country it is official in"},
		{"asymmetric look-alike", src, func(ds *country.Dataset) {
			i := slices.IndexFunc(ds.Countries, func(c country.Country) bool { return c.Code == "ID" })
			ds.Countries[i].Lookalikes = nil
		}, "MC: lookalike ID does not list it back"},
		{"no subregion", src, func(ds *country.Dataset) {
			ds.Countries[0].Subregion = ""
		}, "AD: no subregion"},
		{"source is no URL", regional("ca", func(r *regionalLanguage) {
			r.Source = "a note"
		}), nil, `source "a note" is not an https URL`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ds, got := build(tt.src)
			if tt.dataset != nil {
				tt.dataset(&ds)
				var p problems
				validate(ds, &p)
				got = p
			}
			if !slices.ContainsFunc(got, func(p string) bool { return strings.Contains(p, tt.want) }) {
				t.Fatalf("problems %q lack %q", got, tt.want)
			}
		})
	}
}
