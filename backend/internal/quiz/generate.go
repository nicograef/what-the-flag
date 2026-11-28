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

// varietyWindow is the span of positions, the drawn one included, in which no language or currency is the correct answer twice.
const varietyWindow = 8

// varietyStep is one relaxation of the variety rules: the type to skip and the values a correct answer avoids.
type varietyStep struct {
	skip  QuestionType
	avoid map[string]bool
}

// Generate draws the question at position len(stored) of a quiz whose questions by position are stored.
// It shuffles the level's window and takes the first type with an unused target within the fame ceiling,
// then that target and one of its cases, each uniformly. When nothing fits it retries without the ceiling,
// then with every type. Each pass relaxes the variety rules in steps: no type twice in a row, and no language
// or currency the correct answer twice within varietyWindow positions. It returns errQuizExhausted when every
// pool country was a target.
func Generate(cat Catalogue, stored []Question, rnd Rand) (Question, error) {
	pool := cat.Pool()
	used := make(map[string]bool, len(stored))
	for _, q := range stored {
		used[q.Target] = true
	}
	unused := make([]*country.Country, 0, len(pool))
	for i := range pool {
		if !used[pool[i].Code] {
			unused = append(unused, &pool[i])
		}
	}
	if len(unused) == 0 {
		return Question{}, errQuizExhausted
	}
	position := len(stored)
	var last QuestionType
	if position > 0 {
		last = stored[position-1].Type
	}
	recent := map[string]bool{}
	for _, q := range stored[max(0, position-varietyWindow+1):] {
		if q.Type.Answer == AttrLanguage || q.Type.Answer == AttrCurrency {
			recent[q.Options[q.Correct]] = true
		}
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
	// The variety rules relax in steps: both, then only the value rule, then none. A step that would retry
	// the one before, because nothing was skipped or avoided, is left out.
	steps := []varietyStep{{last, recent}}
	if position > 0 {
		steps = append(steps, varietyStep{avoid: recent})
	}
	if len(recent) > 0 {
		steps = append(steps, varietyStep{})
	}
	targets := make([]*country.Country, 0, len(unused))
	var tried []QuestionType
	triedCeiling := 0
	for _, pass := range passes {
		// A pass equal to the one before has nothing left to try.
		if pass.ceiling == triedCeiling && slices.Equal(pass.types, tried) {
			continue
		}
		tried, triedCeiling = pass.types, pass.ceiling
		for _, step := range steps {
			types := slices.Clone(pass.types)
			rnd.Shuffle(len(types), func(i, j int) { types[i], types[j] = types[j], types[i] })
			for _, t := range types {
				if t == step.skip {
					continue
				}
				targets = targets[:0]
				for _, c := range unused {
					if c.Fame <= pass.ceiling && eligible(t, c) && !stale(t, c, step.avoid) {
						targets = append(targets, c)
					}
				}
				// A target whose case draws no question leaves the list, and another is picked.
				for len(targets) > 0 {
					i := rnd.IntN(len(targets))
					cases := targetCases(t, targets[i])
					if q, ok := draw(cat, pool, cases[rnd.IntN(len(cases))], level, step.avoid, rnd); ok {
						return q, nil
					}
					targets[i] = targets[len(targets)-1]
					targets = targets[:len(targets)-1]
				}
			}
		}
	}
	return Question{}, errPoolTooSmall
}

// stale reports whether every value c has for t's answer is in avoid, the recent correct answers.
func stale(t QuestionType, c *country.Country, avoid map[string]bool) bool {
	vs := values(c, t.Answer)
	return len(avoid) > 0 && len(vs) > 0 && !slices.ContainsFunc(vs, func(v string) bool { return !avoid[v] })
}
