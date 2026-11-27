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
	// maxStackedMarks caps the nonspacing marks on one letter or digit, which stack vertically.
	maxStackedMarks = 4
	// maxGenericMarks caps the script-neutral combining marks on one letter or digit,
	// the ones Zalgo text stacks.
	maxGenericMarks = 2
)

// NormalizeName returns the NFKC form of raw with whitespace trimmed and collapsed.
// It returns ErrInvalidName when the result is too long or has no letter or digit,
// or holds a rune other than a letter, mark, digit, space, '_', '-' or '.', a
// default-ignorable rune such as a Hangul filler, a mark that repeats the rune
// before it, or a mark beyond the caps on a letter or digit.
func NormalizeName(raw string) (string, error) {
	name := strings.Join(strings.Fields(norm.NFKC.String(raw)), " ")
	if utf8.RuneCountInString(name) > maxNameRunes {
		return "", ErrInvalidName
	}
	// onBase: the last rune other than a mark is a letter or digit.
	hasBase, onBase, stacked, generic, prev := false, false, 0, 0, rune(0)
	for _, r := range name {
		switch {
		case unicode.In(r, unicode.Other_Default_Ignorable_Code_Point, unicode.Variation_Selector):
			return "", ErrInvalidName
		case unicode.IsMark(r):
			if unicode.In(r, unicode.Mn, unicode.Me) {
				stacked++
			}
			if unicode.Is(unicode.Inherited, r) {
				generic++
			}
			if !onBase || r == prev || stacked > maxStackedMarks || generic > maxGenericMarks {
				return "", ErrInvalidName
			}
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			hasBase, onBase, stacked, generic = true, true, 0, 0
		case r == ' ' || r == '_' || r == '-' || r == '.':
			onBase = false
		default:
			return "", ErrInvalidName
		}
		prev = r
	}
	if !hasBase {
		return "", ErrInvalidName
	}
	return name, nil
}
