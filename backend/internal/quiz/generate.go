package quiz

import (
	"errors"
	"slices"

	"github.com/nicograef/what-the-flag/internal/country"
)

// errQuizExhausted ends a run as completed; errPoolTooSmall means the catalogue cannot fill any type.
var (
	errQuizExhausted = errors.New("quiz: no unused country left")
	errPoolTooSmall  = errors.New("quiz: pool too small for any question type")
)

// maxLevel is the last level; the ladder stays there from position 45 on.
const maxLevel = 10

// Level is the difficulty level of a 0-based run position: one per five questions, from 1 to 10.
func Level(position int) int { return min(maxLevel, 1+position/5) }

// fameCeiling is the least famous fame tier a level prefers for targets and first-group distractors.
func fameCeiling(level int) int {
	switch {
	case level <= 2:
		return 1
	case level <= 5:
		return 2
	}
	return 3
}

// window returns the types a level asks: tiers level-2 to level, extended one tier down
// while it holds fewer than four types, as far as tier 1.
func window(level int) []QuestionType {
	for low := level - 2; ; low-- {
		var types []QuestionType
		for _, t := range Types {
			if t.Tier >= low && t.Tier <= level {
				types = append(types, t)
			}
		}
		if len(types) >= 4 || low <= 1 {
			return types
		}
	}
}

// Generate draws the question at position of a quiz whose stored targets are used.
// It shuffles the level's window and takes the first type with an unused target within the fame ceiling,
// then that target and one of its cases, each uniformly. When nothing fits it retries without the ceiling,
// then with every type. It returns errQuizExhausted when every pool country was a target.
func Generate(cat Catalogue, position int, used map[string]bool, rnd Rand) (Question, error) {
	pool := cat.Pool()
	unused := make([]*country.Country, 0, len(pool))
	for i := range pool {
		if !used[pool[i].Code] {
			unused = append(unused, &pool[i])
		}
	}
	if len(unused) == 0 {
		return Question{}, errQuizExhausted
	}
	level := Level(position)
	passes := []struct {
		types   []QuestionType
		ceiling int
	}{
		{window(level), fameCeiling(level)},
		{window(level), 3},
		{Types, 3},
	}
	targets := make([]*country.Country, 0, len(unused))
	for _, pass := range passes {
		types := slices.Clone(pass.types)
		rnd.Shuffle(len(types), func(i, j int) { types[i], types[j] = types[j], types[i] })
		for _, t := range types {
			targets = targets[:0]
			for _, c := range unused {
				if c.Fame <= pass.ceiling && eligible(t, c) {
					targets = append(targets, c)
				}
			}
			// A target whose case draws no question leaves the list, and another is picked.
			for len(targets) > 0 {
				i := rnd.IntN(len(targets))
				cases := targetCases(t, targets[i])
				if q, ok := draw(cat, pool, cases[rnd.IntN(len(cases))], level, rnd); ok {
					return q, nil
				}
				targets[i] = targets[len(targets)-1]
				targets = targets[:len(targets)-1]
			}
		}
	}
	return Question{}, errPoolTooSmall
}
