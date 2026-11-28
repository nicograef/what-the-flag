package quiz

import (
	"errors"

	"github.com/nicograef/what-the-flag/internal/country"
)

// errQuizExhausted ends a run as completed; errPoolTooSmall means the catalogue cannot fill any allowed type.
var (
	errQuizExhausted = errors.New("quiz: no unused country left")
	errPoolTooSmall  = errors.New("quiz: pool too small for any allowed question type")
)

// maxTier is the hardest question type tier allowed at position.
func maxTier(position int) int { return min(4, 1+position/5) }

// maxFame is the least famous country tier preferred at position.
func maxFame(position int) int { return min(3, 1+position/8) }

// Generate draws the question at position of a quiz whose stored targets are used.
// It returns errQuizExhausted when every pool country was a target.
func Generate(cat Catalogue, position int, used map[string]bool, rnd Rand) (Question, error) {
	pool := cat.Pool()
	unused := make([]*country.Country, 0, len(pool))
	famous := make([]*country.Country, 0, len(pool))
	for i := range pool {
		c := &pool[i]
		if used[c.Code] {
			continue
		}
		unused = append(unused, c)
		if c.Fame <= maxFame(position) {
			famous = append(famous, c)
		}
	}
	if len(unused) == 0 {
		return Question{}, errQuizExhausted
	}
	candidates := famous
	if len(candidates) == 0 {
		candidates = unused
	}
	target := candidates[rnd.IntN(len(candidates))]

	types := make([]QuestionType, 0, len(Types))
	for _, t := range Types {
		if t.Tier <= maxTier(position) {
			types = append(types, t)
		}
	}
	rnd.Shuffle(len(types), func(i, j int) { types[i], types[j] = types[j], types[i] })
	for _, t := range types {
		cases := targetCases(t, target)
		if len(cases) == 0 {
			continue
		}
		if q, ok := Draw(cat, cases[rnd.IntN(len(cases))], 1, rnd); ok {
			return q, nil
		}
	}
	return Question{}, errPoolTooSmall
}
