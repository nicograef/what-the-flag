package quiz

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

// maxNameRunes caps a player name, counted after normalization.
const maxNameRunes = 20

// NormalizeName returns the NFKC form of raw with whitespace trimmed and collapsed.
// It returns ErrInvalidName when the result is empty, too long, or holds a rune
// other than a letter, mark, digit, space, '_', '-' or '.'.
func NormalizeName(raw string) (string, error) {
	name := strings.Join(strings.Fields(norm.NFKC.String(raw)), " ")
	if name == "" || utf8.RuneCountInString(name) > maxNameRunes {
		return "", ErrInvalidName
	}
	for _, r := range name {
		ok := unicode.IsLetter(r) || unicode.IsMark(r) || unicode.IsDigit(r) ||
			r == ' ' || r == '_' || r == '-' || r == '.'
		if !ok {
			return "", ErrInvalidName
		}
	}
	return name, nil
}
