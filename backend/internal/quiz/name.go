package quiz

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const (
	// maxNameRunes caps a player name, counted after normalization.
	maxNameRunes = 20
	// maxMarksPerBase caps the combining marks on one letter or digit.
	maxMarksPerBase = 2
)

// NormalizeName returns the NFKC form of raw with whitespace trimmed and collapsed.
// It returns ErrInvalidName when the result is too long or has no letter or digit,
// or holds a rune other than a letter, mark, digit, space, '_', '-' or '.', a
// default-ignorable rune such as a Hangul filler, or a mark beyond the cap on a
// letter or digit.
func NormalizeName(raw string) (string, error) {
	name := strings.Join(strings.Fields(norm.NFKC.String(raw)), " ")
	if utf8.RuneCountInString(name) > maxNameRunes {
		return "", ErrInvalidName
	}
	// onBase: the last rune other than a mark is a letter or digit.
	hasBase, onBase, marks := false, false, 0
	for _, r := range name {
		switch {
		case unicode.In(r, unicode.Other_Default_Ignorable_Code_Point, unicode.Variation_Selector):
			return "", ErrInvalidName
		case unicode.IsMark(r):
			if marks++; !onBase || marks > maxMarksPerBase {
				return "", ErrInvalidName
			}
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			hasBase, onBase, marks = true, true, 0
		case r == ' ' || r == '_' || r == '-' || r == '.':
			onBase = false
		default:
			return "", ErrInvalidName
		}
	}
	if !hasBase {
		return "", ErrInvalidName
	}
	return name, nil
}
