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
