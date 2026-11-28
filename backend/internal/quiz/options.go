package quiz

import (
	"slices"
	"strings"

	"github.com/nicograef/what-the-flag/internal/country"
)

// minRegion is the region size, target included, from which distractor countries come from the target's region first.
const minRegion = 8

// Case is one entry of the question space: a type, a target code and, for a regional-language prompt, the language code.
type Case struct {
	Type   QuestionType
	Target string
	Prompt string
}

// optionSets splits a case's candidate options by status. True holds the correct answers; Contested holds the
// answers a player could defend though they are not true. False holds every other candidate, in ordered groups.
type optionSets struct {
	True      []string
	Contested []string
	False     [][]string
}

// Cases enumerates the question space: every type with every pool target and, for a prompt type, every prompt.
func Cases(cat Catalogue) []Case {
	pool := cat.Pool()
	var cases []Case
	for _, t := range Types {
		for i := range pool {
			cases = append(cases, targetCases(t, &pool[i])...)
		}
	}
	return cases
}

// targetCases returns the cases of one type and target: one per prompt for a prompt type, else one,
// and none for a target the type would give away.
func targetCases(t QuestionType, target *country.Country) []Case {
	if !eligible(t, target) {
		return nil
	}
	if t.Prompt != AttrRegionalLanguage {
		return []Case{{Type: t, Target: target.Code}}
	}
	cases := make([]Case, len(target.RegionalLanguages))
	for i, l := range target.RegionalLanguages {
		cases[i] = Case{Type: t, Target: target.Code, Prompt: l}
	}
	return cases
}

// eligible reports whether a type has a case for target: a regional-language prompt needs one of its
// regional languages, and a name-capital pair skips a target whose name and capital share a word.
func eligible(t QuestionType, target *country.Country) bool {
	switch {
	case t.Prompt == AttrRegionalLanguage:
		return len(target.RegionalLanguages) > 0
	case (t.Prompt == AttrName && t.Answer == AttrCapital) || (t.Prompt == AttrCapital && t.Answer == AttrName):
		return !giveaway(target)
	}
	return true
}

// giveaway reports whether a country's name and primary capital share a word in de or en,
// words split at spaces and hyphens, as Guatemala and Guatemala-Stadt do.
func giveaway(c *country.Country) bool {
	words := func(s string) []string {
		return strings.FieldsFunc(s, func(r rune) bool { return r == ' ' || r == '-' })
	}
	shares := func(a, b string) bool {
		bw := words(b)
		return slices.ContainsFunc(words(a), func(w string) bool { return slices.Contains(bw, w) })
	}
	return shares(c.Name.De, c.Capital.De) || shares(c.Name.En, c.Capital.En)
}

// Draw builds one question for c at a run level, or reports false when fewer than three wrong options fit.
// The correct option is the target when the true set holds it, else a uniform draw from the true set.
// The level orders the candidate groups.
func Draw(cat Catalogue, c Case, level int, rnd Rand) (Question, bool) {
	return draw(cat, cat.Pool(), c, level, rnd)
}

// draw is Draw over a pool the caller already holds, since Catalogue.Pool clones it.
func draw(cat Catalogue, pool []country.Country, c Case, level int, rnd Rand) (Question, bool) {
	sets := candidates(cat, pool, c, level)
	if len(sets.True) == 0 {
		return Question{}, false
	}
	correct := c.Target
	if !slices.Contains(sets.True, correct) {
		correct = sets.True[rnd.IntN(len(sets.True))]
	}

	answer := c.Type.Answer
	kind := labelKind(answer)
	lookalikes := flagType(c.Type) && answer.identifiesCountry()
	var texts []country.Names
	families := map[string]bool{}
	// mark records an option's text and family; the true and contested sets are marked so no candidate repeats them.
	mark := func(v string) {
		if l, ok := optionText(cat, pool, answer, v); ok {
			texts = append(texts, l)
		}
		if f := cat.Family(kind, v); kind != "" && f != "" {
			families[f] = true
		}
	}
	for _, v := range slices.Concat(sets.True, sets.Contested) {
		mark(v)
	}
	clashes := func(v string, l country.Names, picked []string) bool {
		if slices.ContainsFunc(texts, func(t country.Names) bool { return t.De == l.De || t.En == l.En }) {
			return true
		}
		if kind != "" && families[cat.Family(kind, v)] {
			return true
		}
		return lookalikes && slices.ContainsFunc(picked, func(p string) bool { return slices.Contains(countryOf(pool, p).Lookalikes, v) })
	}

	options := []string{correct}
	for _, group := range sets.False {
		group = slices.Clone(group)
		rnd.Shuffle(len(group), func(i, j int) { group[i], group[j] = group[j], group[i] })
		for _, v := range group {
			l, ok := optionText(cat, pool, answer, v)
			if !ok || l.De == "" || l.En == "" || clashes(v, l, options) {
				continue
			}
			mark(v)
			options = append(options, v)
			if len(options) == 4 {
				q := shuffled(c.Type, c.Target, options, rnd)
				q.Prompt = c.Prompt
				return q, true
			}
		}
	}
	return Question{}, false
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

// candidates returns c's true, contested and false sets. The false set holds three candidate groups, each in
// pool order: at levels 1 to 3 the target's continent within the level's fame ceiling, the rest of the continent,
// then the rest of the pool; from level 4 an empty group, the continent, then the rest. A continent of fewer than
// minRegion countries falls into the rest. A value candidate belongs to the best group of any country holding it.
func candidates(cat Catalogue, pool []country.Country, c Case, level int) optionSets {
	target := countryOf(pool, c.Target)
	if target == nil {
		return optionSets{}
	}
	continent := regionSize(pool, target.Region) >= minRegion
	group := func(o *country.Country) int {
		switch {
		case !continent || o.Region != target.Region:
			return 2
		case level <= 3 && o.Fame <= fameCeiling(level):
			return 0
		}
		return 1
	}
	answer := c.Type.Answer
	var sets optionSets
	if answer.identifiesCountry() {
		sets.True = []string{target.Code}
		if c.Type.Prompt == AttrRegionalLanguage {
			sets.True = nil
			for i := range pool {
				if slices.Contains(pool[i].RegionalLanguages, c.Prompt) {
					sets.True = append(sets.True, pool[i].Code)
				} else if holdsLanguage(cat, &pool[i], c.Prompt) {
					sets.Contested = append(sets.Contested, pool[i].Code)
				}
			}
		}
		if flagType(c.Type) {
			sets.Contested = append(sets.Contested, target.Lookalikes...)
		}
		sets.False = make([][]string, 3)
		for i := range pool {
			code := pool[i].Code
			if !slices.Contains(sets.True, code) && !slices.Contains(sets.Contested, code) {
				g := group(&pool[i])
				sets.False[g] = append(sets.False[g], code)
			}
		}
		return sets
	}

	sets.True = slices.Clone(values(target, answer))
	var direct []string
	switch answer {
	case AttrRegion:
		direct = slices.Clone(target.OtherRegions)
	case AttrLanguage:
		direct = slices.Concat(target.RegionalLanguages, target.BlockedLanguages)
	case AttrName, AttrFlag, AttrCapital, AttrCurrency, AttrRegionalLanguage:
	}
	if c.Type.Prompt == AttrFlag {
		for _, code := range target.Lookalikes {
			direct = append(direct, values(countryOf(pool, code), answer)...)
		}
	}
	kind := labelKind(answer)
	families := map[string]bool{}
	for _, v := range slices.Concat(sets.True, direct) {
		if f := cat.Family(kind, v); f != "" {
			families[f] = true
		}
	}
	// best holds each value's best candidate group; a true or contested value holds -1.
	best := make(map[string]int, 2*len(pool))
	for _, v := range sets.True {
		best[v] = -1
	}
	contest := func(v string) {
		if _, ok := best[v]; !ok {
			best[v] = -1
			sets.Contested = append(sets.Contested, v)
		}
	}
	for _, v := range direct {
		contest(v)
	}
	if len(families) > 0 {
		for i := range pool {
			for _, list := range valueLists(&pool[i], answer) {
				for _, v := range list {
					if families[cat.Family(kind, v)] {
						contest(v)
					}
				}
			}
		}
	}
	order := make([]string, 0, 2*len(pool))
	for i := range pool {
		g := group(&pool[i])
		for _, v := range values(&pool[i], answer) {
			switch prev, ok := best[v]; {
			case !ok:
				order = append(order, v)
				best[v] = g
			case g < prev:
				best[v] = g
			}
		}
	}
	sets.False = make([][]string, 3)
	for _, v := range order {
		sets.False[best[v]] = append(sets.False[best[v]], v)
	}
	return sets
}

// holdsLanguage reports whether any of c's language lists holds lang or a language of its family.
func holdsLanguage(cat Catalogue, c *country.Country, lang string) bool {
	family := cat.Family(country.LabelLanguage, lang)
	match := func(l string) bool {
		return l == lang || (family != "" && cat.Family(country.LabelLanguage, l) == family)
	}
	return slices.ContainsFunc(c.Languages, match) || slices.ContainsFunc(c.RegionalLanguages, match) || slices.ContainsFunc(c.BlockedLanguages, match)
}

// flagType reports whether a type shows a flag as its prompt or its options.
func flagType(t QuestionType) bool { return t.Prompt == AttrFlag || t.Answer == AttrFlag }

// valueLists returns c's lists that hold codes of an answer attribute's kind, whatever their status.
func valueLists(c *country.Country, a Attr) [][]string {
	switch a {
	case AttrRegion:
		return [][]string{{c.Region}, c.OtherRegions}
	case AttrLanguage:
		return [][]string{c.Languages, c.RegionalLanguages, c.BlockedLanguages}
	case AttrCurrency:
		return [][]string{c.Currencies}
	case AttrName, AttrFlag, AttrCapital, AttrRegionalLanguage:
	}
	return nil
}

// optionText is what an option displays: a country's answer text or an attribute label.
func optionText(cat Catalogue, pool []country.Country, a Attr, option string) (country.Names, bool) {
	if a.identifiesCountry() {
		c := countryOf(pool, option)
		if c == nil {
			return country.Names{}, false
		}
		return answerText(c, a), true
	}
	return cat.Label(labelKind(a), option)
}

// countryOf returns the pool country with code, or nil.
func countryOf(pool []country.Country, code string) *country.Country {
	for i := range pool {
		if pool[i].Code == code {
			return &pool[i]
		}
	}
	return nil
}

func regionSize(pool []country.Country, region string) int {
	n := 0
	for i := range pool {
		if pool[i].Region == region {
			n++
		}
	}
	return n
}
