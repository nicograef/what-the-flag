package quiz

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeName(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    string
		wantErr error
	}{
		{"empty", "", "", ErrInvalidName},
		{"only spaces", " \t ", "", ErrInvalidName},
		{"one rune", "a", "a", nil},
		{"20 runes", strings.Repeat("ä", 20), strings.Repeat("ä", 20), nil},
		{"21 runes", strings.Repeat("a", 21), "", ErrInvalidName},
		{"NFD umlaut composes", "Gräf", "Gräf", nil},
		{"full-width letters fold", "Ｎｉｃｏ１", "Nico1", nil},
		{"Hindi with marks", "प्रिया", "प्रिया", nil},
		{"whitespace trims and collapses", "  Nico \t\n Gräf  ", "Nico Gräf", nil},
		{"allowed punctuation", "a_b-c.d", "a_b-c.d", nil},
		{"forbidden rune", "Nico!", "", ErrInvalidName},
		{"only punctuation", "_-.", "", ErrInvalidName},
		{"Hangul filler", "\u3164\u3164", "", ErrInvalidName},
		{"Hangul choseong filler", "\u115f", "", ErrInvalidName},
		{"halfwidth Hangul filler in a name", "Nico\uffa0", "", ErrInvalidName},
		{"variation selector", "Nico\ufe0f", "", ErrInvalidName},
		{"lone mark", "\u0301", "", ErrInvalidName},
		{"mark after a space", "Nico \u0301", "", ErrInvalidName},
		{"two marks on a letter", "x\u0301\u0302", "x\u0301\u0302", nil},
		{"three marks on a letter", "x\u0301\u0302\u0303", "", ErrInvalidName},
		{"repeated mark", "x\u0301\u0301", "", ErrInvalidName},
		{"Burmese Kyaw with four marks", "ကျော်", "ကျော်", nil},
		{"pointed Hebrew", "שָּׁ", "שָּׁ", nil},
		{"four Thai marks on a letter", "ก\u0e48\u0e49\u0e4a\u0e4b", "ก\u0e48\u0e49\u0e4a\u0e4b", nil},
		{"five Thai marks on a letter", "ก\u0e48\u0e49\u0e4a\u0e4b\u0e4c", "", ErrInvalidName},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeName(tt.raw)
			if got != tt.want || !errors.Is(err, tt.wantErr) {
				t.Errorf("NormalizeName(%q) = %q, %v; want %q, %v", tt.raw, got, err, tt.want, tt.wantErr)
			}
		})
	}
}
