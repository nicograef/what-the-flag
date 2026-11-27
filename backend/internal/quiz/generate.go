package quiz

import (
	"slices"

	"github.com/nicograef/what-the-flag/internal/country"
)

// minRegion is the region size, target included, from which distractor countries come from the target's region first.
const minRegion = 8

// maxTier is the hardest question type tier allowed at position.
func maxTier(position int) int { return min(4, 1+position/5) }

// maxFame is the least famous country tier preferred at position.
func maxFame(position int) int { return min(3, 1+position/8) }

// Generate draws the question at position of a quiz whose stored targets are used.
// It returns ErrQuizExhausted when every pool country was a target.
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
		return Question{}, ErrQuizExhausted
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
		var options []string
		if t.Answer.identifiesCountry() {
			options = countryOptions(pool, target, t, rnd)
		} else {
			options = valueOptions(cat, pool, target, t.Answer, rnd)
		}
		if options != nil {
			return shuffled(t, target.Code, options, rnd), nil
		}
	}
	return Question{}, ErrPoolTooSmall
}

// countryOptions returns the target's code and three distractor codes, or nil when fewer than three qualify.
func countryOptions(pool []country.Country, target *country.Country, t QuestionType, rnd Rand) []string {
	region := make([]*country.Country, 0, len(pool))
	rest := make([]*country.Country, 0, len(pool))
	for i := range pool {
		c := &pool[i]
		switch {
		case c.Code == target.Code:
		case c.Region == target.Region:
			region = append(region, c)
		default:
			rest = append(rest, c)
		}
	}
	if len(region)+1 < minRegion {
		rest = append(rest, region...)
		region = nil
	}
	rnd.Shuffle(len(region), func(i, j int) { region[i], region[j] = region[j], region[i] })
	rnd.Shuffle(len(rest), func(i, j int) { rest[i], rest[j] = rest[j], rest[i] })

	flag := t.Prompt == AttrFlag || t.Answer == AttrFlag
	picked := make([]*country.Country, 1, 4)
	picked[0] = target
	for _, c := range slices.Concat(region, rest) {
		if clashes(c, picked, t.Answer, flag) {
			continue
		}
		picked = append(picked, c)
		if len(picked) == 4 {
			codes := make([]string, 4)
			for i, p := range picked {
				codes[i] = p.Code
			}
			return codes
		}
	}
	return nil
}

// clashes reports whether c shares an answer text with a picked country, or, in a flag type, is a look-alike of one.
func clashes(c *country.Country, picked []*country.Country, answer Attr, flag bool) bool {
	text := answerText(c, answer)
	for _, p := range picked {
		pt := answerText(p, answer)
		if text.De == pt.De || text.En == pt.En {
			return true
		}
		if flag && slices.Contains(p.Lookalikes, c.Code) {
			return true
		}
	}
	return false
}

// valueOptions returns one of the target's values and three values it lacks, or nil when fewer than three qualify.
func valueOptions(cat Catalogue, pool []country.Country, target *country.Country, answer Attr, rnd Rand) []string {
	own := values(target, answer)
	if len(own) == 0 {
		return nil
	}
	kind := labelKind(answer)
	seenCode := make(map[string]bool, 2*len(pool))
	var seen []country.Names
	taken := func(l country.Names) bool {
		return slices.ContainsFunc(seen, func(s country.Names) bool { return s.De == l.De || s.En == l.En })
	}
	for _, v := range own {
		seenCode[v] = true
		if l, ok := cat.Label(kind, v); ok {
			seen = append(seen, l)
		}
	}
	collect := func(inRegion bool) []string {
		var vs []string
		for i := range pool {
			c := &pool[i]
			if (c.Region == target.Region) != inRegion {
				continue
			}
			for _, v := range values(c, answer) {
				if !seenCode[v] {
					seenCode[v] = true
					vs = append(vs, v)
				}
			}
		}
		rnd.Shuffle(len(vs), func(i, j int) { vs[i], vs[j] = vs[j], vs[i] })
		return vs
	}
	candidates := collect(true)
	candidates = append(candidates, collect(false)...)

	options := []string{own[rnd.IntN(len(own))]}
	for _, v := range candidates {
		l, ok := cat.Label(kind, v)
		if !ok || taken(l) {
			continue
		}
		seen = append(seen, l)
		options = append(options, v)
		if len(options) == 4 {
			return options
		}
	}
	return nil
}

// shuffled builds the question from options whose first entry is the correct one.
func shuffled(t QuestionType, target string, options []string, rnd Rand) Question {
	order := [4]int{0, 1, 2, 3}
	rnd.Shuffle(4, func(i, j int) { order[i], order[j] = order[j], order[i] })
	q := Question{Type: t, Target: target}
	for i, o := range order {
		q.Options[i] = options[o]
		if o == 0 {
			q.Correct = i
		}
	}
	return q
}
